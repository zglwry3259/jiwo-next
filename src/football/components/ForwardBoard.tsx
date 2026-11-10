// 转发链路（主控 show_forward 打开时才有数据）。
// 妙妙屋 X 的链路是「入口 → 中转 → 出口」的站点级对象，不属于任何一台节点，
// 所以挂在首页汇总区下面，不塞进节点详情。状态判定与状态条全部复用 jiwo-probe 的 forward-model，
// 经典主题和足球主题对同一条链路给出同样的结论。
import { availabilityCells, availabilityPct, chainLiveSpeed, chainTraffic, formatAvailability, formatGb, sortChains } from '../../forward-model'
import type { ForwardChainData } from '../../types'
import { useSpeed } from '../hooks'
import type { Vars } from '../css'

const TONE_TEXT: Record<string, string> = {
  ok: '正常',
  warn: '降级',
  down: '中断',
}
const TONE_COLOR: Record<string, string> = {
  ok: '#22c55e',
  warn: '#f59e0b',
  down: '#ef4444',
  idle: 'var(--border)',
}

export function ForwardBoard({ chains }: { chains?: ForwardChainData[] }) {
  const speed = useSpeed()
  if (!chains?.length) return null
  return (
    <section className="forward-board panel" aria-labelledby="forward-title">
      <h2 id="forward-title">转发链路</h2>
      <ol>
        {/* sortChains 已经把状态算好了，直接用，不重复判定。 */}
        {sortChains(chains).map(({ chain, status }) => {
          const availability = availabilityPct(chain)
          const cells = availabilityCells(chain)
          const live = chainLiveSpeed(chain)
          const traffic = chainTraffic(chain)
          return (
            <li key={chain.name} data-tone={status}>
              <span className="fw-head">
                <i className="fw-dot" style={{ background: TONE_COLOR[status] } as Vars} aria-hidden="true" />
                <b className="fw-name">{chain.name}</b>
                <em className="fw-state" style={{ color: TONE_COLOR[status] } as Vars}>
                  {TONE_TEXT[status]}
                </em>
              </span>
              <span className="fw-stats">
                <span title="入口到出口的整条链路延迟">
                  端到端 <b>{Math.round(chain.end_to_end_ms)}</b> ms
                </span>
                <span title="最近一次采样的链路丢包">
                  丢包 <b>{Number((chain.loss_pct ?? 0).toFixed(2))}</b>%
                </span>
                {availability !== null && (
                  <span title="近 24 小时可用率">
                    可用 <b>{formatAvailability(availability)}</b>
                  </span>
                )}
                {live && (
                  <span title="入口在这条链上的实时流量">
                    实时 ↓ {speed(live.down)} · ↑ {speed(live.up)}
                  </span>
                )}
                {traffic && (
                  <span title="链路上各角色服务器近 7 天流量合计">7 天 {formatGb(traffic.total)}</span>
                )}
              </span>
              {cells && (
                <span className="fw-cells" aria-label="近 24 小时链路状态">
                  {cells.map((cell) => (
                    <i key={cell.key} style={{ background: TONE_COLOR[cell.tone] } as Vars} title={cell.label} />
                  ))}
                </span>
              )}
              <span className="fw-hops">
                {chain.groups.map((group, index) => (
                  <span key={`${group.name}-${index}`} className="fw-hop" data-healthy={group.to_next_ms >= 0 ? 'true' : 'false'}>
                    {group.name}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
