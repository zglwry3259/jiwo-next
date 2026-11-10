import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Server } from 'lucide-react'
import { carriers, levelColor } from '../domain/carriers'
import { windowLabel, windows } from '../domain/format'
import { fetchSeries, linesOf } from '../domain/history'
import { seriesHistory } from '../model'
import { LOSS_ALERT, nodeQuality, qualityBar, sortNodes, type NetworkSort, type Source } from '../domain/network'
import type { HistoryResponse, MonitorNode, ThemeConfig } from '../domain/types'
import { NetworkRow } from '../components/NetworkRow'
import { PageHeading } from '../components/PageHeading'
import { QualityBar } from '../components/QualityBar'
import { rangeKey } from './NodeDetail'

const SORTS: { id: NetworkSort; label: string }[] = [
  { id: 'hub', label: '主控顺序' },
  { id: 'latency', label: '综合延迟' },
  { id: 'loss', label: '丢包' },
  { id: 'jitter', label: '抖动' },
]
const LEGEND = [
  { level: 0, label: '≤60ms' },
  { level: 1, label: '≤120ms' },
  { level: 2, label: '≤200ms 或丢包 <3%' },
  { level: 3, label: '≤300ms 或丢包 <10%' },
  { level: 4, label: '更高或丢包 ≥10%' },
]

