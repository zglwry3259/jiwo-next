import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { latencyColor, lossColor, probeBars, shownProbes, taskLoss } from '../domain/carriers'
import { flagUrl } from '../domain/flags'
import { remainingValue } from '../domain/fleet'
import { bytes, countryName, cycle, money, offlineSince, trafficUsed } from '../domain/format'
import { useSpeed } from '../hooks'
import { osBadge } from '../domain/providers'
import type { HistoryResponse, MonitorNode, NodeConfig } from '../domain/types'

type Grade = 'good' | 'ok' | 'bad'
interface Meter {
  key: string
  label: string
  value: string
  share: number | null
  grade?: Grade
  detail: string
}

export function NodePanel({
  node,
  nodeConfig,
  history,
  unavailable,
  showCarriers,
  showTraffic,
  showBilling,
}: {
  node: MonitorNode
  nodeConfig?: NodeConfig
  history?: HistoryResponse
  unavailable?: boolean
  showCarriers: boolean
  showTraffic: boolean
  showBilling: boolean
}) {
  const speed = useSpeed()
  const metrics = node.online ? node.metrics : null
  const os = osBadge(node.os)
  const flag = node.country ? flagUrl(node.country) : undefined
  const tags: string[] = []
  if (!node.online) tags.push(offlineSince(node))
  else if (metrics)
    tags.push(metrics.uptime >= 86400 ? `在线 ${Math.floor(metrics.uptime / 86400)} 天` : `在线 ${Math.floor(metrics.uptime / 3600)} 小时`)
  if (showBilling && node.price !== null) tags.push(node.price === 0 ? '免费' : `${money(node.price, node.currency)} / ${cycle(node.billing_cycle)}`)
  if (node.public_remark) tags.push(node.public_remark)

  // 与卡面读数同一套阈值。
  const grade = (share: number): Grade => (share < 0.6 ? 'good' : share < 0.85 ? 'ok' : 'bad')
  const meter = (key: string, label: string, share: number | null, detail: string): Meter =>
    share === null
      ? { key, label, value: '—', share: null, detail }
      : { key, label, value: `${(share * 100).toFixed(1)}%`, share: Math.min(1, share), grade: grade(share), detail }

  const used = trafficUsed(node)
  const meters: Meter[] = [
    meter('cpu', 'CPU', metrics ? metrics.cpu / 100 : null, metrics ? metrics.load.map((v) => v.toFixed(2)).join(', ') : '—'),
    meter(
      'mem',
      '内存',
      metrics && metrics.mem_total ? metrics.mem_used / metrics.mem_total : null,
      metrics ? `${bytes(metrics.mem_used)} / ${bytes(metrics.mem_total)}` : bytes(node.mem_total),
    ),
    meter(
      'disk',
      '硬盘',
      metrics && metrics.disk_total ? metrics.disk_used / metrics.disk_total : null,
      metrics ? `${bytes(metrics.disk_used)} / ${bytes(metrics.disk_total)}` : bytes(node.disk_total),
    ),
    // 主控记账流量，离线节点也保留本周期数字。
    node.traffic_limit > 0
      ? meter('traffic', '流量', used / node.traffic_limit, `${bytes(used)} / ${bytes(node.traffic_limit)}`)
      : { key: 'traffic', label: '流量', value: bytes(used), share: null, detail: '本周期 · 不限量' },
  ]

  const left = remainingValue(node)
  const expiry = {
    days:
      node.expires_in == null
        ? '未设到期日'
        : node.expires_in < 0
          ? `已过期 ${-node.expires_in} 天`
          : node.expires_in === 0
            ? '今天到期'
            : `剩余 ${node.expires_in} 天`,
    value: left ? money(Number(left.amount.toFixed(2)), left.currency) : '—',
  }

  const arrived = useRef(false)
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    if (history && !arrived.current) {
      arrived.current = true
      setFilled(true)
    }
  }, [history])
  const loading = !history && !unavailable
  const barState = loading ? 'loading' : filled ? 'fill' : undefined
  const EMPTY = Array.from({ length: 10 }, () => latencyColor(null))
  // 每条线路各带自己的延迟与丢包色块；加载时用三行占位。
  const probes = loading
    ? [1, 2, 3].map((n) => ({
        taskId: -n,
        region: '—',
        carrier: undefined as string | undefined,
        color: undefined as string | undefined,
        logo: undefined as string | undefined,
        latency: null as number | null,
        loss: null as number | null,
        title: '正在加载探测数据',
        latencyColors: EMPTY,
        lossColors: EMPTY,
      }))
    : shownProbes(history, nodeConfig, node.online, unavailable).map((p) => {
        const b = probeBars(history, [p.taskId]),
          loss = unavailable ? null : taskLoss(history, p.taskId)
        return { ...p, loss, latencyColors: b.latency.map(latencyColor), lossColors: b.loss.map(lossColor) }
      })

  return (
    <div className="node-panel">
      <div className="np-head">
        <span className="np-dot" data-online={node.online ? 'true' : 'false'} aria-hidden="true" />
        <h3 className="np-name" title={node.name}>
          {node.name}
        </h3>
        {os?.icon ? (
          <svg className="np-os" viewBox="0 0 24 24" aria-hidden="true">
            <title>{os.name}</title>
            <path d={os.icon.path} fill={`#${os.icon.hex}`} />
          </svg>
        ) : os?.short ? (
          <span className="np-os-text" title={os.name}>
            {os.short}
          </span>
        ) : null}
        {flag && <img className="np-flag" src={flag} title={countryName(node.country)} alt="" />}
      </div>
      {tags.length > 0 && (
        <div className="np-tags">
          {tags.map((tag) => (
            <span key={tag} className="np-tag" title={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="np-meters">
        {meters.map((m) => (
          <div key={m.key} className="np-meter" data-key={m.key}>
            <div className="np-meter-top">
              <span>{m.label}</span>
              <b data-grade={m.grade}>{m.value}</b>
            </div>
            <span className="np-bar" aria-hidden="true">
              {m.share !== null && <i data-grade={m.grade} style={{ width: `${m.share * 100}%` }} />}
            </span>
            <span className="np-detail" title={m.detail}>
              {m.detail}
            </span>
          </div>
        ))}
      </div>
      <div className="np-boxes">
        <div className="np-box">
          <span className="np-down">
            <b aria-hidden="true">↓</b>
            {speed(metrics?.net_rx)}
          </span>
          <span className="np-up">
            <b aria-hidden="true">↑</b>
            {speed(metrics?.net_tx)}
          </span>
        </div>
        {showTraffic && (
          <div className="np-box" title={`累计上行 ${bytes(node.total_tx)} · 累计下行 ${bytes(node.total_rx)}`}>
            <span>
              <b aria-hidden="true">⇡</b>
              {bytes(node.total_tx)}
            </span>
            <span>
              <b aria-hidden="true">⇣</b>
              {bytes(node.total_rx)}
            </span>
          </div>
        )}
        {showBilling && (
          <div className="np-box">
            <span>{expiry.days}</span>
            <span>{expiry.value}</span>
          </div>
        )}
        {showTraffic && (
          <div className="np-box np-today" title={`今日下行 ${bytes(node.day_rx)} · 今日上行 ${bytes(node.day_tx)}`}>
            <span className="np-box-label">今日流量</span>
            <b>{bytes(node.day_rx + node.day_tx)}</b>
          </div>
        )}
      </div>
      {showCarriers && (
        // 探测条数完全跟主控走：配了几条就画几行，卡片高度随之增长，不在这里截断。
        <div className="np-probes" data-state={barState}>
          {probes.length === 0 ? (
            <span className="np-empty">暂无探测任务</span>
          ) : (
            probes.map((p) => (
              <div
                key={p.taskId}
                className="np-probe"
                data-carrier={p.carrier}
                style={p.color ? ({ '--carrier': p.color } as CSSProperties) : undefined}
                title={p.title}
              >
                <span className="np-probe-name">
                  {p.logo ? <img src={p.logo} alt="" decoding="async" /> : <i aria-hidden="true" />}
                  <span>{p.region}</span>
                </span>
                <span className="np-segs" aria-hidden="true">
                  {p.latencyColors.map((color, i) => (
                    <i key={i} style={{ background: color, '--i': i } as CSSProperties} />
                  ))}
                </span>
                <b className="np-probe-value">
                  {p.latency === null ? '—' : Number(p.latency.toFixed(1))}
                  {p.latency !== null && <small>ms</small>}
                </b>
                <span className="np-segs" aria-hidden="true">
                  {p.lossColors.map((color, i) => (
                    <i key={i} style={{ background: color, '--i': i } as CSSProperties} />
                  ))}
                </span>
                <b className="np-probe-value">
                  {p.loss === null ? '—' : p.loss.toFixed(1)}
                  {p.loss !== null && <small>%</small>}
                </b>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
