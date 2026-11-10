import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Maximize, Minimize, Server, WifiOff } from 'lucide-react'
import { bytes, countryName } from '../domain/format'
import { flagUrl } from '../domain/flags'
import {
  STALE_AFTER,
  countryCard,
  countryMarkers,
  diffEvents,
  eventBadge,
  issueList,
  issueText,
  metricChanges,
  nodeAlerts,
  nodeCard,
  pastLoss,
  shouldReload,
  snapshot,
  statusCounts,
  tourStops,
  type Change,
  type NodeAlert,
  type OpsEvent,
  type Places,
  type WallSnapshot,
} from '../domain/ops'
import centroids from '../domain/centroids.json'
import type { HistoryResponse, MonitorNode, ThemeConfig } from '../domain/types'
import type { NodeScore } from '../domain/score'
import { OpsCard } from '../components/OpsCard'
import { OpsGlobe } from '../components/OpsGlobe'
import { RollingNumber } from '../components/RollingNumber'
import { Sparkline } from '../components/Sparkline'
import { Link } from '../components/PageHeading'
import { useSpeed } from '../hooks'

const places = centroids as unknown as Places
const STOP_MS = 6000
const MAX_ISSUES = 9
type Selection = { kind: 'node'; id: number } | { kind: 'country'; code: string } | null

