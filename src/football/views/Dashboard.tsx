import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  CalendarClock,
  ChartBarDecreasing,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Wallet,
  WifiOff,
} from 'lucide-react'
import { flagUrl } from '../domain/flags'
import { bytes, cycle, money, windowLabel } from '../domain/format'
import { expiringSoon, fleetSummary, parseRates, todayTrafficTop } from '../domain/fleet'
import { emptyScore, nextTier, type NodeScore, type Tier } from '../domain/score'
import type { HistoryResponse, MonitorNode, ThemeConfig } from '../domain/types'
import type { ForwardChainData } from '../../types'
import { AsciiClock } from '../components/AsciiClock'
import { LiveCard } from '../components/LiveCard'
import { ForwardBoard } from '../components/ForwardBoard'
import { useSpeed } from '../hooks'
import { Link, PageHeading } from '../components/PageHeading'

type Status = 'all' | 'online' | 'offline'
type Sort = 'hub' | 'score' | 'name'

const statuses: { id: Status; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'online', label: '在线' },
  { id: 'offline', label: '离线' },
]
const TIER_NAMES: Record<Tier, string> = { gold: '金', silver: '银', bronze: '铜' }

interface Segment {
  share: number
  tone: string
}
interface Tile {
  label: string
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** 展开 Partial<Tile> 时会被放宽成可选，渲染处统一兜底「—」。 */
  value?: string
  unit?: string
  tone?: string
  note?: string
  bar?: Segment[]
  detail?: string
  spark?: { kind: 'up' | 'down'; values: number[] }
}

// "9.7 GB" -> ["9.7", "GB"]：大数字，小单位。
const split = (text: string) => {
  const i = text.lastIndexOf(' ')
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)]
}

// 100 × 24 框里的迷你折线：最新样本贴右边，最低最高之间铺开；平稳的速率走中间。
const SPARK_STEP = 100 / 29
function sparkPoints(values: number[]) {
  const lo = Math.min(...values),
    hi = Math.max(...values),
    steady = hi - lo <= hi * 0.02,
    pts = values.map((v, i) => {
      const x = 100 - (values.length - 1 - i) * SPARK_STEP,
        y = steady ? 12 : 22 - ((v - lo) / (hi - lo)) * 20
      return `${Number(x.toFixed(1))},${Number(y.toFixed(1))}`
    })
  const first = pts[0]!.split(',')[0]
  return { line: pts.join(' '), area: `${first},24 ${pts.join(' ')} 100,24` }
}

const daysText = (days: number | null) =>
  days === null ? '' : days < 0 ? `已过期 ${-days} 天` : days === 0 ? '今天' : `${days} 天`
const level = (days: number | null) => (days === null ? undefined : days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'ok')

