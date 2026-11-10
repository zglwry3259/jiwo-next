/**
 * 主题内部数据契约。
 * 与 football-monitor 的公开契约保持一致：字段全部由 model.ts 从妙妙屋 X 的 ProbeServer 映射而来，
 * 下游组件只认这里，不再处理主控原始字段。
 */
import type { ProbeConnHistory, ProbeReturnRoute, ProbeUnlock } from '../../types'

export interface Metrics {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  /** 节点接收速率（byte/s），对应主控 download_speed */
  net_rx: number
  /** 节点发送速率（byte/s），对应主控 upload_speed */
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}

export interface MonitorNode {
  /** 主题内 id = 主控下发顺序（从 1 开始），也是 /api/series 的 server 参数 */
  id: number
  name: string
  sort: number
  public: boolean
  online: boolean
  /** 两位大写国家码 */
  country: string
  group: string
  public_remark: string
  last_seen: number | null
  last_seen_ago?: number | null
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  agent_version: string
  price: number | null
  currency: string
  billing_cycle: string
  expires_at: string | null
  expires_in?: number | null
  traffic_limit: number
  /** up / down / max / sum */
  traffic_mode: string
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  month_used?: number
  month_start: string
  day_rx: number
  day_tx: number
  provider_name?: string
  /** 主控下发的回程路由检测，详情页三网区块用来补线路名 */
  return_routes?: ProbeReturnRoute[]
  /** 流媒体解锁检测，原样带下来交给 jiwo-probe 的 unlocks.ts 解释状态 */
  unlocks?: ProbeUnlock[]
  /** 近 1 小时连接数（12 个 5 分钟均值），null 为缺样 */
  conn_history?: ProbeConnHistory
}

export interface MetricPoint {
  ts: number
  cpu: number | null
  mem_used: number | null
  disk_used: number | null
  net_rx: number | null
  net_tx: number | null
  minutes?: number
}

export interface PingPoint {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

export interface HistoryResponse {
  metrics: MetricPoint[]
  ping: PingPoint[]
  probes: Record<string, string>
  loss: Record<string, number>
  step: number
}

export type SkinId =
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'weekly-black'
  | 'pioneer'
  | 'legend'
  | 'galaxy'
  | 'shatter'
  | 'toty-xi'
  | 'neon'
  | 'splash'
  | 'lapis'
  | 'neon-city'
  | 'emerald'
  | 'toty-orbit'
  | 'prism'
  | 'glitch'
export type TemplateId = SkinId | 'auto'
export type CarrierId = 'telecom' | 'unicom' | 'mobile'

export interface CarrierConfig {
  taskId?: number
  line?: string
}

export interface PortraitConfig {
  url?: string
  scale: number
  x: number
  y: number
  fit: 'cover' | 'contain'
  area: 'full' | 'upper'
  hidden?: boolean
  box?: 'bleed'
  builtin?: string
}

export interface ProviderConfig {
  id: string
  name?: string
  logo?: string
}

export interface NodeConfig {
  template?: TemplateId
  provider?: ProviderConfig
  portrait?: PortraitConfig
  carriers?: Partial<Record<CarrierId, CarrierConfig>>
}

export type CardView = 'stacked' | 'split'

export interface GlobalConfig {
  default_template: TemplateId
  layout: 'comfortable' | 'compact'
  card_size: 'standard' | 'large'
  card_view: CardView
  appearance: 'dark' | 'light' | 'system'
  motion: boolean
  show_summary: boolean
  show_traffic: boolean
  show_billing: boolean
  /** 今日流量（首页今日排行、详情今日数字）；主控关闭日趋势时压成 false */
  show_daily: boolean
  show_carriers: boolean
  show_clock: boolean
  /** 评分（卡面评级、平均评分、评分明细）；主控关闭健康分时会被压成 false */
  show_score: boolean
  exchange_rates: string
}

export interface ThemeConfig extends GlobalConfig {
  nodes: Record<string, NodeConfig>
}
