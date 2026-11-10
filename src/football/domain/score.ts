import type { ProbePingSeries } from '../../types'
import { taskLoss } from './carriers'
import { taskIdOf } from './history'
import { trafficUsed } from './format'
import type { HistoryResponse, MonitorNode } from './types'

export type StatKey = 'cpu' | 'mem' | 'dsk' | 'net' | 'upt' | 'png'
export const STAT_KEYS: StatKey[] = ['cpu', 'mem', 'dsk', 'net', 'upt', 'png']
export const STAT_LABELS: Record<StatKey, string> = {
  cpu: 'CPU',
  mem: '内存',
  dsk: '硬盘',
  net: '流量',
  upt: '在线',
  png: '延迟',
}
export type Tier = 'bronze' | 'silver' | 'gold'

export type NetKey = 'latency' | 'jitter' | 'loss'
export const NET_KEYS: NetKey[] = ['latency', 'jitter', 'loss']
export const NET_LABELS: Record<NetKey, string> = { latency: '延迟', jitter: '抖动', loss: '丢包' }
export const NET_WEIGHTS: Record<NetKey, number> = { latency: 0.35, jitter: 0.25, loss: 0.4 }
export interface ProbeSummary {
  taskId: number
  name: string
  latency: number | null
  jitter: number | null
  loss: number | null
}
/** 节点前三个探测点最近 24 小时的网络质量。 */
export interface NodeScore {
  overall: number | null
  values: Record<NetKey, number | null>
  parts: Record<NetKey, number | null>
  probes: ProbeSummary[]
}
const nulls = (): Record<NetKey, null> => ({ latency: null, jitter: null, loss: null })
export const emptyScore = (): NodeScore => ({ overall: null, values: nulls(), parts: nulls(), probes: [] })
const mean = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
// 从 best 满分线性降到 worst 零分。
const scale = (value: number | null, best: number, worst: number) =>
  value === null ? null : Math.min(100, Math.max(0, (100 * (worst - value)) / (worst - best)))
/** 一个探测任务在历史窗口内的延迟、抖动与丢包；网络质量页共用。 */
export function probeSummary(taskId: number, history: HistoryResponse): ProbeSummary {
  const points = history.ping.filter((p) => p.task_id === taskId),
    readings = points.flatMap((p) => (p.latency === null ? [] : [p.latency]))
  // 主控的 band 是桶内波动；没有 band 时用相邻读数差。
  const bands = points.flatMap((p) => (p.band ? [p.band[1] - p.band[0]] : [])),
    steps = readings.slice(1).map((v, i) => Math.abs(v - readings[i]!))
  return {
    taskId,
    name: history.probes[String(taskId)] ?? '',
    latency: mean(readings),
    jitter: mean(bands.length ? bands : steps),
    loss: taskLoss(history, taskId),
  }
}
function scoreOfProbes(probes: ProbeSummary[]): NodeScore {
  const values: Record<NetKey, number | null> = {
    latency: mean(probes.map((p) => p.latency)),
    jitter: mean(probes.map((p) => p.jitter)),
    loss: mean(probes.map((p) => p.loss)),
  }
  const raw: Record<NetKey, number | null> = {
    latency: scale(values.latency, 30, 300),
    jitter: scale(values.jitter, 5, 100),
    loss: scale(values.loss, 0, 10),
  }
  // 权重只在有数据的项之间分摊。
  const scored = NET_KEYS.filter((k) => raw[k] !== null),
    weight = scored.reduce((a, k) => a + NET_WEIGHTS[k], 0),
    total = scored.reduce((a, k) => a + NET_WEIGHTS[k] * raw[k]!, 0)
  return {
    overall: weight ? Math.min(99, Math.max(1, Math.round(total / weight))) : null,
    values,
    parts: Object.fromEntries(NET_KEYS.map((k) => [k, raw[k] === null ? null : Math.round(raw[k])])) as Record<
      NetKey,
      number | null
    >,
    probes,
  }
}
export function networkScore(node: MonitorNode, history?: HistoryResponse): NodeScore {
  if (!node.online || !history) return emptyScore()
  const named = Object.keys(history.probes).map(Number),
    ids = (named.length ? named : [...new Set(history.ping.map((p) => p.task_id))])
      .filter((id) => history.ping.some((p) => p.task_id === id))
      .sort((a, b) => a - b)
      .slice(0, 3)
  if (!ids.length) return emptyScore()
  return scoreOfProbes(ids.map((id) => probeSummary(id, history)))
}
/**
 * 实时评分：直接读主控帧里的探测桶，不必先请求 /api/series。
 * 首页卡片用它先出分，详情页打开后再用 24 小时历史覆盖。
 */
