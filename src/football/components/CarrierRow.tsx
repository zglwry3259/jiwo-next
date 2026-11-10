import { carriers, resolveCarrier } from '../domain/carriers'
import type { CarrierId, HistoryResponse, NodeConfig } from '../domain/types'
import type { Vars } from '../css'

/**
 * 三网三格。`tasks` 是调用方按探测名自动匹配出的任务号（主控下发的探测没有数字 id，
 * 站长也没手填时靠它兜底），站长配置过的 taskId 优先。
 */
export function CarrierRow({
  config,
  history,
  unavailable,
  tasks,
  lines,
}: {
  config?: NodeConfig
  history?: HistoryResponse
  unavailable?: boolean
  tasks?: Partial<Record<CarrierId, number>>
  /** 主控回程路由检测（return_routes）给出的线路名，站长没填 line 时用它 */
  lines?: Partial<Record<CarrierId, string>>
}) {
  const rows = carriers.map((c) => {
    const conf = config?.carriers?.[c.id]
    const taskId = conf?.taskId ?? tasks?.[c.id]
    const merged =
      taskId === undefined
        ? conf?.line || !lines?.[c.id]
          ? conf
          : { ...conf, line: lines[c.id] }
        : { ...conf, taskId, line: conf?.line || lines?.[c.id] || (history?.probes[String(taskId)] ?? '') }
    return { ...c, ...resolveCarrier(merged, history, Date.now() / 1000, unavailable) }
  })
  return (
    <div className="carrier-row">
      {rows.map((c) => (
        <div
          key={c.id}
          className="carrier-cell"
          style={{ '--carrier': c.color } as Vars}
          title={`${c.name} · ${c.label}${c.taskId ? ` · 任务 #${c.taskId}` : ''}`}
        >
          <span className="carrier-name">
            <img className="carrier-logo" src={c.logo} alt="" aria-hidden="true" decoding="async" />
            {c.short}
          </span>
          <strong>
            {c.latency === null ? '—' : Number(c.latency.toFixed(1))}
            {c.latency !== null && <small>ms</small>}
          </strong>
          <span className="carrier-line">{c.line}</span>
          {c.status !== 'success' && <span className="carrier-state">{c.label}</span>}
        </div>
      ))}
    </div>
  )
}
