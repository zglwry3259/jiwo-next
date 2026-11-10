import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Clock, RefreshCw, Settings2, Tag } from 'lucide-react'
import { carrierOfSeries, carriers, lossColor, lossGrade, resolveCarrier, resolveTask, taskLoss } from '../domain/carriers'
import type { ChartSeries } from '../domain/chart'
import {
  bytes,
  countryName,
  cycle,
  duration,
  expiry,
  money,
  percent,
  trafficUsed,
  windowLabel,
  windows,
} from '../domain/format'
import { fetchSeries, linesOf, metricsFromSystem, probeMeta, withMetrics, type SystemPayload } from '../domain/history'
import { seriesHistory } from '../model'
import { emptyScore, networkScore, type Tier } from '../domain/score'
import { nodeTemplate, skinOf } from '../domain/skins'
import type { CarrierId, HistoryResponse, MonitorNode, ThemeConfig } from '../domain/types'
import { CarrierRow } from '../components/CarrierRow'
import { CardLiveStrip } from '../components/CardLiveStrip'
import { HistoryChart } from '../components/HistoryChart'
import { PageHeading, Link } from '../components/PageHeading'
import type { Vars } from '../css'
import { PlayerCard } from '../components/PlayerCard'
import { Sparkline } from '../components/Sparkline'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import { unlockService, unlockStatus, unlockSummary } from '../../unlocks'
import { useProbe } from '../../use-probe'

/** 小时数 → /api/series 的 range 键。 */
export function rangeKey(hours: number): string {
  if (hours <= 1) return '1h'
  if (hours <= 6) return '6h'
  if (hours <= 24) return '24h'
  return `${Math.min(7, Math.max(2, Math.round(hours / 24)))}d`
}