export function Ops({
  nodes,
  config,
  scores,
  pingHistory,
  updatedAt,
  hideGlobe,
}: {
  nodes: MonitorNode[]
  config: ThemeConfig
  scores: Record<number, NodeScore>
  pingHistory: Record<number, HistoryResponse>
  updatedAt: number | null
  /** 主控关闭地球（show_globe === false）时只留列表与卡片 */
  hideGlobe?: boolean
}) {
  const speed = useSpeed()
  const openedAt = useRef(Date.now())
  const [now, setNow] = useState(() => Date.now())
  const seconds = Math.floor(now / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = (ms: number | null) => {
    if (ms === null) return '—'
    const d = new Date(ms)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const date = (() => {
    const d = new Date(now)
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${'日一二三四五六'[d.getDay()]}`
  })()

  const alerts = useMemo(() => {
    const result: Record<number, NodeAlert[]> = {}
    for (const n of nodes) result[n.id] = nodeAlerts(n, pingHistory[n.id], config, seconds)
    return result
  }, [nodes, pingHistory, config, seconds])
  const counts = statusCounts(nodes, alerts)
  const issues = issueList(nodes, alerts)
  const globe = countryMarkers(nodes, alerts, places)
  const stops = tourStops(issues, places)
  const online = nodes.filter((n) => n.online)
  const average = (() => {
    const list = online.map((n) => scores[n.id]?.overall).filter((v): v is number => v != null)
    return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null
  })()

  // 全站速率：页面打开后每收到一帧节点数据记一点，之前不编造。
  const [rateUp, setRateUp] = useState<number[]>([])
  const [rateDown, setRateDown] = useState<number[]>([])
  const lastUpdate = useRef<number | null>(null)
  useEffect(() => {
    if (updatedAt === null || lastUpdate.current === updatedAt || !nodes.length) return
    lastUpdate.current = updatedAt
    const sum = (key: 'net_tx' | 'net_rx') => online.reduce((s, n) => s + (n.metrics?.[key] ?? 0), 0)
    setRateUp((prev) => [...prev, sum('net_tx')].slice(-60))
    setRateDown((prev) => [...prev, sum('net_rx')].slice(-60))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt])
  // 速率跟主控站点单位走：formatNetworkSpeed 已经处理好进位，这里只拆数字和单位给滚动数字用。
  const scaled = (value: number | undefined) => {
    if (value === undefined) return { value: null, unit: '' }
    const text = speed(value)
    const [num, unit] = text.split(' ')
    return { value: Number(num), unit: unit ?? '' }
  }
  const up = scaled(rateUp.at(-1)),
    down = scaled(rateDown.at(-1))
  const totals = {
    up: nodes.reduce((s, n) => s + n.total_tx, 0),
    down: nodes.reduce((s, n) => s + n.total_rx, 0),
  }

  const staleFor = updatedAt === null ? 0 : Math.max(0, Math.floor((now - updatedAt) / 1000))
  const stale = staleFor > STALE_AFTER

  // 卡片内容：巡检会依次转到每台有问题的节点；点标记、行或变化会停下巡检并显示那一台。
  const [touring, setTouring] = useState(true)
  const [stopIndex, setStopIndex] = useState(0)
  const [picked, setPicked] = useState<Selection>(null)
  const shown: Selection = touring && stops.length ? { kind: 'node', id: stops[stopIndex % stops.length]!.node.id } : picked
  const shownNode = shown?.kind === 'node' ? nodes.find((n) => n.id === shown.id) : undefined

  const firstSeen = useRef(new Map<string, number | null>())
  const card = (() => {
    if (shown?.kind === 'country') return { kind: 'country' as const, data: countryCard(shown.code, nodes, alerts, seconds) }
    if (!shownNode) return null
    const list = alerts[shownNode.id] ?? [],
      starts = list.map((a) => firstSeen.current.get(`${shownNode.id}:${a.kind}`) ?? null)
    const since = starts.length && starts.every((t) => t !== null) ? Math.min(...(starts as number[])) : null
    return {
      kind: 'node' as const,
      data: nodeCard(
        shownNode,
        list,
        pingHistory[shownNode.id],
        config.nodes[String(shownNode.id)],
        seconds,
        since,
        nodes.filter((m) => m.country === shownNode.country).length,
      ),
    }
  })()
  const target = (() => {
    const code = shown?.kind === 'country' ? shown.code : shownNode?.country
    const at = code ? places[code.trim().toUpperCase()] : undefined
    if (!code || !at || !card) return null
    return { key: shown!.kind === 'node' ? `node-${shownNode!.id}` : `country-${code}`, code, at }
  })()

  // 最近变化：打开页面之后发生的，最新的在前；每条保留发生时的标签与数字。
  const [events, setEvents] = useState<(OpsEvent & { at: number; n: number; badge: ReturnType<typeof eventBadge> })[]>([])
  const previous = useRef<WallSnapshot | null>(null)
  const counter = useRef(0)
  useEffect(() => {
    if (!nodes.length) return
    const next = snapshot(nodes, alerts),
      found = diffEvents(previous.current, next)
    for (const key of next.alerts.keys()) if (!firstSeen.current.has(key)) firstSeen.current.set(key, previous.current ? seconds : null)
    for (const key of firstSeen.current.keys()) if (!next.alerts.has(key)) firstSeen.current.delete(key)
    previous.current = next
    if (found.length)
      setEvents((prev) =>
        [...found.map((e) => ({ ...e, at: Date.now(), n: ++counter.current, badge: eventBadge(e, seconds) })).reverse(), ...prev].slice(0, 20),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, alerts])

  // 忙的 CPU 与流量突增，跟这台节点自己的近期总量比。
  const [metricSeen, setMetricSeen] = useState<Change[]>([])
  const lastNodes = useRef<MonitorNode[] | null>(null)
  const traffic = useRef(new Map<number, number[]>())
  const lastMetricUpdate = useRef<number | null>(null)
  useEffect(() => {
    if (updatedAt === null || lastMetricUpdate.current === updatedAt || !nodes.length) return
    lastMetricUpdate.current = updatedAt
    const found = metricChanges(lastNodes.current, nodes, Object.fromEntries(traffic.current), Math.floor(updatedAt / 1000))
    if (found.length) setMetricSeen((prev) => [...found, ...prev].slice(0, 20))
    for (const n of nodes)
      if (n.online && n.metrics) traffic.current.set(n.id, [...(traffic.current.get(n.id) ?? []), n.metrics.net_rx + n.metrics.net_tx].slice(-20))
    lastNodes.current = nodes
  }, [updatedAt, nodes])

  const changes = [
    ...pastLoss(nodes, pingHistory, seconds).map((c) => ({ ...c, at: c.at * 1000 })),
    ...metricSeen.map((c) => ({ ...c, at: c.at * 1000 })),
    ...events.map((e) => ({ key: `event-${e.n}`, at: e.at, nodeId: e.nodeId, ...e.badge, tone: e.badge.tone as Change['tone'] })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)

  // 巡检与长运行：屏幕常亮、控件退场、画面偶尔挪一像素、每天自己刷新一次。
  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      // 挂满一小时的墙每天 04:00 自己刷新一次。
      if (shouldReload(openedAt.current, new Date(at))) window.location.reload()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!touring || stale) return undefined
    const timer = window.setInterval(() => setStopIndex((i) => (i + 1) % Math.max(1, stops.length)), STOP_MS)
    return () => window.clearInterval(timer)
  }, [touring, stale, stops.length])

  const [idle, setIdle] = useState(false)
  const [full, setFull] = useState(false)
  const [shift, setShift] = useState(0)
  const idleTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const wake = () => {
      setIdle(false)
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => setIdle(true), 3000)
    }
    const onFull = () => setFull(Boolean(document.fullscreenElement))
    const shiftTimer = window.setInterval(() => setShift((v) => (v + 1) % 4), 600_000)
    document.addEventListener('fullscreenchange', onFull)
    window.addEventListener('pointermove', wake)
    wake()
    return () => {
      window.clearInterval(shiftTimer)
      window.clearTimeout(idleTimer.current)
      document.removeEventListener('fullscreenchange', onFull)
      window.removeEventListener('pointermove', wake)
    }
  }, [])
  const SHIFTS = ['0px, 0px', '2px, 0px', '2px, 2px', '0px, 2px']
  const canFull = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }

  const pick = (selection: Selection) => {
    setTouring(false)
    setPicked(selection)
  }
  const visit = (id: number) => pick({ kind: 'node', id })
  const pickCountry = (code: string) => {
    const here = nodes.filter((n) => n.country === code)
    pick(here.length === 1 ? { kind: 'node', id: here[0]!.id } : { kind: 'country', code })
  }
  const toggleTour = () => {
    setTouring((v) => !v)
    setPicked(null)
    setStopIndex(0)
  }

  return (
    <div className="ops-wall" data-idle={idle || undefined} data-stale={stale || undefined} style={{ transform: `translate(${SHIFTS[shift]})` }}>
      <h1 className="sr-only">运维模式</h1>
      <header className="ops-top">
        <Link to="/" className="ops-control ops-back" ariaLabel="返回首页" title="返回首页">
          <ArrowLeft size={18} />
        </Link>
        <span className="ops-brand">
          FOOTBALL <b>MONITOR</b>
          <small>运维模式</small>
        </span>
        <span className="ops-live" data-state={updatedAt ? 'live' : 'connecting'}>
          <i className="ops-pulse" data-online={!stale ? 'true' : 'false'} aria-hidden="true" />
          {updatedAt ? '实时连接' : '正在连接'} · 最后更新 {stamp(updatedAt)}
        </span>
        {canFull && (
          <button type="button" className="ops-control ops-full" aria-label={full ? '退出全屏' : '全屏'} title={full ? '退出全屏' : '全屏'} onClick={toggleFull}>
            {full ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        )}
      </header>

      {stale && (
        <div className="ops-banner" role="alert">
          数据已 <b>{Math.floor(staleFor / 60)} 分 {pad(staleFor % 60)} 秒</b>没有更新：主控没有推送新帧。画面是最后收到的数据。
        </div>
      )}

      {!nodes.length ? (
        <div className="ops-empty" aria-busy={!updatedAt || undefined}>
          <Server size={40} />
          <h2>{updatedAt ? '还没有可显示的节点' : '正在加载节点…'}</h2>
        </div>
      ) : (
        <div className="ops-stage">
          <section className="ops-left" aria-label="全场态势">
            <p className="ops-eyebrow">LIVE STATUS</p>
            <h2 className="ops-heading">全场节点态势</h2>
            <dl className="ops-counts">
              <div data-tone="ok" data-zero={!counts.ok || undefined}>
                <dd>
                  <RollingNumber value={counts.ok} />
                </dd>
                <dt>正常</dt>
              </div>
              <div data-tone="warn" data-zero={!counts.warn || undefined}>
                <dd>
                  <RollingNumber value={counts.warn} />
                </dd>
                <dt>有异常</dt>
              </div>
              <div data-tone="off" data-zero={!counts.off || undefined}>
                <dd>
                  <RollingNumber value={counts.off} />
                </dd>
                <dt>离线</dt>
              </div>
            </dl>
            {config.show_score && (
              <p className="ops-score">
                平均评分 <b><RollingNumber value={average} /></b>
                <span>共 {nodes.length} 台</span>
              </p>
            )}
            <div className="ops-traffic">
              <p className="ops-label">实时流量</p>
              <div className="ops-rates">
                <span>
                  <small>
                    <i className="ops-arrow-up">↑</i> 上行
                  </small>
                  <b>
                    <RollingNumber value={up.value} digits={2} />
                    <em>{up.unit}</em>
                  </b>
                </span>
                <span>
                  <small>
                    <i className="ops-arrow-down">↓</i> 下行
                  </small>
                  <b>
                    <RollingNumber value={down.value} digits={2} />
                    <em>{down.unit}</em>
                  </b>
                </span>
              </div>
              <div className="ops-rate-lines">
                <Sparkline className="ops-rate-line" values={rateDown} color="#ff7a1a" />
                <Sparkline className="ops-rate-line" values={rateUp} color="#e7e9ee" fill={false} />
              </div>
              <p className="ops-total">
                累计 上行 {bytes(totals.up)} · 下行 {bytes(totals.down)}
              </p>
            </div>
          </section>

          {!hideGlobe && (
            <section className="ops-centre" aria-label="节点分布">
              <OpsGlobe markers={globe.markers} target={target} stale={stale} onPick={pickCountry} onGrab={() => pick(shown)} onBlank={() => pick(null)}>
                {card && (
                  <OpsCard
                    card={card}
                    onClose={() => pick(null)}
                    onNode={visit}
                    onCountry={(code) => pick({ kind: 'country', code })}
                  />
                )}
              </OpsGlobe>
              <p className="ops-note">
                {globe.unplaced > 0 && <span>{globe.unplaced} 台未设置国家或地区，未在地球上标出</span>}
              </p>
            </section>
          )}

          <aside className="ops-right" aria-label="正在发生">
            <header className="ops-clock">
              <b>{stamp(now)}</b>
              <span>{date}</span>
            </header>
            <section className="ops-rail-section ops-rail-grow">
              <h2 className="ops-label">
                正在发生<b>{issues.length}</b>
              </h2>
              {issues.length ? (
                <div className="ops-issues">
                  {issues.slice(0, MAX_ISSUES).map((it, i) => {
                    const text = issueText(it.alert, seconds)
                    return (
                      <button
                        key={`${it.node.id}-${it.alert.kind}-${i}`}
                        type="button"
                        className="ops-row"
                        data-tone={text.tone}
                        data-focus={shownNode?.id === it.node.id || undefined}
                        title={`在地球上查看 ${it.node.name}`}
                        onClick={() => visit(it.node.id)}
                      >
                        <span className="or-main">
                          <b>{it.node.name}</b>
                          <small>
                            {flagUrl(it.node.country) && <img className="or-flag" src={flagUrl(it.node.country)} alt="" />}
                            {it.node.country ? countryName(it.node.country) : '未设置地区'}
                          </small>
                        </span>
                        <span className="or-side">
                          {text.label}
                          <em>{text.value}</em>
                        </span>
                      </button>
                    )
                  })}
                  {issues.length > MAX_ISSUES && <p className="ops-more">另有 {issues.length - MAX_ISSUES} 项</p>}
                </div>
              ) : (
                <p className="ops-allok">全部 {nodes.length} 台运行正常</p>
              )}
            </section>
            <section className="ops-rail-section">
              <h2 className="ops-label">最近变化</h2>
              <div className="ops-changes">
                {changes.map((c) => (
                  <button key={c.key} type="button" className="ops-change" title="在地球上查看这台节点" onClick={() => visit(c.nodeId)}>
                    <time>{stamp(c.at)}</time>
                    <span className="ops-tag" data-tone={c.tone}>
                      {c.tag}
                    </span>
                    <span className="ops-change-text">{c.text}</span>
                  </button>
                ))}
                {!changes.length && <p className="ops-quiet">最近 1 小时没有新的变化</p>}
              </div>
            </section>
            {stops.length > 0 && (
              <button type="button" className="ops-tour" aria-pressed={touring} onClick={toggleTour}>
                {touring ? '停止依次查看' : `依次查看 ${stops.length} 台`}
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
