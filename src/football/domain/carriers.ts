import mobileLogo from '../assets/carriers/mobile.webp'
import telecomLogo from '../assets/carriers/telecom.webp'
import unicomLogo from '../assets/carriers/unicom.webp'
import type { CarrierConfig, CarrierId, HistoryResponse, NodeConfig } from './types'

export const carriers: { id: CarrierId; name: string; short: string; color: string; logo: string }[] = [
  { id: 'telecom', name: '中国电信', short: '电信', color: '#54b8ff', logo: telecomLogo },
  { id: 'unicom', name: '中国联通', short: '联通', color: '#fb7185', logo: unicomLogo },
  { id: 'mobile', name: '中国移动', short: '移动', color: '#9ad969', logo: mobileLogo },
]
export const lines = [
  'CN2 GIA',
  'CN2 GT',
  '163',
  '9929',
  '4837',
  'CMI',
  'CMIN2',
  '普通线路',
  '未知',
  '自定义',
]
export type CarrierStatus = 'unconfigured' | 'success' | 'failed' | 'stale' | 'unavailable'
export const statusText: Record<CarrierStatus, string> = {
  unconfigured: '未配置探测',
  success: '探测成功',
  failed: '探测失败',
  stale: '数据过期',
  unavailable: '数据暂不可用',
}
/** 某个探测任务当前的延迟与状态。 */
export function resolveTask(
  taskId: number | undefined,
  history?: HistoryResponse,
  now = Date.now() / 1000,
  unavailable = false,
) {
  let status: CarrierStatus = 'unconfigured'
  let latency: number | null = null
  if (taskId) {
    const point = history?.ping.filter((p) => p.task_id === taskId).at(-1)
    status =
      unavailable || !history || !point
        ? 'unavailable'
        : now - point.ts > Math.max(300, history.step * 3)
          ? 'stale'
          : point.latency === null
            ? 'failed'
            : 'success'
    if (status === 'success') latency = point!.latency
  }
  return { status, latency }
}
export function resolveCarrier(
  config: CarrierConfig = {},
  history?: HistoryResponse,
  now = Date.now() / 1000,
  unavailable = false,
) {
  const { status, latency } = resolveTask(config.taskId, history, now, unavailable)
  return { status, latency, line: config.line || '未知', taskId: config.taskId, label: statusText[status] }
}
const NAMED: [RegExp, CarrierId][] = [
  [/电信|telecom/i, 'telecom'],
  [/联通|unicom/i, 'unicom'],
  [/移动|mobile/i, 'mobile'],
]
/** 探测名里带的运营商（“广东移动”“上海电信 TCP”）。 */
export const carrierFromName = (name?: string): CarrierId | undefined =>
  NAMED.find(([pattern]) => pattern.test(name ?? ''))?.[1]
/**
 * 一条探测序列属于哪家运营商。主控下发的 `isp` 最准（telecom / unicom / mobile），
 * 其次是 key（`telecom-v4`、`mobile:sh` 这类），最后才退回显示名。
 * 国际线路的 isp 是 intl，这里返回 undefined，由调用方归到「其他探测任务」。
 */
export function carrierOfSeries(series: { key?: string; label?: string; isp?: string }): CarrierId | undefined {
  const isp = series.isp?.trim().toLowerCase()
  if (isp === 'telecom' || isp === 'unicom' || isp === 'mobile') return isp
  const key = series.key?.trim().toLowerCase() ?? ''
  const byKey = /(?:^|[-_:])(telecom|unicom|mobile)(?:[-_:]|$)/.exec(key)
  if (byKey) return byKey[1] as CarrierId
  return carrierFromName(series.label)
}
/** 卡下条显示的地区：探测名的第一个词。 */
export const probeRegion = (name?: string) => name?.trim().split(/\s+/)[0] ?? ''
const HIDDEN_LINES = new Set(['未知', '普通线路'])
/** 卡面“技能”：站长按运营商配置的线路名，按运营商顺序，去重。 */
export function lineSkills(config?: NodeConfig) {
  const seen = new Set<string>()
  return carriers.flatMap((c) => {
    const line = config?.carriers?.[c.id]?.line?.trim() ?? ''
    if (!line || HIDDEN_LINES.has(line) || seen.has(line)) return []
    seen.add(line)
    return [{ carrier: c.id, line, color: c.color, name: c.name }]
  })
}
/**
 * 节点前三个探测任务（按任务 id 升序）。探测跟随它被映射或命名的运营商取色；
 * 命名区分得开的按运营商短名标注（“移动”），其余按地区标注。
 */