export function NodeDetail({
  node,
  config,
  tier,
  score,
  historyDays,
  pingHistory,
}: {
  node: MonitorNode | undefined
  config: ThemeConfig
  tier: Tier
  score: ReturnType<typeof emptyScore>
  historyDays: number
  pingHistory?: HistoryResponse
}) {
  const [hours, setHours] = useState(6)
  const [data, setData] = useState<HistoryResponse>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const nodeId = node?.id

  const load = useCallback(
    async (force = false) => {
      if (!nodeId) return
      const epoch = ++generation.current
      setBusy(true)
      setError('')
      try {
        const range = rangeKey(hours)
        const [pingPayload, systemPayload] = await Promise.all([
          // server 参数是主控数组下标（0 基），主题内 id 从 1 开始。
          fetchSeries(nodeId - 1, range, 'all', undefined, force),
          fetchSeries<SystemPayload>(nodeId - 1, range, 'system', undefined, force).catch(() => undefined),
        ])
        if (epoch !== generation.current) return
        const series = linesOf(pingPayload)
        const built = seriesHistory(pingPayload, series)
        setData(withMetrics(built, metricsFromSystem(systemPayload?.series)))
      } catch (cause) {
        if (epoch === generation.current) {
          setData(undefined)
          setError(cause instanceof Error ? cause.message : '历史数据加载失败')
        }
      } finally {
        if (epoch === generation.current) setBusy(false)
      }
    },
    [nodeId, hours],
  )

  useEffect(() => {
    setData(undefined)
    void load()
    return () => {
      generation.current++
    }
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  // 24 小时历史到齐后用历史评分覆盖实时评分，与卡面口径一致。
  const { networkSpeedUnit } = useProbe()
  const scored = useMemo(() => {
    if (!node) return emptyScore()
    if (data?.ping.length) return networkScore(node, data)
    return score
  }, [node, data, score])

  if (!node) {
    return (
      <div className="empty-state panel">
        <h2>这个节点暂时不在阵容中</h2>
        <p>节点可能已移除、设为私有，或主控暂时没有下发。</p>
        <Link to="/" className="primary-link">
          返回首页
        </Link>
      </div>
    )
  }

  const live = node.online ? node.metrics : null
  const tierNames: Record<Tier, string> = { gold: '金卡', silver: '银卡', bronze: '铜卡' }
  const template = nodeTemplate(config, node.id)
  const tierLabel =
    template === 'auto' ? `${tierNames[tier]} · 卡面自动（按评分）` : `${tierNames[tier]} · 卡面固定为${skinOf(template).name}`
  const lastSeen = (() => {
    if (!node.last_seen) return '—'
    const at = new Date(node.last_seen * 1000).toLocaleString('zh-CN', { hour12: false })
    if (node.last_seen_ago == null) return at
    return `${at}（${node.last_seen_ago < 60 ? '刚刚' : `${duration(node.last_seen_ago)}前`}）`
  })()
  const showBilling = config.show_billing || config.show_traffic
  const used = trafficUsed(node)
  const traffic = { used, share: node.traffic_limit > 0 ? percent(used, node.traffic_limit) : null }
  const ranges = windows(historyDays || 7)
  const unlockItems = node.unlocks ?? []
  const unlocks = unlockSummary(unlockItems)
  const tabs = [
    { id: 'billing', label: '费用与流量', show: showBilling },
    { id: 'carriers', label: '三网线路', show: config.show_carriers },
    { id: 'unlocks', label: '解锁检测', show: unlockItems.length > 0 },
    // 主控关闭健康分（show_health_score === false）时整个评分分区不出现。
    { id: 'score', label: '评分明细', show: config.show_score },
    { id: 'history', label: '历史表现', show: true },
    { id: 'system', label: '系统信息', show: true },
  ].filter((t) => t.show)

  const jump = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    const smooth = config.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    window.history.replaceState(window.history.state, '', `#${id}`)
  }

  const resource = (key: 'cpu' | 'mem_used' | 'disk_used', name: string, color: string): ChartSeries[] => [
    {
      name,
      color,
      points: (data?.metrics ?? []).map((p) => ({
        ts: p.ts,
        value: key === 'cpu' ? p.cpu : percent(p[key], key === 'mem_used' ? node.mem_total : node.disk_total),
      })),
    },
  ]
  // 速率图跟着站点单位走：bit 时换算成 Mbps（byte/s × 8 / 1e6），byte 时用 MB/s。
  const bits = networkSpeedUnit === 'bits'
  const network: ChartSeries[] = (['net_rx', 'net_tx'] as const).map((key, i) => ({
    name: i ? '上传' : '下载',
    color: i ? '#60a5fa' : '#4ade80',
    points: (data?.metrics ?? []).map((p) => ({
      ts: p.ts,
      value: p[key] === null ? null : bits ? (p[key]! * 8) / 1e6 : p[key]! / 1024 ** 2,
    })),
  }))
  const pingSeries: ChartSeries[] = (() => {
    const ids = [...new Set((data?.ping ?? []).map((p) => p.task_id))]
    return ids.map((id, i) => ({
      name: data?.probes[id] || `任务 #${id}`,
      color: carriers[i % 3]!.color,
      points: (data?.ping ?? []).filter((p) => p.task_id === id).map((p) => ({ ts: p.ts, value: p.latency })),
    }))
  })()
  // 主控下发的探测没有数字 task_id，站长也没填时按 isp / key / 探测名里的运营商自动绑定，
  // 否则默认状态下三网区块全是「未配置探测」。
  const autoTasks = (() => {
    const out: Partial<Record<CarrierId, number>> = {}
    const carriersConf = config.nodes[String(node.id)]?.carriers
    for (const [id, label] of Object.entries(data?.probes ?? {})) {
      const taskId = Number(id)
      const meta = probeMeta(taskId)
      const carrier = carrierOfSeries({ label, key: meta?.key, isp: meta?.isp })
      if (!carrier || carriersConf?.[carrier]?.taskId) continue
      if (out[carrier] === undefined) out[carrier] = taskId
    }
    return out
  })()
  // 主控回程路由检测给出的线路名（CN2 GIA、9929…），站长没填 line 时补到三网行上。
  const routeLines: Partial<Record<CarrierId, string>> = {}
  for (const route of node.return_routes ?? []) {
    if (route.route_type) routeLines[route.carrier] = route.route_type
  }
  const carrierTasks = carriers.map((c) => {
    const configured = config.nodes[String(node.id)]?.carriers?.[c.id]
    const taskId = configured?.taskId ?? autoTasks[c.id]
    // 线路名优先级：站长填的 > 主控回程路由检测 > 探测任务名。
    const line = configured?.line || routeLines[c.id] || (taskId !== undefined ? data?.probes[String(taskId)] : '') || ''
    const r = resolveCarrier(
      { ...configured, ...(taskId !== undefined ? { taskId } : {}), ...(line ? { line } : {}) },
      pingHistory,
      Date.now() / 1000,
    )
    return { ...c, ...r, probe: r.taskId ? data?.probes[String(r.taskId)] : undefined, loss: r.taskId ? taskLoss(data, r.taskId) : null }
  })
  // 没有挂在运营商行上的探测（同一运营商配了第二条线路）单独列出。
  // 按 probes 而不是 loss 遍历：延迟有值、丢包没下发的探测也要露出来，否则整条消失。
  const shownTasks = new Set(carrierTasks.map((c) => c.taskId))
  const otherProbes = Object.entries(data?.probes ?? {})
    .filter(([id]) => !shownTasks.has(Number(id)))
    .map(([id, name]) => {
      const taskId = Number(id)
      return { id, name, latency: resolveTask(taskId, pingHistory, Date.now() / 1000).latency, loss: taskLoss(data, taskId) }
    })
  const pct = (loss: number) => `${Number(loss.toFixed(1))}%`

  return (
    <>
      <PageHeading
        crumbs={[{ label: 'Football Monitor', to: '/' }, { label: '首页', to: '/' }, { label: node.name }]}
        title={node.name}
        description={node.public_remark || '节点信息由妙妙屋 X 主控提供。'}
      >
        <span className={`detail-status${node.online ? '' : ' offline'}`}>
          <i aria-hidden="true" />
          {node.online ? '在线' : '离线'}
        </span>
        <Link to={`/settings?node=${node.id}`} className="fb-btn fb-btn-outline">
          <Settings2 size={15} /> 配置此节点
        </Link>
      </PageHeading>

      <nav className="detail-tabs" aria-label="详情分区">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            onClick={(event) => {
              event.preventDefault()
              jump(t.id)
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <div className="detail-layout">
        <aside className="detail-card-column">
          <PlayerCard node={node} config={config} score={scored} tier={tier} size="lg" interactive={false} />
          <CardLiveStrip
            node={node}
            nodeConfig={config.nodes[String(node.id)]}
            history={pingHistory}
            showCarriers={config.show_carriers}
            showTraffic={config.show_traffic && config.show_daily}
          />
          <section className="detail-basic panel" aria-labelledby="basic-title">
            <h2 id="basic-title" className="detail-section-title">
              基本信息
            </h2>
            <dl className="detail-list">
              <div>
                <dt>档位</dt>
                <dd>{tierLabel}</dd>
              </div>
              <div>
                <dt>分组</dt>
                <dd>{node.group || '未分组'}</dd>
              </div>
              <div>
                <dt>国家 / 地区</dt>
                <dd>
                  {countryName(node.country)}
                  {node.country ? ` · ${node.country}` : ''}
                </dd>
              </div>
              <div>
                <dt>最后上报</dt>
                <dd>{lastSeen}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <div className="detail-content">
          {showBilling && (
            <section id="billing" className="detail-section" aria-labelledby="billing-title">
              <h2 id="billing-title" className="detail-section-title">
                费用与流量
              </h2>
              <div className="billing-blocks">
                {config.show_billing && (
                  <div className="billing-block billing-fee panel">
                    <span>费用 / 周期</span>
                    <strong>{money(node.price, node.currency)}</strong>
                    <small>{node.price ? `每${cycle(node.billing_cycle)}` : '未设置计费周期'}</small>
                  </div>
                )}
                {config.show_billing && (
                  <div className="billing-block billing-expiry panel">
                    <span>到期状态</span>
                    <strong>{expiry(node)}</strong>
                    <small>{node.expires_at ? `到期日 ${node.expires_at}` : '长期有效或未填写'}</small>
                  </div>
                )}
                {config.show_traffic && (
                  <div className="billing-block billing-traffic panel">
                    <span>本周期流量 / 配额</span>
                    <strong>
                      {bytes(traffic.used)} <small>/ {node.traffic_limit > 0 ? bytes(node.traffic_limit) : '不限量'}</small>
                    </strong>
                    {traffic.share !== null && (
                      <div className="traffic-bar" aria-hidden="true">
                        <i style={{ width: `${traffic.share}%` }} />
                      </div>
                    )}
                    <small>
                      {traffic.share !== null
                        ? `已用 ${Number(traffic.share.toFixed(1))}% · 每月 ${node.traffic_reset_day} 日重置`
                        : '本周期不限流量'}
                    </small>
                  </div>
                )}
                {config.show_daily && (
                  <div className="billing-block billing-today panel">
                    <span>今日流量</span>
                    <strong>
                      <span className="billing-today-part">↓ {bytes(node.day_rx)}</span> ·{' '}
                      <span className="billing-today-part">↑ {bytes(node.day_tx)}</span>
                    </strong>
                    <small>合计 {bytes(node.day_rx + node.day_tx)}</small>
                  </div>
                )}
              </div>
            </section>
          )}

          {config.show_carriers && (
            <section id="carriers" className="detail-section detail-carriers panel" aria-labelledby="carriers-title">
              <div className="section-heading">
                <h2 id="carriers-title">三网线路</h2>
                <span>按运营商归类 · 未配置时用探测名匹配</span>
              </div>
              <CarrierRow config={config.nodes[String(node.id)]} history={pingHistory} tasks={autoTasks} lines={routeLines} />
              <ul className="carrier-tasks">
                {carrierTasks.map((c) => (
                  <li key={c.id} style={{ '--carrier': c.color } as Vars}>
                    <span className="carrier-task-name">
                      <img className="carrier-logo" src={c.logo} alt="" aria-hidden="true" decoding="async" />
                      {c.name} · {c.line}
                    </span>
                    <span>{c.taskId ? `任务 #${c.taskId}${c.probe ? ` ${c.probe}` : ''}` : '未配置探测'}</span>
                    <span>当前 {c.latency === null ? c.label : `${Number(c.latency.toFixed(1))} ms`}</span>
                    {c.loss === null ? (
                      <span className="carrier-task-loss">丢包 {c.taskId && !data ? '读取中' : '暂无数据'}</span>
                    ) : (
                      <span className="carrier-task-loss" style={{ '--loss': lossColor(c.loss) } as Vars} title={`近 ${windowLabel(hours)}内探测失败的比例`}>
                        丢包 <b>{pct(c.loss)}</b>
                        <em>{lossGrade(c.loss)}</em>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {otherProbes.length > 0 && (
                <div className="carrier-others">
                  <h3>其他探测任务</h3>
                  <ul>
                    {otherProbes.map((o) => (
                      <li
                        key={o.id}
                        className="carrier-other-loss"
                        style={{ '--loss': o.loss === null ? undefined : lossColor(o.loss) } as Vars}
                        title={`近 ${windowLabel(hours)}内探测失败的比例`}
                      >
                        <span>{o.name}</span>
                        <b>{o.latency === null ? '—' : `${Number(o.latency.toFixed(1))} ms`}</b>
                        {o.loss === null ? <b>—</b> : <em>{`${pct(o.loss)} · ${lossGrade(o.loss)}`}</em>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="carrier-notes">
                <li>
                  <Clock size={16} aria-hidden="true" />
                  <span>
                    <strong>延迟</strong>节点向目标发起 TCP 连接的握手时延，不等于访客到服务器的访问延迟
                  </span>
                </li>
                <li>
                  <Activity size={16} aria-hidden="true" />
                  <span>
                    <strong>丢包</strong>近 {windowLabel(hours)}内探测失败的比例，随“历史表现”的时间范围切换，0% 即没有丢包
                  </span>
                </li>
                <li>
                  <Tag size={16} aria-hidden="true" />
                  <span>
                    <strong>线路名称</strong>优先用主题设置里填的，没填时显示主控下发的探测任务名
                  </span>
                </li>
              </ul>
            </section>
          )}

          {unlockItems.length > 0 && (
            <section id="unlocks" className="detail-section detail-unlocks panel" aria-labelledby="unlocks-title">
              <div className="section-heading">
                <h2 id="unlocks-title">解锁检测</h2>
                <span>
                  已解锁 {unlocks.unlocked} / {unlocks.total}
                  {unlocks.failed > 0 ? ` · ${unlocks.failed} 项检测失败` : ''}
                  {unlocks.partial > 0 ? ` · 含 ${unlocks.partial} 项仅自制剧` : ''}
                </span>
              </div>
              <ul className="unlock-grid">
                {unlockItems.map((item) => {
                  const service = unlockService(item.service)
                  const status = unlockStatus(item)
                  return (
                    <li key={item.service} data-tone={status.tone} title={item.tested_at ? `检测时间 ${new Date(item.tested_at).toLocaleString('zh-CN', { hour12: false })}` : undefined}>
                      <span className="unlock-name">{service.label}</span>
                      <b>{status.label}</b>
                      {item.region && !(service.info && item.status === 'yes') && <small>{item.region}</small>}
                    </li>
                  )
                })}
              </ul>
              <p className="unlock-note">主控最近一轮检测结果，非实时测试；检测失败不计入总数。</p>
            </section>
          )}

          {config.show_score && (
            <section id="score" className="detail-section detail-score panel" aria-label="评分明细">
              <ScoreBreakdown node={node} score={scored} ping={pingHistory} />
            </section>
          )}

          <section id="history" className="detail-section" aria-labelledby="history-title">
            <div className="range-toolbar">
              <h2 id="history-title" className="detail-section-title">
                历史表现 {busy && <small className="muted text-xs">读取中…</small>}
              </h2>
              <div className="range-buttons" aria-label="历史时间范围">
                {ranges.map((h) => (
                  <button key={h} className={hours === h ? 'selected' : undefined} onClick={() => setHours(h)}>
                    {windowLabel(h)}
                  </button>
                ))}
                <button type="button" className="fb-btn fb-btn-ghost" aria-label="刷新历史" disabled={busy} onClick={() => void load(true)}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            {error && (
              <div className="inline-notice" role="alert">
                {error}
                <button type="button" className="fb-btn fb-btn-ghost fb-btn-sm" onClick={() => void load(true)}>
                  重新读取
                </button>
              </div>
            )}
            <div className="charts-grid" aria-busy={busy}>
              <HistoryChart title="CPU 使用率" series={resource('cpu', 'CPU', '#ff7a1a')} unit="%" maximum={100} step={data?.step} />
              <HistoryChart title="内存使用率" series={resource('mem_used', '内存', '#a78bfa')} unit="%" maximum={100} step={data?.step} />
              <HistoryChart title="网络速率" series={network} unit={bits ? ' Mbps' : ' MB/s'} step={data?.step} />
              <HistoryChart title="硬盘使用率" series={resource('disk_used', '硬盘', '#64748b')} unit="%" maximum={100} step={data?.step} />
              <HistoryChart className="wide" title="TCP 延迟历史" height={200} series={pingSeries} unit=" ms" step={data?.step} />
            </div>
          </section>

          <section id="system" className="detail-section detail-system panel" aria-labelledby="system-title">
            <h2 id="system-title" className="detail-section-title">
              系统信息
            </h2>
            <dl className="fact-grid">
              <div className="fact">
                <dt>处理器</dt>
                <dd>
                  {node.cpu_name || '—'} / {node.cpu_cores || '—'} 核
                </dd>
              </div>
              <div className="fact">
                <dt>操作系统 / 架构</dt>
                <dd>
                  {node.os || '—'} · {node.arch || '—'}
                </dd>
              </div>
              <div className="fact">
                <dt>内核</dt>
                <dd>{node.kernel || '—'}</dd>
              </div>
              <div className="fact">
                <dt>虚拟化 / Agent</dt>
                <dd>
                  {node.virt || '—'} / {node.agent_version || '—'}
                </dd>
              </div>
              <div className="fact">
                <dt>TCP / UDP / 进程</dt>
                <dd>
                  {live?.tcp ?? '—'} / {live?.udp ?? '—'} / {live?.procs ?? '—'}
                </dd>
              </div>
              {node.conn_history && (
                <div className="fact fact-conn">
                  <dt>近 1 小时连接数</dt>
                  <dd className="conn-sparks">
                    <span className="conn-spark" title="整机 TCP ESTABLISHED（5 分钟均值）">
                      TCP
                      <Sparkline values={node.conn_history.tcp.filter((v): v is number => v !== null)} color="#60a5fa" />
                    </span>
                    <span className="conn-spark" title="整机 UDP socket（5 分钟均值）">
                      UDP
                      <Sparkline values={node.conn_history.udp.filter((v): v is number => v !== null)} color="#34d399" />
                    </span>
                  </dd>
                </div>
              )}
              <div className="fact">
                <dt>节点 ID</dt>
                <dd>#{node.id}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  )
}
