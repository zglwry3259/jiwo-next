import { carrierOfSeries, carriers, latencyLevel, levelColor, lossLevel } from './carriers'
import { probeMeta } from './history'
import { probeSummary } from './score'
import type { CarrierId, HistoryResponse, MonitorNode, NodeConfig, PingPoint } from './types'

/** The network quality page: every node's lines over one window, on the theme's latency and loss grades. */
export const SEGMENTS = 24
/** Loss (%) from which a line or a moment counts as losing packets. */
export const LOSS_ALERT = 3
export interface Segment {
  from: number
  to: number
  latency: number | null
  loss: number | null
  color: string
}
export interface Source {
  history: HistoryResponse
  taskIds: number[]
}
export interface Reading {
  latency: number | null
  loss: number | null
}
export interface CarrierReading extends Reading {
  taskId: number
  line: string
  name: string
}
export interface NodeQuality {
  /** Tasks with points in the window, ascending. */
  lines: number[]
  latency: number | null
  loss: number | null
  jitter: number | null
  carriers: Record<CarrierId, CarrierReading | null>
  /** Lines losing at least `LOSS_ALERT` over the window. */
  lossyLines: number
  /** Time (s) of the newest point losing at least `LOSS_ALERT`. */
  lastLoss: number | null
}
export type NetworkSort = 'hub' | 'latency' | 'loss' | 'jitter'

const mean = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
// Hub omits `loss` when it is 0; a failed probe counts as fully lost.
export const pointLoss = (p: PingPoint) => p.loss ?? (p.latency === null ? 100 : 0)

export function lineIds(history: HistoryResponse) {
  return [...new Set(history.ping.map((p) => p.task_id))].sort((a, b) => a - b)
}

/** Equal slices of the last `hours` up to `now`, the same for every row so the moments line up. */
export function qualityBar(sources: Source[], hours: number, now: number): Segment[] {
  const from = now - hours * 3600,
    width = (hours * 3600) / SEGMENTS
  const buckets = Array.from({ length: SEGMENTS }, () => [] as PingPoint[])
  for (const { history, taskIds } of sources)
    for (const p of history.ping)
      if (p.ts >= from && p.ts <= now && taskIds.includes(p.task_id))
        buckets[Math.min(SEGMENTS - 1, Math.floor((p.ts - from) / width))]!.push(p)
  return buckets.map((points, i) => {
    const latency = mean(points.map((p) => p.latency)),
      loss = points.length ? mean(points.map(pointLoss)) : null
    const levels = [latency === null ? null : latencyLevel(latency), loss === null ? null : lossLevel(loss)]
    const known = levels.filter((l): l is number => l !== null)
    return {
      from: from + i * width,
      to: from + (i + 1) * width,
      latency,
      loss,
      color: levelColor(known.length ? Math.max(...known) : null),
    }
  })
}

export function nodeQuality(history: HistoryResponse, config?: NodeConfig): NodeQuality {
  const lines = lineIds(history),
    probes = lines.map((id) => probeSummary(id, history))
  const reading = (carrier: CarrierId): CarrierReading | null => {
    const c = config?.carriers?.[carrier]
    // 站长没填 taskId 时按 isp / key / 探测名兜底：主控下发的探测没有 football 的数字任务号。
    const taskId =
      c?.taskId ??
      probes.find((p) => {
        const meta = probeMeta(p.taskId)
        return carrierOfSeries({ label: p.name, key: meta?.key, isp: meta?.isp }) === carrier
      })?.taskId
    const summary = taskId && lines.includes(taskId) ? probes[lines.indexOf(taskId)]! : null
    return summary
      ? {
          taskId: summary.taskId,
          line: c?.line || (c?.taskId ? '未知' : summary.name) || '未知',
          name: summary.name || `任务 #${summary.taskId}`,
          latency: summary.latency,
          loss: summary.loss,
        }
      : null
  }
  const lossy = history.ping.filter((p) => pointLoss(p) >= LOSS_ALERT)
  return {
    lines,
    latency: mean(probes.map((p) => p.latency)),
    loss: mean(probes.map((p) => p.loss)),
    jitter: mean(probes.map((p) => p.jitter)),
    carriers: Object.fromEntries(carriers.map((c) => [c.id, reading(c.id)])) as Record<
      CarrierId,
      CarrierReading | null
    >,
    lossyLines: probes.filter((p) => p.loss !== null && p.loss >= LOSS_ALERT).length,
    lastLoss: lossy.length ? Math.max(...lossy.map((p) => p.ts)) : null,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
/** How long ago a moment was, and when it started: ["19 小时前", "20:30 起"]. */
export function sinceText(ts: number, now: number): [string, string] {
  const ago = now - ts,
    d = new Date(ts * 1000),
    time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (ago < 60) return ['刚刚', `${time} 起`]
  if (ago < 3600) return [`${Math.floor(ago / 60)} 分钟前`, `${time} 起`]
  if (ago < 86400) return [`${Math.floor(ago / 3600)} 小时前`, `${time} 起`]
  return [`${Math.floor(ago / 86400)} 天前`, `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time} 起`]
}

/** Rows in the chosen order: ascending readings with missing ones after, ties by name; offline nodes last. */
export function sortNodes<T extends { node: MonitorNode; quality: NodeQuality | null }>(
  rows: T[],
  key: NetworkSort,
): T[] {
  const value = (r: T) => (key === 'hub' ? 0 : (r.quality?.[key] ?? null))
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.node.online !== b.row.node.online) return a.row.node.online ? -1 : 1
      if (key === 'hub') return a.index - b.index
      const x = value(a.row),
        y = value(b.row)
      if (x !== y) return x === null ? 1 : y === null ? -1 : x - y
      return a.row.node.name.localeCompare(b.row.node.name, 'zh-CN')
    })
    .map(({ row }) => row)
}
