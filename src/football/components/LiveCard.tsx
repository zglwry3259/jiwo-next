import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { bytes } from '../domain/format'
import type { NodeScore } from '../domain/score'
import type { CardView, HistoryResponse, MonitorNode, ThemeConfig } from '../domain/types'
import { CardLiveStrip } from './CardLiveStrip'
import { Link } from './PageHeading'
import { PlayerCard } from './PlayerCard'
import { NodePanel } from './NodePanel'

export function LiveCard({
  node,
  view,
  config,
  score,
  tier,
  history,
  historyFailed,
  index,
  onVisible,
}: {
  node: MonitorNode
  view: CardView
  config: ThemeConfig
  score: NodeScore
  tier: 'bronze' | 'silver' | 'gold'
  history?: HistoryResponse
  historyFailed?: boolean
  index: number
  onVisible: () => void
}) {
  const element = useRef<HTMLDivElement>(null)
  // 首屏的头几张卡等卡面图（最多 1.2 秒），然后依次淡上来。
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const intro = config.motion && !reduced
  const delay = `${Math.min(index, 12) * 40}ms`
  const [ready, setReady] = useState(!intro)

  useEffect(() => {
    if (!intro) return undefined
    const face = element.current?.querySelector<HTMLImageElement>('img.pc-face')
    if (face?.complete && face.naturalWidth) {
      setReady(true)
      return undefined
    }
    const show = () => setReady(true)
    face?.addEventListener('load', show, { once: true })
    face?.addEventListener('error', show, { once: true })
    const timer = window.setTimeout(show, 1200)
    return () => {
      face?.removeEventListener('load', show)
      face?.removeEventListener('error', show)
      window.clearTimeout(timer)
    }
  }, [intro])

  // 只有进入视口（含 120px 预取距离）的卡片才请求探测历史，摆满一屏也不至于打爆主控。
  const visible = useRef(false)
  useEffect(() => {
    const target = element.current
    if (!target) return undefined
    const refresh = () => {
      if (!visible.current || document.hidden) return
      onVisible()
    }
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            (entries) => {
              visible.current = entries[0]?.isIntersecting ?? false
              refresh()
            },
            { rootMargin: '120px' },
          )
        : null
    observer?.observe(target)
    if (!observer) {
      visible.current = true
      refresh()
    }
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      observer?.disconnect()
      window.clearInterval(timer)
    }
  }, [onVisible])

  const label =
    `查看 ${node.name} 详情，${node.online ? '在线' : '离线'}，综合 ${score.overall ?? '无数据'}` +
    (config.show_traffic ? `，今日下行 ${bytes(node.day_rx)}，上行 ${bytes(node.day_tx)}` : '')

  return (
    <div
      ref={element}
      className={`live-card${intro ? ' card-intro' : ''}${ready ? ' card-ready' : ''}`}
      data-view={view}
      style={intro ? ({ '--intro-delay': delay } as CSSProperties) : undefined}
    >
      <Link to={`/node/${node.id}`} className="live-card-link" ariaLabel={label}>
        <span className="sr-only">{label}</span>
        <PlayerCard node={node} config={config} score={score} tier={tier} />
        {view === 'split' ? (
          <NodePanel
            node={node}
            nodeConfig={config.nodes[String(node.id)]}
            history={history}
            unavailable={historyFailed}
            showCarriers={config.show_carriers}
            showTraffic={config.show_traffic && config.show_daily}
            showBilling={config.show_billing}
          />
        ) : (
          <CardLiveStrip
            node={node}
            nodeConfig={config.nodes[String(node.id)]}
            history={history}
            unavailable={historyFailed}
            showCarriers={config.show_carriers}
            showTraffic={config.show_traffic && config.show_daily}
          />
        )}
      </Link>
    </div>
  )
}