export function Dashboard({
  nodes,
  config,
  scores,
  tiers,
  history,
  historyFailed,
  liveOf,
  updatedAt,
  error,
  loading,
  requestHistory,
  onRefresh,
  hasLogin,
  search: sharedSearch,
  onSearch,
  forward,
}: {
  nodes: MonitorNode[]
  config: ThemeConfig
  scores: Record<number, NodeScore>
  tiers: Record<number, Tier>
  history: Record<number, HistoryResponse>
  historyFailed: Record<number, boolean>
  /** 实时帧的一小时探测桶；24 小时历史还没回来时用它，卡片条与三网不至于全空。 */
  liveOf?: (nodeId: number) => HistoryResponse | undefined
  updatedAt: number | null
  error?: string
  loading: boolean
  requestHistory: (nodeId: number) => void
  onRefresh: () => void
  hasLogin: boolean
  /** 顶部导航的搜索框也写同一个词；不传时这个页面自己维护。 */
  search?: string
  onSearch?: (value: string) => void
  /** 主控 show_forward 打开时下发的转发链路 */
  forward?: ForwardChainData[]
}) {
  const [group, setGroup] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('hub')
  const [ownSearch, setOwnSearch] = useState('')
  const search = sharedSearch ?? ownSearch
  const setSearch = onSearch ?? setOwnSearch

  const groups = useMemo(() => [...new Set(nodes.map((n) => n.group).filter(Boolean))], [nodes])
  const grouped = nodes.filter((n) => group === null || n.group === group)
  const overall = (n: MonitorNode) => scores[n.id]?.overall ?? null
  const term = search.toLowerCase().trim()
  const filtered = (() => {
    const list = grouped.filter(
      (n) =>
        (status === 'all' || n.online === (status === 'online')) &&
        `${n.name} ${n.group} ${n.public_remark}`.toLowerCase().includes(term),
    )
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    if (sort === 'score') return [...list].sort((a, b) => (overall(b) ?? -1) - (overall(a) ?? -1))
    return list
  })()

  const speed = useSpeed()
  const rates = useMemo(() => parseRates(config.exchange_rates) ?? { CNY: 1 }, [config.exchange_rates])
  const summary = useMemo(() => fleetSummary(grouped, rates), [grouped, rates])
  const expiring = expiringSoon(grouped)
  const trafficTop = todayTrafficTop(grouped)
  const boards = Number(config.show_billing) + Number(config.show_traffic)

  // 本组最近若干次刷新的全站速率；切分组重新开始。
  const SAMPLES = 30
  const [samples, setSamples] = useState<{ rx: number; tx: number }[]>([])
  const lastUpdate = useRef<number | null>(null)
  useEffect(() => {
    if (updatedAt === null || lastUpdate.current === updatedAt) return
    lastUpdate.current = updatedAt
    setSamples((prev) => [...prev, { rx: summary.rx, tx: summary.tx }].slice(-SAMPLES))
  }, [updatedAt, summary.rx, summary.tx])
  useEffect(() => setSamples([]), [group])

  const average = (() => {
    const values = grouped.map(overall).filter((v): v is number => v !== null)
    return values.length ? String(Math.round(values.reduce((a, b) => a + b, 0) / values.length)) : '—'
  })()

  // 已评分节点的档位分布，最好的在前，与卡面一致。
  const tierSplit = (() => {
    const counts: Record<Tier, number> = { gold: 0, silver: 0, bronze: 0 }
    for (const n of grouped) {
      const score = overall(n)
      if (score !== null) counts[tiers[n.id] ?? nextTier(score)]++
    }
    const shown = (Object.keys(counts) as Tier[]).filter((t) => counts[t]),
      total = shown.reduce((sum, t) => sum + counts[t], 0)
    if (!total) return {}
    return {
      bar: shown.map((t) => ({ share: counts[t] / total, tone: t })),
      detail: shown.map((t) => `${TIER_NAMES[t]} ${counts[t]}`).join(' · '),
    }
  })()

  const usage = (used: number, total: number): Partial<Tile> => {
    if (!total) return { value: '—', unit: '' }
    const [value, unit] = split(bytes(used)),
      share = used / total
    return {
      value: value!,
      unit: `${unit} / ${bytes(total)}`,
      bar: [{ share, tone: share < 0.6 ? 'good' : share < 0.85 ? 'ok' : 'bad' }],
      detail: `已用 ${Math.round(share * 100)}%`,
    }
  }

  const s = summary
  const [traffic, trafficUnit] = split(bytes(s.traffic))
  // 速率跟主控下发的站点单位走（bit 时是 Mbps，byte 时是 MB/s）。
  const [up, upUnit] = split(speed(s.tx))
  const [down, downUnit] = split(speed(s.rx))
  const tiles: Tile[] = [
    {
      label: '在线节点',
      icon: Server,
      value: String(s.online),
      unit: `/ ${s.total}`,
      tone: 'summary-online',
      ...(s.total
        ? { bar: [{ share: s.online / s.total, tone: 'online' }], detail: s.online === s.total ? '全部在线' : `离线 ${s.total - s.online} 台` }
        : {}),
    },
    // 卡面评级是卡的一部分，保留；主控关掉健康分时只收起这个汇总格与详情页的评分分区。
    ...(config.show_score ? [{ label: '平均评分', icon: Gauge, value: average, tone: 'summary-score', ...tierSplit }] : []),
    { label: '内存用量', icon: MemoryStick, ...usage(s.memUsed, s.memTotal) },
    { label: '硬盘用量', icon: HardDrive, ...usage(s.diskUsed, s.diskTotal) },
    ...(config.show_billing
      ? [
          {
            label: '剩余价值',
            icon: Wallet,
            value: s.value === null ? '—' : `¥${s.value.toFixed(2)}`,
            unit: s.value === null ? '' : 'CNY',
            detail: s.monthly === null ? '' : `折合每月 ¥${s.monthly.toFixed(2)}`,
            note: s.uncounted ? `${s.uncounted} 台缺到期日或汇率，未计入` : '',
          },
        ]
      : []),
    { label: '累计流量', icon: Database, value: traffic!, unit: trafficUnit, detail: `今日 ${bytes(s.today)}` },
    { label: '实时上行', icon: ChevronsUp, value: up!, unit: upUnit, spark: { kind: 'up', values: samples.map((v) => v.tx) } },
    { label: '实时下行', icon: ChevronsDown, value: down!, unit: downUnit, spark: { kind: 'down', values: samples.map((v) => v.rx) } },
  ]

  return (
    <>
      <PageHeading
        crumbs={[{ label: 'Football Monitor', to: '/' }, { label: '首页' }]}
        title="首发阵容"
        description="每个节点都是一名球员，评分为网络质量（0–99）。"
        aside={config.show_clock ? <AsciiClock motion={config.motion} /> : undefined}
        tabs={
          <div className="group-tabs" role="group" aria-label="节点分组">
            <button className={group === null ? 'selected' : ''} aria-pressed={group === null} onClick={() => setGroup(null)}>
              全部节点 <small>{nodes.length}</small>
            </button>
            {groups.map((g) => (
              <button key={g} className={group === g ? 'selected' : ''} aria-pressed={group === g} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
            {groups.length > 0 && nodes.some((n) => !n.group) && (
              <button className={group === '' ? 'selected' : ''} aria-pressed={group === ''} onClick={() => setGroup('')}>
                未分组
              </button>
            )}
          </div>
        }
      >
        <span className="sync-note">
          <span className="live-dot" />
          {updatedAt ? '与主控保持同步' : '等待首次数据'}
        </span>
        <label className="head-search">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索球员" aria-label="搜索节点" />
        </label>
      </PageHeading>

      {loading ? (
        <div className="empty-state panel" role="alert">
          <RefreshCw size={34} className="spin" />
          <h2>正在读取阵容</h2>
          <p>等待主控的第一帧数据。</p>
        </div>
      ) : !nodes.length ? (
        <div className="empty-state panel" role="alert">
          <WifiOff size={34} />
          <h2>此刻，主场暂未开放</h2>
          <p>{error || '主控没有下发任何节点，或探针尚未启用。'}</p>
          {hasLogin ? (
            <a className="primary-link" href="#/settings">
              前往主题设置
            </a>
          ) : null}
          <button type="button" className="fb-btn fb-btn-outline" onClick={onRefresh}>
            重新检查
          </button>
        </div>
      ) : (
        <>
          {config.show_summary && (
            <div className="overview" data-boards={boards}>
              <section className="summary-grid" aria-label="服务器汇总">
                {tiles.map((t) => {
                  const Icon = t.icon
                  return (
                    <div key={t.label} className="summary-stat panel">
                      <span className="summary-stat-label">{t.label}</span>
                      <Icon className="summary-icon" size={18} aria-hidden="true" />
                      {t.spark && t.spark.values.length > 1 && (
                        <svg className="summary-spark" data-kind={t.spark.kind} viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                          <polygon points={sparkPoints(t.spark.values).area} />
                          <polyline points={sparkPoints(t.spark.values).line} />
                        </svg>
                      )}
                      <div className="summary-stat-body">
                        <strong className={`summary-stat-value ${t.tone ?? ''}`}>
                          {t.value ?? '—'}
                          {t.unit && <small>{t.unit}</small>}
                        </strong>
                        {t.bar && (
                          <span className="summary-bar" aria-hidden="true">
                            {t.bar.map((seg) => (
                              <i key={seg.tone} data-tone={seg.tone} style={{ width: `${seg.share * 100}%` }} />
                            ))}
                          </span>
                        )}
                        {t.detail && <span className="summary-detail">{t.detail}</span>}
                        {t.note && <span className="summary-note">{t.note}</span>}
                      </div>
                    </div>
                  )
                })}
              </section>
              {config.show_billing && (
                <section className="expiry-board panel" aria-labelledby="expiry-title">
                  <h2 id="expiry-title">
                    <CalendarClock size={15} aria-hidden="true" />
                    即将到期
                  </h2>
                  {expiring.length ? (
                    <ol>
                      {expiring.map((e) => (
                        <li key={e.node.id}>
                          <Link to={`/node/${e.node.id}`} className="expiry-row">
                            {e.node.country && flagUrl(e.node.country) && (
                              <img className="expiry-flag" src={flagUrl(e.node.country)} alt="" />
                            )}
                            <span className="expiry-name">{e.node.name}</span>
                            <span className="expiry-days" data-level={level(e.days)}>
                              {daysText(e.days)}
                            </span>
                            <span className="expiry-meta">
                              {e.node.expires_at} 到期
                              {e.node.price !== null && ` · ${money(e.node.price, e.node.currency)}/${cycle(e.node.billing_cycle)}`}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="expiry-empty">还没有设置到期日的节点</p>
                  )}
                </section>
              )}
              {config.show_daily && (
                <section className="traffic-board panel" aria-labelledby="traffic-title">
                  <h2 id="traffic-title">
                    <ChartBarDecreasing size={15} aria-hidden="true" />
                    今日流量
                  </h2>
                  {trafficTop.length ? (
                    <ol>
                      {trafficTop.map((t, i) => (
                        <li key={t.node.id}>
                          <Link
                            to={`/node/${t.node.id}`}
                            className="traffic-row"
                            title={`今日下行 ${bytes(t.node.day_rx)} · 今日上行 ${bytes(t.node.day_tx)}`}
                          >
                            <span className="traffic-rank" data-rank={i + 1}>
                              {i + 1}
                            </span>
                            {t.node.country && flagUrl(t.node.country) && (
                              <img className="expiry-flag" src={flagUrl(t.node.country)} alt="" />
                            )}
                            <span className="expiry-name">{t.node.name}</span>
                            <span className="traffic-total">{bytes(t.total)}</span>
                            <span className="traffic-bar" aria-hidden="true">
                              <i style={{ width: `${t.share * 100}%` }} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="expiry-empty">今天还没有节点产生流量</p>
                  )}
                </section>
              )}
            </div>
          )}

          {/* 转发链路是站点级对象，横跨整行放在汇总区下面。 */}
          {forward?.length ? <ForwardBoard chains={forward} /> : null}

          <section id="squad" className="squad-section" aria-label="节点列表">
            <div className="squad-toolbar">
              <div className="status-filter" role="group" aria-label="状态筛选">
                {statuses.map((item) => (
                  <button key={item.id} className={status === item.id ? 'selected' : ''} aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="node-count">{filtered.length} 名球员</span>
              <label className="sort-control" htmlFor="node-sort">
                排序
                <span className="sort-select">
                  <select id="node-sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                    <option value="hub">主控顺序</option>
                    <option value="score">综合分</option>
                    <option value="name">名称</option>
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
            </div>
            {error && (
              <div className="inline-notice" role="status">
                <WifiOff size={16} />
                <span>
                  {error}
                  {updatedAt ? ' · 当前显示上次成功数据' : ''}
                </span>
                <button type="button" className="fb-btn fb-btn-ghost fb-btn-sm" onClick={onRefresh}>
                  重试
                </button>
              </div>
            )}
            {!filtered.length ? (
              <div className="empty-state panel">
                <Server size={32} />
                <h3>{nodes.length ? '没有找到匹配的球员' : error ? '暂时无法获取节点' : '阵容正在等待第一位球员'}</h3>
                <p>{nodes.length ? '试试其他名称，或切换分组。' : '请在妙妙屋 X 主控中添加节点，并允许在公开页显示。'}</p>
                {nodes.length > 0 && (
                  <button
                    type="button"
                    className="fb-btn fb-btn-outline"
                    onClick={() => {
                      setGroup(null)
                      setStatus('all')
                      setSearch('')
                    }}
                  >
                    查看全部节点
                  </button>
                )}
              </div>
            ) : (
              <div className="card-grid" data-layout={config.layout} data-size={config.card_size} data-view={config.card_view}>
                {filtered.map((node, index) => (
                  <LiveCard
                    key={node.id}
                    node={node}
                    view={config.card_view}
                    config={config}
                    score={scores[node.id] ?? emptyScore()}
                    tier={tiers[node.id] ?? nextTier(scores[node.id]?.overall ?? null)}
                    history={history[node.id] ?? liveOf?.(node.id)}
                    // 用实时桶兜底时不能再挂「历史加载失败」，否则条子会被当成无数据。
                    historyFailed={history[node.id] ? historyFailed[node.id] : false}
                    index={index}
                    onVisible={() => requestHistory(node.id)}
                  />
                ))}
              </div>
            )}
            <p className="squad-footnote">
              <span>●</span> 三网延迟为节点到指定目标的 TCP 握手时间，非访客到节点的访问延迟。
              {config.show_carriers ? ` · 探测窗口 ${windowLabel(1)}` : ''}
            </p>
          </section>
        </>
      )}
    </>
  )
}
