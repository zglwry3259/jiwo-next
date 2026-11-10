import { carriers, latencyColor } from '../domain/carriers'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import { LOSS_ALERT, sinceText, type NodeQuality, type Segment } from '../domain/network'
import type { MonitorNode } from '../domain/types'
import { Link } from './PageHeading'
import { QualityBar } from './QualityBar'

const cell = (latency: number | null | undefined, loss: number | null | undefined) =>
  latency == null && loss == null
    ? null
    : {
        // 全部探测失败的线路没有延迟：留一个短横，而不是空色的“—ms”。
        latency: latency == null ? null : String(Math.round(latency)),
        color: latency == null ? undefined : latencyColor(latency),
        loss: loss == null ? '—' : `${loss.toFixed(1)}%`,
        alert: loss != null && loss >= LOSS_ALERT,
      }

export function NetworkRow({
  node,
  quality,
  segments,
  showCarriers,
  failed,
  now,
}: {
  node: MonitorNode
  quality: NodeQuality | null
  segments: Segment[] | null
  showCarriers: boolean
  failed: boolean
  now: number
}) {
  const flag = node.country ? flagUrl(node.country) : undefined
  // 离线节点没有读数；最后的值会被当成当前值。
  const q = node.online ? quality : null
  const overall = cell(q?.latency, q?.loss)
  const lines = carriers.map((c) => {
    const r = q?.carriers[c.id]
    return {
      id: c.id,
      short: c.short,
      reading: cell(r?.latency, r?.loss),
      title: r ? `${c.name} · ${r.line} · ${r.name}` : `${c.name} · 未配置或本时段无数据`,
    }
  })
  const last =
    !q || !q.lines.length ? null : q.lastLoss === null ? (['无', '统计时段内'] as const) : sinceText(q.lastLoss, now)
  const trendLabel = failed ? '加载失败' : !node.online ? '离线' : segments ? `${node.name} 质量走势` : '正在加载'

  return (
    <Link to={`/node/${node.id}#carriers`} className="network-row" dataOnline={node.online}>
      <span className="nr-node">
        {flag && <img className="nr-flag" src={flag} title={countryName(node.country)} alt="" />}
        <span className="nr-name">
          <b title={node.name}>{node.name}</b>
          <small>{node.group || '未分组'}</small>
        </span>
        {!node.online && <em className="nr-offline">离线</em>}
      </span>
      <span className="nr-trend">
        {failed ? <span className="nr-failed">加载失败</span> : <QualityBar segments={segments} label={trendLabel} loading={node.online} />}
      </span>
      <span className="nr-overall nr-cell" data-label="综合">
        {overall ? (
          <>
            <b style={overall.color ? { color: overall.color } : undefined}>
              {overall.latency ?? '—'}
              {overall.latency && <em>ms</em>}
            </b>
            <small data-alert={overall.alert || undefined}>{overall.loss}</small>
          </>
        ) : (
          '—'
        )}
      </span>
      {showCarriers &&
        lines.map((l) => (
          <span key={l.id} className="nr-carrier nr-cell" data-carrier={l.id} data-label={l.short} title={l.title}>
            {l.reading ? (
              <>
                <b style={l.reading.color ? { color: l.reading.color } : undefined}>
                  {l.reading.latency ?? '—'}
                  {l.reading.latency && <em>ms</em>}
                </b>
                <small data-alert={l.reading.alert || undefined}>{l.reading.loss}</small>
              </>
            ) : (
              '—'
            )}
          </span>
        ))}
      <span className="nr-last nr-cell" data-label="最近丢包">
        {last ? (
          <>
            <b>{last[0]}</b>
            <small>{last[1]}</small>
          </>
        ) : (
          '—'
        )}
      </span>
      <span className="nr-jitter nr-cell" data-label="抖动">
        {q?.jitter != null ? (
          <b>
            {q.jitter.toFixed(1)}
            <em>ms</em>
          </b>
        ) : (
          '—'
        )}
      </span>
    </Link>
  )
}
