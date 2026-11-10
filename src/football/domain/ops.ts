import { shownProbes } from './carriers'
import { bytes, percent } from './format'
import { LOSS_ALERT, pointLoss } from './network'
import type { HistoryResponse, MonitorNode, NodeConfig, PingPoint, ThemeConfig } from './types'

/** The ops wall (/ops): what needs attention, in what order, and how many tiles fit a screen. */
export const RESOURCE_ALERT = 90
export const EXPIRY_ALERT_DAYS = 3
/** Loss is judged over the last hour of the day's probes. */
export const LOSS_WINDOW = 3600
/** Seconds without new node data before the wall says it is out of date. */
export const STALE_AFTER = 60

export type ResourceKey = 'cpu' | 'mem' | 'disk'
export type NodeAlert =
  | { kind: 'offline'; since: number | null }
  | { kind: 'loss'; taskId: number; name: string; loss: number }
  | { kind: 'resource'; key: ResourceKey; percent: number }
  | { kind: 'expiry'; days: number; date: string | null }
export type AlertKind = NodeAlert['kind']
export const ALERT_RANK: Record<AlertKind, number> = { offline: 0, loss: 1, resource: 2, expiry: 3 }
export const RESOURCE_LABELS: Record<ResourceKey, string> = { cpu: 'CPU', mem: '内存', disk: '硬盘' }

/** Each probe's loss (%) over the last `LOSS_WINDOW` seconds, ascending task id. */
export function recentLoss(history: HistoryResponse | undefined, now: number) {
  const byTask = new Map<number, number[]>()
  for (const p of history?.ping ?? [])
    if (p.ts > now - LOSS_WINDOW && p.ts <= now)
      byTask.set(p.task_id, [...(byTask.get(p.task_id) ?? []), pointLoss(p)])
  return [...byTask]
    .sort(([a], [b]) => a - b)
    .map(([taskId, losses]) => ({
      taskId,
      name: history?.probes?.[String(taskId)] || `任务 #${taskId}`,
      loss: losses.reduce((a, b) => a + b, 0) / losses.length,
    }))
}

/** A node's alerts, most severe first; an offline node reports only its outage. */
export function nodeAlerts(
  node: MonitorNode,
  history: HistoryResponse | undefined,
  config: ThemeConfig,
  now: number,
): NodeAlert[] {
  if (!node.online) return [{ kind: 'offline', since: node.last_seen }]
  const alerts: NodeAlert[] = []
  const worst = recentLoss(history, now).reduce<ReturnType<typeof recentLoss>[number] | null>(
    (w, line) => (line.loss >= LOSS_ALERT && (!w || line.loss > w.loss) ? line : w),
    null,
  )
  if (worst) alerts.push({ kind: 'loss', ...worst })
  const m = node.metrics
  if (m) {
    const used: [ResourceKey, number | null][] = [
      ['cpu', m.cpu ?? null],
      ['mem', percent(m.mem_used, m.mem_total)],
      ['disk', percent(m.disk_used, m.disk_total)],
    ]
    const top = used.reduce<[ResourceKey, number] | null>(
      (t, [key, v]) => (v !== null && v >= RESOURCE_ALERT && (!t || v > t[1]) ? [key, v] : t),
      null,
    )
    if (top) alerts.push({ kind: 'resource', key: top[0], percent: Math.round(top[1] * 10) / 10 })
  }
  if (config.show_billing && node.expires_in != null && node.expires_in <= EXPIRY_ALERT_DAYS)
    alerts.push({ kind: 'expiry', days: node.expires_in, date: node.expires_at })
  return alerts
}

export type NodeStatus = 'ok' | 'warn' | 'off'
/** Normal, needing attention, or offline: the three counts the wall leads with. */
export const nodeStatus = (node: MonitorNode, alerts: NodeAlert[] = []): NodeStatus =>
  !node.online ? 'off' : alerts.length ? 'warn' : 'ok'
export function statusCounts(nodes: MonitorNode[], alerts: Record<number, NodeAlert[]>) {
  const counts: Record<NodeStatus, number> = { ok: 0, warn: 0, off: 0 }
  for (const n of nodes) counts[nodeStatus(n, alerts[n.id])]++
  return counts
}

