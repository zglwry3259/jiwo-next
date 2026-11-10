import type { ProbePayload, ProbePingSeries, ProbeServer } from '../types'
import type { GlobalConfig, HistoryResponse, Metrics, MonitorNode, NodeConfig, ThemeConfig } from './domain/types'
import { DEFAULT_RATES, cycleMonths, parseRates } from './domain/fleet'
import { historyFromPing, type SeriesPayload } from './domain/history'
import { DEFAULT_PORTRAIT } from './domain/portrait'
import { liveNetworkScore, type NodeScore } from './domain/score'
import { migrateTemplate } from './domain/skins'

/** 与 theme.json 一致的主题默认值。 */
export const DEFAULT_GLOBAL: GlobalConfig = {
  default_template: 'auto',
  layout: 'comfortable',
  card_size: 'standard',
  card_view: 'stacked',
  appearance: 'dark',
  motion: true,
  show_summary: true,
  show_traffic: true,
  show_billing: true,
  show_daily: true,
  show_carriers: true,
  show_clock: true,
  show_score: true,
  exchange_rates: DEFAULT_RATES,
}

export const DEFAULT_THEME: ThemeConfig = { ...DEFAULT_GLOBAL, nodes: {} }

const nonneg = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
const nullable = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const load = (value: string | undefined): [number, number, number] => {
  const parts = (value || '')
    .split(/\s+/)
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** RFC3339 → 秒级时间戳；解析失败返回 null。 */
function epoch(value?: string | null): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

/** RFC3339 → 本地日期 YYYY-MM-DD（football 的到期日只到天）。 */
function isoDay(value?: string | null): string | null {
  const at = epoch(value)
  if (at === null) return null
  const d = new Date(at * 1000),
    pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function metricsOf(server: ProbeServer): Metrics | null {
  // 离线节点主控不再下发实时值；只有明确在线时才把数值当实时值用。
  if (!server.online) return null
  const has = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (!has(server.cpu_pct) && !has(server.mem_used) && !has(server.disk_used)) return null
  return {
    uptime: nonneg(server.uptime),
    cpu: nonneg(server.cpu_pct),
    load: load(server.loadavg),
    mem_total: nonneg(server.mem_total),
    mem_used: nonneg(server.mem_used),
    swap_total: 0,
    swap_used: 0,
    disk_total: nonneg(server.disk_total),
    disk_used: nonneg(server.disk_used),
    // 节点视角：download_speed 是接收，upload_speed 是发送。
    net_rx: nonneg(server.download_speed),
    net_tx: nonneg(server.upload_speed),
    total_rx: nonneg(server.cumulative_down),
    total_tx: nonneg(server.cumulative_up),
    month_rx: nonneg(server.traffic_used_down),
    month_tx: nonneg(server.traffic_used_up),
    tcp: nonneg(server.tcp_connections),
    udp: nonneg(server.udp_connections),
    procs: 0,
  }
}

/** 计费周期：主控用 month/quarter/...，football 的 cycle() 两套都认，这里原样透传。 */
const billingCycle = (server: ProbeServer) => server.renewal_cycle || ''

export function toMonitorNode(server: ProbeServer, index: number): MonitorNode {
  const id = index + 1
  const daily = [...(server.daily_traffic || [])].sort((a, b) => a.date.localeCompare(b.date))
  const today = daily.at(-1)
  const lastSeen = epoch(server.last_seen)
  const expiresAt = isoDay(server.expires_at),
    expiresIn =
      epoch(server.expires_at) === null
        ? null
        : Math.round((epoch(server.expires_at)! - Date.now() / 1000) / 86400)
  const price = server.renewal_price_cny ?? server.renewal_price ?? null
  // 回程路由：主控只下发 telecom/unicom/mobile 三种；其它值丢掉，避免三网行错配。
  const returnRoutes = (server.return_routes ?? []).filter(
    (route) => (route.carrier === 'telecom' || route.carrier === 'unicom' || route.carrier === 'mobile') && route.route_type?.trim(),
  )
  // 解锁检测原样带过去，状态文案与分类由 jiwo-probe 的 unlocks.ts 解释，和经典主题口径一致。
  const unlocks = server.unlocks ?? []
  return {
    id,
    name: server.name?.trim() || `服务器 ${id}`,
    sort: index,
    public: true,
    online: server.online,
    country: (server.region_country || '').trim().toUpperCase().slice(0, 2),
    group: server.region_name?.trim() || server.region?.trim() || '',
    public_remark: '',
    last_seen: lastSeen,
    last_seen_ago: server.online || lastSeen === null ? null : Math.max(0, Date.now() / 1000 - lastSeen),
    metrics: metricsOf(server),
    // 原样带上主控给了的实时字段：主控只跑流量统计时 metrics 为 null，
    // 卡面仍要能把 uptime / 单项占用显示出来，而不是六格全空。
    raw: {
      cpu_pct: nullable(server.cpu_pct) ?? undefined,
      mem_used: nullable(server.mem_used) ?? undefined,
      mem_total: nullable(server.mem_total) ?? undefined,
      disk_used: nullable(server.disk_used) ?? undefined,
      disk_total: nullable(server.disk_total) ?? undefined,
      uptime: nullable(server.uptime) ?? undefined,
      tcp: nullable(server.tcp_connections) ?? undefined,
      udp: nullable(server.udp_connections) ?? undefined,
    },
    os: server.os || '',
    kernel: server.kernel || '',
    arch: server.arch || '',
    virt: '',
    cpu_name: server.cpu_model || '',
    cpu_cores: nonneg(server.cpu_threads ?? server.cpu_cores),
    mem_total: nonneg(server.mem_total),
    swap_total: 0,
    disk_total: nonneg(server.disk_total),
    agent_version: '',
    price,
    currency: server.renewal_price_cny !== undefined ? 'CNY' : server.renewal_currency || 'CNY',
    billing_cycle: billingCycle(server),
    expires_at: expiresAt,
    expires_in: expiresIn,
    traffic_limit: nonneg(server.traffic_limit),
    traffic_mode:
      server.traffic_stats_mode === 'upload'
        ? 'up'
        : server.traffic_stats_mode === 'download'
          ? 'down'
          : server.traffic_stats_mode === 'max'
            ? 'max'
            : 'sum',
    traffic_reset_day: 1,
    total_rx: nonneg(server.cumulative_down ?? server.traffic_used_down),
    total_tx: nonneg(server.cumulative_up ?? server.traffic_used_up),
    month_rx: nonneg(server.traffic_used_down),
    month_tx: nonneg(server.traffic_used_up),
    ...(server.traffic_used_total !== undefined ? { month_used: nonneg(server.traffic_used_total) } : {}),
    month_start: server.period_start || '',
    day_rx: nonneg(today?.downlink),
    day_tx: nonneg(today?.uplink),
    provider_name: server.provider_name || '',
    ...(returnRoutes.length ? { return_routes: returnRoutes } : {}),
    ...(unlocks.length ? { unlocks } : {}),
    ...(server.conn_history?.tcp?.length || server.conn_history?.udp?.length ? { conn_history: server.conn_history } : {}),
  }
}

export interface FootballModel {
  nodes: MonitorNode[]
  /** 实时帧里的探测序列，按节点 id 索引；卡片条直接用它，不必等历史请求。 */
  series: Record<number, ProbePingSeries[]>
  scores: Record<number, NodeScore>
  updatedAt: number | null
  error?: string
  loading: boolean
  title: string
}

export function buildModel(payload: ProbePayload | undefined, error: string | undefined, updatedAt: number | undefined): FootballModel {
  const servers = payload?.servers ?? []
  const nodes = servers.map((server, index) => toMonitorNode(server, index))
  const series: Record<number, ProbePingSeries[]> = {}
  const scores: Record<number, NodeScore> = {}
  nodes.forEach((node, index) => {
    const ping = servers[index]?.ping ?? []
    series[node.id] = ping
    scores[node.id] = liveNetworkScore(ping)
  })
  return {
    nodes,
    series,
    scores,
    updatedAt: updatedAt ?? null,
    error,
    loading: !payload && !error,
    title: payload?.title || 'Football Monitor',
  }
}

/** 实时帧 → 主题历史：卡片条与评分共用，窗口取主控下发的桶长度（通常 1 小时）。 */
export function liveHistory(model: FootballModel, nodeId: number): HistoryResponse | undefined {
  const ping = model.series[nodeId]
  if (!ping?.length) return undefined
  const bucket = ping[0]?.buckets?.length ? 3600 / Math.max(1, ping[0].buckets.length) : 300
  const payload: SeriesPayload = { generated_at: Math.floor(Date.now() / 1000), bucket_sec: bucket }
  return historyFromPing(payload, ping, bucket)
}

/** 一条 24 小时探测序列的历史（网络质量页与详情页用）。 */
export function seriesHistory(payload: SeriesPayload, series: ProbePingSeries[]): HistoryResponse {
  const bucket = payload.bucket_sec && payload.bucket_sec > 0 ? payload.bucket_sec : 300
  return historyFromPing(payload, series, bucket)
}

// ---------- 配置 ----------

export interface FootballConfigFile {
  version?: number
  global?: Partial<GlobalConfig>
  nodes?: Record<string, NodeConfig>
}

const STORAGE_KEY = 'jiwo-football-config'

/** 只接受白名单值，避免静态 JSON 写错导致页面变形。 */
function pickGlobal(raw: Partial<GlobalConfig> | undefined, base: GlobalConfig): GlobalConfig {
  const out = { ...base }
  const one = <K extends keyof GlobalConfig>(key: K, values: readonly GlobalConfig[K][]) => {
    const value = raw?.[key]
    if (value !== undefined && (values as readonly unknown[]).includes(value)) out[key] = value
  }
  one('layout', ['comfortable', 'compact'] as const)
  one('card_size', ['standard', 'large'] as const)
  one('card_view', ['stacked', 'split'] as const)
  one('appearance', ['dark', 'light', 'system'] as const)
  const template = migrateTemplate(raw?.default_template, 'global')
  if (template) out.default_template = template
  for (const key of ['motion', 'show_summary', 'show_traffic', 'show_billing', 'show_daily', 'show_carriers', 'show_clock', 'show_score'] as const) {
    const value = raw?.[key]
    if (typeof value === 'boolean') out[key] = value
  }
  if (typeof raw?.exchange_rates === 'string' && parseRates(raw.exchange_rates)) out.exchange_rates = raw.exchange_rates
  return out
}

function pickNode(raw: NodeConfig): NodeConfig {
  const out: NodeConfig = {}
  const template = migrateTemplate(raw.template, 'node')
  if (template) out.template = template
  if (raw.provider && typeof raw.provider.id === 'string') out.provider = raw.provider
  if (raw.portrait) out.portrait = { ...DEFAULT_PORTRAIT, ...raw.portrait }
  if (raw.carriers) {
    out.carriers = {}
    for (const id of ['telecom', 'unicom', 'mobile'] as const) {
      const c = raw.carriers[id]
      if (!c) continue
      out.carriers[id] = {
        ...(Number.isSafeInteger(c.taskId) && Number(c.taskId) > 0 ? { taskId: Number(c.taskId) } : {}),
        ...(typeof c.line === 'string' ? { line: c.line.slice(0, 64) } : {}),
      }
    }
  }
  return out
}

export function buildTheme(
  file: FootballConfigFile | undefined,
  local: FootballConfigFile | undefined,
  /** 主控用 football-light / football-dark 或 appearance.color_mode 指定的默认明暗 */
  masterAppearance?: 'dark' | 'light' | 'system',
): ThemeConfig {
  const merged: FootballConfigFile = {
    global: { ...file?.global, ...local?.global },
    nodes: { ...file?.nodes, ...local?.nodes },
  }
  const nodes: Record<string, NodeConfig> = {}
  for (const [id, node] of Object.entries(merged.nodes || {})) {
    if (!/^[1-9]\d*$/.test(id)) continue
    nodes[id] = pickNode(node)
  }
  const theme: ThemeConfig = { ...pickGlobal(merged.global, DEFAULT_GLOBAL), nodes }
  // 明暗优先级：访客在本机选过（localStorage 里显式写了 appearance）> 主控下发 > theme.json 默认。
  // 用「本地文件里有没有这个键」判断，而不是比较值，否则访客选的和默认值相同时会被主控覆盖。
  const localChoice = local?.global?.appearance
  if (localChoice === undefined && masterAppearance) theme.appearance = masterAppearance
  return theme
}

export function readLocalConfig(): FootballConfigFile | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as FootballConfigFile
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

export function writeLocalConfig(config: FootballConfigFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 隐私模式下 localStorage 不可写：设置只在本次会话内生效，不阻断页面。
  }
}

export function clearLocalConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 同上。
  }
}

export const CONFIG_URL = '/football/theme.json'

export async function fetchConfigFile(): Promise<FootballConfigFile | undefined> {
  try {
    const response = await fetch(CONFIG_URL, { cache: 'no-cache' })
    if (!response.ok) return undefined
    const parsed = (await response.json()) as FootballConfigFile
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}
