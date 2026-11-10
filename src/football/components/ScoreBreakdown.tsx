import { probeRegion, resolveTask, statusText } from '../domain/carriers'
import { bytes, duration, trafficUsed } from '../domain/format'
import {
  NET_LABELS,
  NET_WEIGHTS,
  STAT_LABELS,
  statReadings,
  type NetKey,
  type NodeScore,
  type ProbeSummary,
  type StatKey,
} from '../domain/score'
import type { HistoryResponse, MonitorNode } from '../domain/types'
import { ScoreGauge } from './ScoreGauge'

const pair = (a: number | null | undefined, b: number | null | undefined) => `${bytes(a)} / ${bytes(b)}`
const ms = (v: number | null) => (v === null ? '—' : `${Number(v.toFixed(1))} ms`)
const pct = (v: number | null) => (v === null ? '—' : `${Number(v.toFixed(2))}%`)

export function ScoreBreakdown({
  node,
  score,
  ping,
  pingUnavailable,
}: {
  node: MonitorNode
  score: NodeScore
  ping?: HistoryResponse
  pingUnavailable?: boolean
}) {
  const weights = (Object.keys(NET_WEIGHTS) as NetKey[]).map((k) => `${NET_LABELS[k]} ${Math.round(NET_WEIGHTS[k] * 100)}%`).join(' + ')
  const region = (p: ProbeSummary) => probeRegion(p.name) || `#${p.taskId}`
  const { values, probes } = score
  const network: { key: NetKey; name: string; rows: [string, string][] }[] = [
    {
      key: 'latency',
      name: '平均延迟',
      rows: [['三个测速点平均', ms(values.latency)], ...probes.map((p): [string, string] => [region(p), ms(p.latency)])],
    },
    {
      key: 'jitter',
      name: '延迟抖动',
      rows: [['平均波动', ms(values.jitter)], ...probes.map((p): [string, string] => [region(p), ms(p.jitter)])],
    },
    {
      key: 'loss',
      name: '丢包率',
      rows: [['平均丢包', pct(values.loss)], ...probes.map((p): [string, string] => [region(p), pct(p.loss)])],
    },
  ]
  // 离线节点的最后一次上报是历史，不是实时值：只保留记录总量与计数器。
  const m = node.online ? node.metrics : null
  const resources: { key: StatKey; name: string; rows: [string, string][] }[] = [
    {
      key: 'cpu',
      name: '处理器占用',
      rows: [
        ['占用', m ? `${Number(m.cpu.toFixed(1))}%` : '—'],
        ['负载 1 / 5 / 15', m ? m.load.map((v) => v.toFixed(2)).join(' / ') : '—'],
        ['核心数', node.cpu_cores ? `${node.cpu_cores} 核` : '—'],
      ],
    },
    {
      key: 'mem',
      name: '内存占用',
      rows: [
        ['已用 / 总量', pair(m?.mem_used, node.mem_total)],
        ['Swap 已用 / 总量', pair(m?.swap_used, node.swap_total)],
      ],
    },
    { key: 'dsk', name: '硬盘占用', rows: [['已用 / 总量', pair(m?.disk_used, node.disk_total)]] },
    {
      key: 'net',
      name: '流量使用',
      rows: [
        ['本周期已用 / 配额', `${bytes(trafficUsed(node))} / ${node.traffic_limit > 0 ? bytes(node.traffic_limit) : '不限量'}`],
        ['今日 ↓ / ↑', pair(node.day_rx, node.day_tx)],
        ['累计 ↓ / ↑', pair(node.total_rx, node.total_tx)],
      ],
    },
    { key: 'upt', name: '持续运行', rows: [['系统 Uptime（非 Agent 连续在线）', duration(m?.uptime)]] },
    {
      key: 'png',
      name: '网络延迟',
      // 卡面印的是 24 小时均值；同一批探测的最新读数列在旁边。
      rows: [
        ['24 小时平均（卡面取值）', m ? ms(score.values.latency) : '—'],
        ...score.probes.map((p): [string, string] => {
          const r = resolveTask(p.taskId, ping, Date.now() / 1000, pingUnavailable)
          return [`${region(p)} 当前`, !m ? '—' : r.latency === null ? statusText[r.status] : ms(r.latency)]
        }),
      ],
    },
  ]
  const readings = statReadings(node, score)

  return (
    <div className="score-breakdown">
      <div className="section-heading">
        <h2>
          评分明细 <span className="score-overall">综合 {score.overall ?? '—'}</span>
        </h2>
        <span>网络质量 = {weights} · 最近 24 小时前三个测速点</span>
      </div>
      {!node.online ? (
        <p className="score-offline">离线，无实时数据 · 下列仅显示配置总量与流量计数</p>
      ) : score.overall === null ? (
        <p className="score-offline">最近 24 小时没有测速数据，暂不评分</p>
      ) : null}
      <div className="score-groups">
        {network.map((g) => (
          <div key={g.key} className="score-group">
            <ScoreGauge value={score.parts[g.key]} label={NET_LABELS[g.key]} />
            <div className="score-group-body">
              <h3>{g.name}</h3>
              <dl>
                {g.rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ))}
      </div>
      <h3 className="score-subtitle">资源状况</h3>
      <div className="score-groups">
        {resources.map((g) => (
          <div key={g.key} className="score-group">
            <div className="score-reading-box">
              <strong className="score-reading" data-grade={readings[g.key].grade ?? undefined}>
                {readings[g.key].value}
                {readings[g.key].unit && <small>{readings[g.key].unit}</small>}
              </strong>
              <span className="gauge-label">{STAT_LABELS[g.key]}</span>
            </div>
            <div className="score-group-body">
              <h3>{g.name}</h3>
              <dl>
                {g.rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