export type Places = Record<string, readonly [number, number]>
export interface CountryMarker {
  code: string
  /** [longitude, latitude] */
  at: readonly [number, number]
  total: number
  ok: number
  warn: number
  off: number
  ids: number[]
}
/** One globe marker per country, with its status mix, most nodes first; nodes with no known place are counted. */
export function countryMarkers(nodes: MonitorNode[], alerts: Record<number, NodeAlert[]>, places: Places) {
  const byCode = new Map<string, CountryMarker>()
  let unplaced = 0
  for (const n of nodes) {
    const code = n.country.trim().toUpperCase(),
      at = places[code]
    if (!at) {
      unplaced++
      continue
    }
    const m = byCode.get(code) ?? { code, at, total: 0, ok: 0, warn: 0, off: 0, ids: [] }
    m.total++
    m[nodeStatus(n, alerts[n.id])]++
    m.ids.push(n.id)
    byCode.set(code, m)
  }
  const markers = [...byCode.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))
  return { markers, unplaced }
}

export interface Issue {
  node: MonitorNode
  alert: NodeAlert
}
/** Everything going on now: one row per alert, by severity, then Hub order. */
export function issueList(nodes: MonitorNode[], alerts: Record<number, NodeAlert[]>): Issue[] {
  return nodes
    .flatMap((node, index) => (alerts[node.id] ?? []).map((alert) => ({ node, alert, index })))
    .sort((a, b) => ALERT_RANK[a.alert.kind] - ALERT_RANK[b.alert.kind] || a.index - b.index)
    .map(({ node, alert }) => ({ node, alert }))
}
const duration = (seconds: number) => {
  const d = Math.floor(seconds / 86400),
    h = Math.floor(seconds / 3600),
    m = Math.max(1, Math.floor(seconds / 60))
  return d >= 2 ? `${d} 天` : h ? `${h} 小时` : `${m} 分钟`
}
/** An issue's short label and figure, as the wall lists it. */
export function issueText(
  alert: NodeAlert,
  now: number,
): { label: string; value: string; tone: 'bad' | 'warn' } {
  switch (alert.kind) {
    case 'offline':
      return {
        label: '离线',
        value: alert.since === null ? '时长未知' : duration(now - alert.since),
        tone: 'bad',
      }
    case 'loss':
      return { label: '丢包', value: `${alert.loss.toFixed(1)}%`, tone: 'bad' }
    case 'resource':
      return {
        label: RESOURCE_LABELS[alert.key],
        value: `${Number(alert.percent.toFixed(1))}%`,
        tone: 'warn',
      }
    case 'expiry':
      return {
        label: '到期',
        value: alert.days < 0 ? `已过期 ${-alert.days} 天` : alert.days === 0 ? '今天' : `${alert.days} 天后`,
        tone: 'warn',
      }
  }
}

const STATUS_RANK: Record<NodeStatus, number> = { off: 0, warn: 1, ok: 2 }
/** The card for a country with several nodes: its mix, and each node with its first issue, worst first. */
export function countryCard(
  code: string,
  nodes: MonitorNode[],
  alerts: Record<number, NodeAlert[]>,
  now: number,
) {
  const here = nodes.filter((n) => n.country.trim().toUpperCase() === code)
  const rows = here
    .map((n, index) => {
      const status = nodeStatus(n, alerts[n.id]),
        first = alerts[n.id]?.[0]
      const issue = first ? issueText(first, now) : null
      return {
        id: n.id,
        name: n.name,
        status,
        issue: issue ? `${issue.label} ${issue.value}` : '正常',
        index,
      }
    })
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.index - b.index)
    .map(({ id, name, status, issue }) => ({ id, name, status, issue }))
  const counts = { ok: 0, warn: 0, off: 0 }
  for (const r of rows) counts[r.status]++
  return { code, total: rows.length, ...counts, rows }
}

const clockOf = (ts: number) => new Date(ts * 1000).toTimeString().slice(0, 8)
const split = (rateText: string) => {
  const [value = '—', unit = ''] = rateText.split(' ')
  return { value, unit: unit ? `${unit}/s` : '' }
}
/**
 * The card for one node: how long its trouble has lasted (`since`, when this page first saw it, or null when it
 * was already there on opening), its tags, four figures, the first three probes and how many share its country.
 */