export function NetworkView({
  nodes,
  config,
  historyDays,
  initialHistory,
}: {
  nodes: MonitorNode[]
  config: ThemeConfig
  historyDays: number
  initialHistory: Record<number, HistoryResponse>
}) {
  const [group, setGroup] = useState<string | null>(null)
  const [hours, setHours] = useState(24)
  const [sort, setSort] = useState<NetworkSort>('hub')
  const [showOffline, setShowOffline] = useState(true)
  const [extra, setExtra] = useState<Record<number, HistoryResponse>>({})
  const [failures, setFailures] = useState<Record<number, string>>({})
  const [now, setNow] = useState(() => Date.now() / 1000)
  const generation = useRef(0)

  const ranges = windows(historyDays || 7)
  const onlineIds = nodes.filter((n) => n.online).map((n) => n.id)

  // 24 小时窗口直接用首页已经拉过的探测历史；其它窗口在这里按节点各取一次。
  const load = useCallback(() => {
    const epoch = ++generation.current
    const range = rangeKey(hours)
    for (const id of onlineIds) {
      // server 用 0 基下标（见 network 页顶部说明），主题内 id 从 1 开始。
      fetchSeries(id - 1, range, 'all')
        .then((payload) => {
          if (epoch !== generation.current) return
          const series = linesOf(payload)
          setExtra((prev) => ({ ...prev, [id]: seriesHistory(payload, series) }))
          setFailures((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
        })
        .catch((cause: unknown) => {
          if (epoch !== generation.current) return
          setFailures((prev) => ({ ...prev, [id]: cause instanceof Error ? cause.message : '历史数据加载失败' }))
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, onlineIds.join(',')])

  useEffect(() => {
    setExtra({})
    setFailures({})
    load()
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return
      setNow(Date.now() / 1000)
      load()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const groups = [...new Set(nodes.map((n) => n.group).filter(Boolean))]
  const matched = nodes.filter((n) => group === null || n.group === group)
  const rowsData = matched
    .filter((n) => showOffline || n.online)
    .map((node) => {
      const history = node.online ? (hours === 24 ? (initialHistory[node.id] ?? extra[node.id]) : extra[node.id]) : undefined
      const quality = history ? nodeQuality(history, config.nodes[String(node.id)]) : null
      return {
        node,
        history,
        quality,
        segments: history && quality ? qualityBar([{ history, taskIds: quality.lines }], hours, now) : null,
        failed: node.online && !history && Boolean(hours === 24 ? false : failures[node.id]),
      }
    })
  const rows = sortNodes(rowsData, sort)

  const online = matched.filter((n) => n.online)
  const loaded = rowsData.filter((r) => r.node.online && r.history && r.quality)
  const sources: Source[] = loaded.map((r) => ({ history: r.history!, taskIds: r.quality!.lines }))
  const summary = {
    online: online.length,
    total: matched.length,
    lines: loaded.reduce((sum, r) => sum + r.quality!.lines.length, 0),
    lossy: loaded.reduce((sum, r) => sum + r.quality!.lossyLines, 0),
    bar: loaded.length ? qualityBar(sources, hours, now) : null,
    pending: rowsData.some((r) => r.node.online && !r.history && !r.failed),
  }

  return (
    <>
      <PageHeading
        crumbs={[{ label: 'Football Monitor', to: '/' }, { label: '网络质量' }]}
        title="网络质量"
        description="所有节点各条探测线路的延迟、丢包与抖动。"
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
      />

      {!nodes.length ? (
        <div className="empty-state panel">
          <Server size={32} />
          <h3>阵容正在等待第一位球员</h3>
          <p>请在妙妙屋 X 主控中添加节点，并允许在公开页显示。</p>
        </div>
      ) : (
        <>
          <section className="network-summary panel" aria-label="网络质量概览">
            <span className="ns-title">
              <i className="ns-dot" aria-hidden="true" />
              网络质量
            </span>
            <QualityBar className="ns-bar" segments={summary.bar} loading={summary.pending} label={`全站近 ${windowLabel(hours)}质量走势`} />
            <span className="ns-window">过去 {windowLabel(hours)}</span>
            <span className="ns-stats">
              <span className="ns-online">
                <b>
                  {summary.online}/{summary.total}
                </b>{' '}
                在线
              </span>
              <span className="ns-lines">
                <b>{summary.lines}</b> 条线路
              </span>
              {summary.lossy > 0 && (
                <span className="ns-lossy" title={`所选时段丢包 ≥${LOSS_ALERT}% 的线路`}>
                  {summary.lossy} 条丢包
                </span>
              )}
            </span>
            <span className="ns-ranges" role="group" aria-label="时间范围">
              {ranges.map((h) => (
                <button key={h} type="button" className={hours === h ? 'selected' : undefined} aria-pressed={hours === h} onClick={() => setHours(h)}>
                  {windowLabel(h)}
                </button>
              ))}
            </span>
          </section>

          <div className="network-controls">
            <label className="network-offline" htmlFor="network-offline">
              <input id="network-offline" type="checkbox" checked={showOffline} onChange={(event) => setShowOffline(event.target.checked)} />
              显示离线
            </label>
            <label className="sort-control" htmlFor="network-sort">
              排序
              <span className="sort-select">
                <select id="network-sort" value={sort} onChange={(event) => setSort(event.target.value as NetworkSort)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </label>
          </div>

          {!rows.length ? (
            <div className="empty-state panel">
              <Server size={32} />
              <h3>没有找到匹配的节点</h3>
              <p>试试切换分组，或打开“显示离线”。</p>
            </div>
          ) : (
            <section className="network-table panel" data-carriers={config.show_carriers ? 'true' : 'false'} aria-label="节点网络质量">
              <div className="network-head" aria-hidden="true">
                <span>
                  节点 <small>{rows.length}</small>
                </span>
                <span>
                  质量走势<small>过去 {windowLabel(hours)}</small>
                </span>
                <span>综合<small>全部线路均值</small></span>
                {config.show_carriers &&
                  carriers.map((c) => (
                    <span key={c.id} data-carrier={c.id}>
                      {c.short}
                      <small>延迟 · 丢包</small>
                    </span>
                  ))}
                <span>
                  最近丢包<small>丢包 ≥{LOSS_ALERT}%</small>
                </span>
                <span>抖动<small>延迟波动</small></span>
              </div>
              {rows.map((r) => (
                <NetworkRow
                  key={r.node.id}
                  node={r.node}
                  quality={r.quality}
                  segments={r.segments}
                  showCarriers={config.show_carriers}
                  failed={r.failed}
                  now={now}
                />
              ))}
            </section>
          )}

          <ul className="network-legend" aria-label="颜色说明">
            {LEGEND.map((l) => (
              <li key={l.level}>
                <i style={{ background: levelColor(l.level) }} aria-hidden="true" />
                {l.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