export function shownProbes(
  history: HistoryResponse | undefined,
  config: NodeConfig | undefined,
  online: boolean,
  unavailable = false,
  now = Date.now() / 1000,
) {
  const probes = history?.probes ?? {},
    ids = Object.keys(probes)
      .map(Number)
      .sort((a, b) => a - b)
      .slice(0, 3),
    owned = ids.map(
      (id) =>
        carriers.find((c) => config?.carriers?.[c.id]?.taskId === id) ??
        carriers.find((c) => c.id === carrierFromName(probes[String(id)])),
    ),
    named = ids.map((id) => carrierFromName(probes[String(id)])),
    byCarrier = named.every(Boolean) && owned.every(Boolean) && new Set(owned.map((c) => c!.id)).size === ids.length
  return ids.map((taskId, i) => {
    const name = probes[String(taskId)] ?? '',
      carrier = owned[i],
      r = resolveTask(taskId, history, now, unavailable),
      latency = online ? r.latency : null,
      label = online ? statusText[r.status] : '节点离线'
    return {
      taskId,
      region: (byCarrier && carrier?.short) || probeRegion(name) || `#${taskId}`,
      carrier: carrier?.id,
      color: carrier?.color,
      logo: carrier?.logo,
      latency,
      title: [carrier?.name, name, label].filter(Boolean).join(' · '),
    }
  })
}
const SEGMENTS = 10
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
/** 展示中探测的十段延迟（ms）与丢包（%），外加当前值与窗口值。 */
export function probeBars(history: HistoryResponse | undefined, taskIds: number[], now = Date.now() / 1000) {
  const points = history?.ping.filter((p) => taskIds.includes(p.task_id)) ?? [],
    latency: (number | null)[] = Array(SEGMENTS).fill(null),
    loss: (number | null)[] = Array(SEGMENTS).fill(null)
  if (points.length) {
    const start = Math.min(...points.map((p) => p.ts)),
      width = (Math.max(...points.map((p) => p.ts)) - start) / SEGMENTS || 1
    const buckets = Array.from({ length: SEGMENTS }, () => [] as typeof points)
    for (const p of points) buckets[Math.min(SEGMENTS - 1, Math.floor((p.ts - start) / width))]!.push(p)
    buckets.forEach((bucket, i) => {
      latency[i] = mean(bucket.flatMap((p) => (p.latency === null ? [] : [p.latency])))
      // 主控在丢包为 0 时不下发 loss；探测失败按全丢计算。
      loss[i] = mean(bucket.map((p) => p.loss ?? (p.latency === null ? 100 : 0)))
    })
  }
  const current = taskIds.flatMap((id) => {
    const r = resolveTask(id, history, now)
    return r.status === 'success' && r.latency !== null ? [r.latency] : []
  })
  const windowLosses = taskIds.flatMap((id) => {
    const value = history?.loss[String(id)]
    return value === undefined ? [] : [value]
  })
  return {
    latency,
    loss,
    currentLatency: mean(current),
    windowLoss: mean(windowLosses) ?? mean(loss.filter((v): v is number => v !== null)),
  }
}
/** 一个任务在整个历史窗口内的丢包（%），没样本时为 null。 */
export function taskLoss(history: HistoryResponse | undefined, taskId: number) {
  const value = history?.loss[String(taskId)]
  if (value !== undefined) return value
  const points = history?.ping.filter((p) => p.task_id === taskId) ?? []
  return mean(points.map((p) => p.loss ?? (p.latency === null ? 100 : 0)))
}
/** 与 `lossColor` 同一套阈值的文字评级。 */
export const lossGrade = (percent: number) =>
  percent <= 0 ? '无丢包' : percent < 1 ? '极少' : percent < 3 ? '轻微' : percent < 10 ? '偏高' : '严重'
const EMPTY_SEGMENT = 'var(--strip-empty-seg)'
const GRADES = ['#4ade80', '#a3e635', '#facc15', '#fb923c', '#f87171']
export const latencyLevel = (ms: number) => [60, 120, 200, 300].filter((limit) => ms > limit).length
export const lossLevel = (percent: number) =>
  percent <= 0 ? 0 : percent < 1 ? 1 : percent < 3 ? 2 : percent < 10 ? 3 : 4
export const levelColor = (level: number | null) => (level === null ? EMPTY_SEGMENT : GRADES[level]!)
export const latencyColor = (ms: number | null) => levelColor(ms === null ? null : latencyLevel(ms))
export const lossColor = (percent: number | null) => levelColor(percent === null ? null : lossLevel(percent))