export function nodeCard(
  node: MonitorNode,
  alerts: NodeAlert[],
  history: HistoryResponse | undefined,
  config: NodeConfig | undefined,
  now: number,
  since: number | null,
  siblings: number,
) {
  const m = node.online ? node.metrics : null
  const kicker = !node.online
    ? node.last_seen === null
      ? '离线 · 时长未知'
      : `离线已持续 ${duration(now - node.last_seen)} · ${clockOf(node.last_seen)}`
    : alerts.length
      ? since === null
        ? '异常 · 打开页面前已发生'
        : `异常已持续 ${duration(now - since)} · ${clockOf(since)}`
      : m?.uptime
        ? `运行正常 · 已运行 ${Math.floor(m.uptime / 86400)} 天`
        : '运行正常'
  const pct = (v: number | null) => ({
    value: v === null ? '—' : String(Math.round(v)),
    unit: v === null ? '' : '%',
  })
  const metrics = [
    { label: 'CPU', ...pct(m ? (m.cpu ?? null) : null) },
    { label: '内存', ...pct(m ? percent(m.mem_used, m.mem_total) : null) },
    { label: '上行', ...(m ? split(bytes(m.net_tx)) : { value: '—', unit: '' }) },
    { label: '下行', ...(m ? split(bytes(m.net_rx)) : { value: '—', unit: '' }) },
  ]
  const probes = shownProbes(history, config, node.online, false, now).map((p) => {
    const ms = p.latency === null ? null : Math.round(p.latency)
    return {
      name: history?.probes?.[String(p.taskId)] || p.region,
      ms,
      width: ms === null ? 0 : Math.min(100, ms / 4),
      level: ms === null ? 'none' : ms < 200 ? 'good' : ms < 300 ? 'slow' : 'bad',
    }
  })
  return {
    id: node.id,
    name: node.name,
    code: node.country.trim().toUpperCase(),
    state: node.online ? 'ONLINE' : 'OFFLINE',
    kicker,
    tags: alerts.map((a) => issueText(a, now)),
    metrics,
    probes,
    siblings,
  }
}
export type NodeCard = ReturnType<typeof nodeCard>
export type CountryCard = ReturnType<typeof countryCard>

export interface TourStop {
  node: MonitorNode
  at: readonly [number, number]
  alerts: NodeAlert[]
}
/** The troubled nodes the globe turns to one by one: each once, in issue order, where it can be placed. */
export function tourStops(issues: Issue[], places: Places): TourStop[] {
  const stops = new Map<number, TourStop>()
  for (const { node, alert } of issues) {
    const at = places[node.country.trim().toUpperCase()]
    if (!at) continue
    const stop = stops.get(node.id) ?? { node, at, alerts: [] }
    stop.alerts.push(alert)
    stops.set(node.id, stop)
  }
  return [...stops.values()]
}

export interface WallSnapshot {
  names: Record<number, string>
  online: Record<number, boolean>
  /** Each alert by node and kind, with its figures at the time. */
  alerts: Map<string, NodeAlert>
}
export type OpsEvent =
  | { kind: 'online' | 'offline'; nodeId: number; name: string }
  | {
      kind: 'alert' | 'clear'
      nodeId: number
      name: string
      alert: Exclude<AlertKind, 'offline'>
      detail: NodeAlert
    }

export function snapshot(nodes: MonitorNode[], alerts: Record<number, NodeAlert[]>): WallSnapshot {
  return {
    names: Object.fromEntries(nodes.map((n) => [n.id, n.name])),
    online: Object.fromEntries(nodes.map((n) => [n.id, n.online])),
    alerts: new Map(
      nodes.flatMap((n) =>
        (alerts[n.id] ?? [])
          .filter((a) => a.kind !== 'offline')
          .map((a) => [`${n.id}:${a.kind}`, a] as const),
      ),
    ),
  }
}
/** What changed between two snapshots: nodes going down or up, alerts raised or cleared. The first is a baseline. */
export function diffEvents(prev: WallSnapshot | null, next: WallSnapshot): OpsEvent[] {
  if (!prev) return []
  const events: OpsEvent[] = []
  for (const [key, online] of Object.entries(next.online)) {
    const id = Number(key)
    if (id in prev.online && prev.online[id] !== online)
      events.push({ kind: online ? 'online' : 'offline', nodeId: id, name: next.names[id]! })
  }
  const alertEvent = (kind: 'alert' | 'clear', key: string, from: WallSnapshot): OpsEvent => {
    const [id, alert] = key.split(':') as [string, Exclude<AlertKind, 'offline'>]
    return { kind, nodeId: Number(id), name: from.names[Number(id)]!, alert, detail: from.alerts.get(key)! }
  }
  const known = (key: string) =>
    Number(key.split(':')[0]) in prev.online && Number(key.split(':')[0]) in next.online
  for (const key of next.alerts.keys())
    if (!prev.alerts.has(key) && known(key)) events.push(alertEvent('alert', key, next))
  for (const key of prev.alerts.keys())
    if (!next.alerts.has(key) && known(key)) events.push(alertEvent('clear', key, prev))
  return events
}

