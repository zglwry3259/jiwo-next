import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { latencyColor, lossColor, probeBars, shownProbes } from '../domain/carriers'
import { bytes } from '../domain/format'
import { useSpeed } from '../hooks'
import type { HistoryResponse, MonitorNode, NodeConfig } from '../domain/types'

export function CardLiveStrip({
  node,
  nodeConfig,
  history,
  unavailable,
  showCarriers,
  showTraffic,
}: {
  node: MonitorNode
  nodeConfig?: NodeConfig
  history?: HistoryResponse
  unavailable?: boolean
  showCarriers: boolean
  showTraffic?: boolean
}) {
  // 速率按主控下发的站点单位显示（bit / byte）。
  const speed = useSpeed()
  const metrics = node.online ? node.metrics : null
  // 数据没到时色块扫动，第一次到齐后从左往右填充；挂载时已有数据、刷新与请求失败都按原样显示。
  const arrived = useRef(false)
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    if (history && !arrived.current) {
      arrived.current = true
      setFilled(true)
    }
  }, [history])
  const barState = !history && !unavailable ? 'loading' : filled ? 'fill' : undefined
  const rows = shownProbes(history, nodeConfig, node.online, unavailable)
  const bars = (() => {
    const b = probeBars(
      history,
      rows.map((r) => r.taskId),
    )
    return [
      {
        kind: 'latency',
        label: '延迟',
        value: node.online && b.currentLatency !== null ? `${Math.round(b.currentLatency)} ms` : '—',
        colors: b.latency.map(latencyColor),
      },
      {
        kind: 'loss',
        label: '丢包',
        value: b.windowLoss === null ? '—' : `${b.windowLoss.toFixed(1)}%`,
        colors: b.loss.map(lossColor),
      },
    ]
  })()

  return (
    <div className="card-live-strip">
      <div className="strip-line strip-speed">
        <span className="strip-bar-label">速率</span>
        <i className="strip-bar-leader" aria-hidden="true" />
        <span className="strip-bar-value">
          <span className="strip-down">
            <span className="sr-only">下载 </span>
            <b aria-hidden="true">↓</b>
            {speed(metrics?.net_rx)}
          </span>
          <span className="strip-up">
            <span className="sr-only">上传 </span>
            <b aria-hidden="true">↑</b>
            {speed(metrics?.net_tx)}
          </span>
        </span>
      </div>
      {/* 主控记账值，离线节点也保留今日数字。 */}
      {showTraffic && (
        <div className="strip-line strip-bar" data-kind="today" title={`↓ ${bytes(node.day_rx)} · ↑ ${bytes(node.day_tx)}`}>
          <span className="strip-bar-label">今日流量</span>
          <i className="strip-bar-leader" aria-hidden="true" />
          <span className="strip-bar-value">{bytes(node.day_rx + node.day_tx)}</span>
        </div>
      )}
      {showCarriers && (
        <>
          <div className="strip-row strip-carriers">
            {rows.length === 0 ? (
              <span className="strip-empty">—</span>
            ) : (
              rows.map((p) => (
                <span
                  key={p.taskId}
                  className="strip-carrier"
                  data-carrier={p.carrier}
                  style={p.color ? ({ '--carrier': p.color } as CSSProperties) : undefined}
                  title={p.title}
                >
                  <span className="strip-carrier-name">
                    {p.logo ? <img className="strip-carrier-logo" src={p.logo} alt="" aria-hidden="true" decoding="async" /> : <i aria-hidden="true" />}
                    <span>{p.region}</span>
                  </span>
                  <span className="strip-latency">
                    {p.latency === null ? '—' : Number(p.latency.toFixed(1))}
                    {p.latency !== null && <small className="strip-unit">ms</small>}
                  </span>
                </span>
              ))
            )}
          </div>
          <div className="strip-bars">
            {bars.map((bar) => (
              <div key={bar.kind} className="strip-line strip-bar" data-kind={bar.kind} data-state={barState}>
                <span className="strip-bar-label">{bar.label}</span>
                <i className="strip-bar-leader" aria-hidden="true" />
                <span className="strip-bar-value">{bar.value}</span>
                <span className="strip-segs" aria-hidden="true">
                  {bar.colors.map((color, i) => (
                    <i key={i} className="strip-seg" style={{ background: color, '--i': i } as CSSProperties} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
