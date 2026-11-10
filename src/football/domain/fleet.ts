import type { MonitorNode } from './types'

/** 参考汇率（1 单位外币折合人民币）；站长可在设置里改。 */
export const DEFAULT_RATES =
  'USD=7.10,EUR=7.80,GBP=9.20,JPY=0.047,HKD=0.91,SGD=5.40,AUD=4.60,CAD=5.10,KRW=0.0051,TWD=0.22'
/** 解析 `USD=7.1, JPY=0.047`（每单位折合人民币）；任一项格式错误返回 null。CNY 恒为 1。 */
export function parseRates(text: string): Record<string, number> | null {
  if (text.length > 512) return null
  const rates: Record<string, number> = { CNY: 1 }
  for (const pair of text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = /^([A-Za-z]{3})\s*=\s*(\d+(?:\.\d+)?)$/.exec(pair)
    if (!m || !(Number(m[2]) > 0)) return null
    rates[m[1]!.toUpperCase()] = Number(m[2])
  }
  return rates
}

const MONTH_DAYS = 365.25 / 12
const NAMED_MONTHS: Record<string, number> = {
  monthly: 1,
  month: 1,
  quarterly: 3,
  quarter: 3,
  semiannual: 6,
  half_year: 6,
  yearly: 12,
  year: 12,
  biennial: 24,
  two_year: 24,
  triennial: 36,
  three_year: 36,
  five_year: 60,
}
export function cycleMonths(cycle: string): number | null {
  if (NAMED_MONTHS[cycle]) return NAMED_MONTHS[cycle]
  const n = Number(/^(\d+)m$/.exec(cycle)?.[1])
  return n >= 1 && n <= 1200 ? n : null
}
/**
 * 当前计费周期还剩的价值：续费价 × 剩余天数 ÷ 周期天数。
 * 只用主控下发的 expires_in，不用浏览器时钟；价格、到期日或周期未知时为 null。
 */
export function remainingValue(node: MonitorNode): { amount: number; currency: string } | null {
  // 免费机器不管什么时候到期都不值钱。
  if (node.price === 0) return { amount: 0, currency: node.currency }
  const months = cycleMonths(node.billing_cycle)
  if (node.price === null || node.expires_in == null || months === null) return null
  return {
    amount: (node.price * Math.max(0, node.expires_in)) / (months * MONTH_DAYS),
    currency: node.currency,
  }
}

export interface FleetSummary {
  total: number
  online: number
  memUsed: number
  memTotal: number
  diskUsed: number
  diskTotal: number
  rx: number
  tx: number
  traffic: number
  /** 今日主控记账流量，含离线节点。 */
  today: number
  /** 剩余价值（人民币）；没有一台能定价时为 null。 */
  value: number | null
  /** 续费价折算的每月成本（人民币）；没有一台能定价时为 null。 */
  monthly: number | null
  /** 已付费但价值不可算的节点（无到期日、周期未知或没有汇率）。 */
  uncounted: number
}
export function fleetSummary(nodes: MonitorNode[], rates: Record<string, number>): FleetSummary {
  const s: FleetSummary = {
    total: nodes.length,
    online: 0,
    memUsed: 0,
    memTotal: 0,
    diskUsed: 0,
    diskTotal: 0,
    rx: 0,
    tx: 0,
    traffic: 0,
    today: 0,
    value: null,
    monthly: null,
    uncounted: 0,
  }
  for (const n of nodes) {
    s.traffic += n.total_rx + n.total_tx
    s.today += n.day_rx + n.day_tx
    // 离线节点保留最后上报值，但那不是实时值。
    const m = n.online ? n.metrics : null
    if (n.online) s.online++
    if (m) {
      s.memUsed += m.mem_used
      s.memTotal += m.mem_total
      s.diskUsed += m.disk_used
      s.diskTotal += m.disk_total
      s.rx += m.net_rx
      s.tx += m.net_tx
    }
    if (n.price === null) continue
    const value = remainingValue(n),
      rate = value && (value.amount === 0 ? 1 : rates[value.currency.toUpperCase()])
    if (value && rate) s.value = (s.value ?? 0) + value.amount * rate
    else s.uncounted++
    const months = n.price === 0 ? 1 : cycleMonths(n.billing_cycle),
      yuan = n.price === 0 ? 1 : rates[n.currency.toUpperCase()]
    if (months && yuan) s.monthly = (s.monthly ?? 0) + (n.price / months) * yuan
  }
  return s
}

/** 有到期日的节点，最快到期（或已过期）在前。 */
export function expiringSoon(nodes: MonitorNode[], limit = 5) {
  return nodes
    .filter((n): n is MonitorNode & { expires_at: string } => n.expires_at !== null)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit)
    .map((node) => ({ node, days: node.expires_in ?? null }))
}

/** 今天跑过流量的节点，最忙的在前，各带相对最忙者的占比。 */
export function todayTrafficTop(nodes: MonitorNode[], limit = 5) {
  const ranked = nodes
    .map((node) => ({ node, total: node.day_rx + node.day_tx }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total || a.node.name.localeCompare(b.node.name, 'zh-CN'))
    .slice(0, limit)
  const top = ranked[0]?.total ?? 0
  return ranked.map((e) => ({ ...e, share: e.total / top }))
}
