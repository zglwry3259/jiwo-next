import type { SystemSeries } from '../../mini/mini-trends'
import type { ProbePingSeries } from '../../types'
import type { HistoryResponse, MetricPoint, PingPoint } from './types'

/**
 * 探测任务的数字 id：主题其它模块（运营商映射、卡片条）只认数字，主控这边给的是字符串 key。
 * 用一张进程内表把 key 稳定映射成 1、2、3…，实时帧与历史请求因此指向同一个任务。
 */
const taskIds = new Map<string, number>()
// 任务号 → 主控原始 key / isp，用来在只有数字 id 的地方（历史响应、三网格子）还原运营商。
const metas = new Map<number, { key?: string; isp?: string; label?: string }>()
let nextTaskId = 1

export function taskIdOf(series: { key?: string; label?: string; isp?: string }): number {
  const id = series.key?.trim() || series.label?.trim() || 'task'
  const known = taskIds.get(id)
  if (known) {
    // 历史响应只有 label、实时帧才带 isp：后到的信息补进去，先到的不覆盖。
    const meta = metas.get(known)
    if (meta && !meta.isp && series.isp) metas.set(known, { ...meta, isp: series.isp })
    return known
  }
  const assigned = nextTaskId++
  taskIds.set(id, assigned)
  metas.set(assigned, { key: series.key, isp: series.isp, label: series.label })
  return assigned
}

/** 任务号对应的主控原始信息（实时帧登记过才有）。 */
export function probeMeta(taskId: number): { key?: string; isp?: string; label?: string } | undefined {
  return metas.get(taskId)
}

const trendValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export interface SeriesPayload {
  success?: boolean
  series?: ProbePingSeries
  all_series?: ProbePingSeries[]
  generated_at?: number
  bucket_sec?: number
}

/** `metric=system` 的响应形状：series 是各指标的时间序列集合，不是探测线路。 */
export interface SystemPayload {
  success?: boolean
  series?: SystemSeries
  generated_at?: number
  bucket_sec?: number
}

/** 主控桶没有时间戳：按「最后一格对齐到当前桶边界」从后往前推。 */
export function pingPoints(series: ProbePingSeries, generatedAt: number, bucketSec: number): PingPoint[] {
  const step = bucketSec > 0 ? bucketSec : 300,
    end = generatedAt - (generatedAt % step),
    length = series.buckets.length,
    taskId = taskIdOf(series)
  return series.buckets.flatMap((bucket, index) => {
    const ts = end - (length - 1 - index) * step,
      latency = trendValue(bucket.ms)
    if (latency === null && !(bucket.loss > 0)) return []
    return [
      {
        task_id: taskId,
        ts,
        latency,
        // 主控在丢包 0 时可能省略字段，这里统一补 0，避免下游把「没有丢包」当成「没有数据」。
        loss: Number.isFinite(bucket.loss) ? Math.min(100, Math.max(0, bucket.loss)) : 0,
      },
    ]
  })
}

/**
 * 一次请求里的全部探测线路。主控 `all=1` 会把每条线路都放进 all_series；
 * 老版本只给 series（主序列）。football 的每条线本身就是独立任务，
 * 上层不要再补一条「平均」——否则三网列与综合评分会把主序列算两次。
 */
export function linesOf(payload: SeriesPayload): ProbePingSeries[] {
  if (payload.all_series?.length) return payload.all_series
  return payload.series ? [payload.series] : []
}

/** 由 /api/series 的探测负载构造主题历史；两条以上线路时按 football 的口径补一条平均值。 */
export function historyFromPing(
  payload: SeriesPayload,
  series: ProbePingSeries[],
  bucketSec: number,
): HistoryResponse {
  const generatedAt = payload.generated_at && payload.generated_at > 0 ? payload.generated_at : Math.floor(Date.now() / 1000)
  const step = bucketSec > 0 ? bucketSec : payload.bucket_sec && payload.bucket_sec > 0 ? payload.bucket_sec : 300
  const ping = series.flatMap((item) => pingPoints(item, generatedAt, step))
  const probes: Record<string, string> = {}
  const loss: Record<string, number> = {}
  for (const item of series) {
    const id = taskIdOf(item)
    probes[String(id)] = item.label || `任务 #${id}`
    const losses = item.buckets.map((b) => (Number.isFinite(b.loss) ? Math.min(100, Math.max(0, b.loss)) : 0))
    if (losses.length) loss[String(id)] = losses.reduce((a, b) => a + b, 0) / losses.length
  }
  return { metrics: [], ping, probes, loss, step }
}

/** 系统指标：主控每项是独立的 {t, value} 数组，按时间戳合并，缺失不补零。 */
export function metricsFromSystem(series: SystemSeries | undefined): MetricPoint[] {
  if (!series) return []
  const rows = new Map<number, MetricPoint>()
  const touch = (t: number) => {
    const known = rows.get(t)
    if (known) return known
    const row: MetricPoint = { ts: t, cpu: null, mem_used: null, disk_used: null, net_rx: null, net_tx: null }
    rows.set(t, row)
    return row
  }
  for (const [key, points] of Object.entries(series)) {
    for (const point of points || []) {
      if (!Number.isFinite(point.t) || point.t <= 0) continue
      const row = touch(point.t),
        value = trendValue(point.value)
      if (key === 'cpu_pct') row.cpu = value
      else if (key === 'mem_used') row.mem_used = value
      else if (key === 'disk_used') row.disk_used = value
      else if (key === 'download_speed') row.net_rx = value
      else if (key === 'upload_speed') row.net_tx = value
    }
  }
  return [...rows.values()].sort((a, b) => a.ts - b.ts)
}

export function withMetrics(history: HistoryResponse, metrics: MetricPoint[]): HistoryResponse {
  return { ...history, metrics }
}

const memo = new Map<string, Promise<unknown>>()

/** 同一次会话内最多 30 条，避免来回切页反复打主控。 */
const CACHE_LIMIT = 30

function cacheSet(key: string, value: Promise<unknown>) {
  if (memo.size >= CACHE_LIMIT) memo.delete(memo.keys().next().value as string)
  memo.set(key, value)
}

export function clearSeriesCache() {
  memo.clear()
}

/**
 * 读 /api/series；失败抛错，由调用方决定显示什么。
 * metric=system 时响应里是 SystemSeries，用 `fetchSeries<SystemPayload>(...)` 取。
 */
export function fetchSeries<T = SeriesPayload>(
  serverIndex: number,
  range: string,
  metric: 'all' | 'system',
  signal?: AbortSignal,
  force = false,
): Promise<T> {
  const key = `${serverIndex}|${range}|${metric}`
  const hit = memo.get(key)
  if (hit && !force) return hit as Promise<T>
  const request = fetch(`/api/series?server=${serverIndex}&range=${range}&${metric === 'system' ? 'metric=system' : 'all=1'}`, {
    cache: 'no-store',
    signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as T & { success: boolean }
      if (!payload.success) throw new Error('主控未返回历史数据')
      return payload
    })
    .catch((error: unknown) => {
      memo.delete(key)
      throw error
    })
  cacheSet(key, request)
  return request
}