/** One line of recent changes: a coloured tag, then the node and the figure. */
export function eventBadge(
  e: OpsEvent,
  now: number,
): { tag: string; tone: 'bad' | 'warn' | 'good'; text: string } {
  if (!('detail' in e))
    return e.kind === 'offline'
      ? { tag: '离线', tone: 'bad', text: e.name }
      : { tag: '上线', tone: 'good', text: e.name }
  const issue = issueText(e.detail, now)
  return e.kind === 'alert'
    ? { tag: issue.label, tone: issue.tone, text: `${e.name} · ${issue.value}` }
    : { tag: '恢复', tone: 'good', text: `${e.name} · ${issue.label}恢复` }
}
/** A line of recent changes that is not an alert raised or cleared: a lossy moment, a busy CPU, a traffic jump. */
export interface Change {
  key: string
  /** Seconds. */
  at: number
  nodeId: number
  tag: string
  tone: 'bad' | 'warn' | 'good' | 'neutral'
  text: string
}
export const BUSY_CPU = 80
const SURGE_FACTOR = 3,
  SURGE_FLOOR = 1024 * 1024,
  SURGE_SAMPLES = 8

/** What the last hour of probes already shows on opening: each run of points losing `LOSS_ALERT` or more. */
export function pastLoss(
  nodes: MonitorNode[],
  ping: Record<number, HistoryResponse | undefined>,
  now: number,
): Change[] {
  const changes: Change[] = []
  for (const node of nodes) {
    const byTask = new Map<number, PingPoint[]>()
    for (const p of ping[node.id]?.ping ?? [])
      if (p.ts > now - LOSS_WINDOW && p.ts <= now)
        byTask.set(p.task_id, [...(byTask.get(p.task_id) ?? []), p])
    for (const [task, points] of byTask) {
      let run: { at: number; worst: number } | null = null
      const close = () => {
        if (run)
          changes.push({
            key: `loss:${node.id}:${task}:${run.at}`,
            at: run.at,
            nodeId: node.id,
            tag: '丢包',
            tone: 'bad',
            text: `${node.name} · ${run.worst.toFixed(1)}%`,
          })
        run = null
      }
      for (const p of [...points].sort((a, b) => a.ts - b.ts)) {
        const loss = pointLoss(p)
        if (loss < LOSS_ALERT) close()
        else if (run) run.worst = Math.max(run.worst, loss)
        else run = { at: p.ts, worst: loss }
      }
      close()
    }
  }
  return changes.sort((a, b) => b.at - a.at)
}

/**
 * Changes seen between two arrivals of node data: a CPU climbing past `BUSY_CPU`, or traffic (down and up together)
 * jumping to `SURGE_FACTOR` times its recent average, given at least `SURGE_SAMPLES` earlier totals per node.
 */
export function metricChanges(
  prev: MonitorNode[] | null,
  next: MonitorNode[],
  samples: Record<number, number[]>,
  now: number,
): Change[] {
  const changes: Change[] = []
  const before = new Map(prev?.map((n) => [n.id, n]) ?? [])
  for (const node of next) {
    const m = node.metrics
    if (!node.online || !m) continue
    const old = before.get(node.id)?.metrics
    if (old && old.cpu < BUSY_CPU && m.cpu >= BUSY_CPU)
      changes.push({
        key: `cpu:${node.id}:${now}`,
        at: now,
        nodeId: node.id,
        tag: 'CPU',
        tone: 'warn',
        text: `${node.name} · ${Number(m.cpu.toFixed(1))}%`,
      })
    const recent = samples[node.id] ?? [],
      total = m.net_rx + m.net_tx
    if (recent.length >= SURGE_SAMPLES) {
      const average = recent.reduce((a, b) => a + b, 0) / recent.length
      if (total >= SURGE_FLOOR && total >= average * SURGE_FACTOR)
        changes.push({
          key: `surge:${node.id}:${now}`,
          at: now,
          nodeId: node.id,
          tag: '带宽突增',
          tone: 'neutral',
          text: `${node.name} · ${bytes(total)}/s`,
        })
    }
  }
  return changes
}

/** A wall open for an hour or more reloads itself once a day, at 04:00 local time. */
export const shouldReload = (openedAt: number, now: Date) =>
  now.getTime() - openedAt >= 3600_000 && now.getHours() === 4 && now.getMinutes() === 0