export function liveNetworkScore(series: ProbePingSeries[] | undefined): NodeScore {
  if (!series?.length) return emptyScore()
  // 主控的 key 是 telecom/unicom/mobile 这类字符串，不能直接转数字比较；按名称排序，取前三条。
  const picked = [...series]
    .filter((s) => s.buckets?.length)
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
    .slice(0, 3)
  if (!picked.length) return emptyScore()
  const probes: ProbeSummary[] = picked.map((s) => {
    const ms = s.buckets.map((b) => (b.ms > 0 ? b.ms : null)),
      readings = ms.filter((v): v is number => v !== null),
      steps = readings.slice(1).map((v, k) => Math.abs(v - readings[k]!)),
      losses = s.buckets.filter((b) => b.loss >= 0).map((b) => Math.min(100, b.loss))
    return {
      // 与 /api/series 历史用同一张映射表，卡面探测条和详情页才对得上同一个任务。
      taskId: taskIdOf(s),
      name: s.label,
      latency: mean(readings),
      jitter: mean(steps),
      loss: losses.length ? mean(losses) : null,
    }
  })
  return scoreOfProbes(probes)
}

export type StatGrade = 'good' | 'ok' | 'bad'
export interface StatReading {
  value: string
  unit: string
  grade: StatGrade | null
}
const dash: StatReading = { value: '—', unit: '', grade: null }
// 占用 60% 以下绿、85% 以下黄、再往上红。
const usage = (used: number, total: number): StatReading => {
  if (total <= 0) return dash
  const pct = Math.round((100 * used) / total)
  return { value: String(pct), unit: '%', grade: pct < 60 ? 'good' : pct < 85 ? 'ok' : 'bad' }
}
/** 卡面印的六项：真实占用、在线时长、延迟，按数值本身着色。 */
export function statReadings(node: MonitorNode, score: NodeScore): Record<StatKey, StatReading> {
  const m = node.metrics
  if (!node.online || !m)
    return Object.fromEntries(STAT_KEYS.map((k) => [k, dash])) as Record<StatKey, StatReading>
  const ms = score.values.latency === null ? null : Math.round(score.values.latency)
  return {
    cpu: usage(m.cpu, 100),
    mem: usage(m.mem_used, m.mem_total),
    dsk: usage(m.disk_used, m.disk_total),
    net:
      node.traffic_limit > 0
        ? usage(trafficUsed(node), node.traffic_limit)
        : { value: '∞', unit: '', grade: 'good' },
    // 一天内重启过值得看一眼，但不算故障。
    upt:
      m.uptime >= 86400
        ? { value: String(Math.floor(m.uptime / 86400)), unit: '天', grade: 'good' }
        : { value: String(Math.floor(m.uptime / 3600)), unit: '时', grade: 'ok' },
    png: ms === null ? dash : { value: String(ms), unit: 'ms', grade: ms <= 120 ? 'good' : ms <= 200 ? 'ok' : 'bad' },
  }
}

const ORDER: Tier[] = ['bronze', 'silver', 'gold'],
  LINES = [65, 75],
  GAP = 2
export function nextTier(score: number | null, previous?: Tier): Tier {
  if (score === null) return previous ?? 'silver'
  if (!previous) return ORDER[LINES.filter((l) => score >= l).length]!
  let r = ORDER.indexOf(previous)
  while (r < 2 && score >= LINES[r]! + GAP) r++
  while (r > 0 && score < LINES[r - 1]! - GAP) r--
  return ORDER[r]!
}
