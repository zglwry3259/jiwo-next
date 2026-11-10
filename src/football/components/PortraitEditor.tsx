import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { builtinPortraits, NEUTRAL_PORTRAIT, resolvePortrait } from '../domain/portraits'
import { DEFAULT_PORTRAIT } from '../domain/portrait'
import type { PortraitConfig } from '../domain/types'
import type { Vars } from '../css'

/**
 * 立绘裁切：把玩家图放在 4:5 的卡面框里拖动、缩放，参数与卡面渲染同一套（scale / x / y / fit / area）。
 * 800×1000 参考画布，x 每 1 单位 8px、y 每 1 单位 10px，与 portraitTransform 一致。
 */
export function PortraitEditor({
  value,
  fallback,
  onChange,
  onClose,
}: {
  value: PortraitConfig | undefined
  fallback: string
  onChange: (next: PortraitConfig) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PortraitConfig>({ ...DEFAULT_PORTRAIT, ...value })
  const [tab, setTab] = useState<'builtin' | 'url'>(value?.url ? 'url' : 'builtin')
  const [url, setUrl] = useState(value?.url ?? '')
  const drag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null)
  const stage = useRef<HTMLDivElement>(null)

  const drawn = resolvePortrait({ ...draft, url: tab === 'url' ? url.trim() || undefined : undefined }, fallback)
  const update = (patch: Partial<PortraitConfig>) => setDraft((prev) => ({ ...prev, ...patch }))

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, sx: draft.x, sy: draft.y }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const started = drag.current
    if (!started) return
    const box = stage.current?.getBoundingClientRect()
    if (!box) return
    // 屏幕像素 → 参考画布单位：x 每单位 8px、y 每单位 10px，再按卡面显示宽度折算。
    const k = 800 / box.width
    update({
      x: Math.max(-60, Math.min(60, Math.round(started.sx + (event.clientX - started.x) * k / 8))),
      y: Math.max(-60, Math.min(60, Math.round(started.sy + (event.clientY - started.y) * k / 10))),
    })
  }
  const up = () => {
    drag.current = null
  }
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!stage.current?.contains(event.target as Node)) return
      event.preventDefault()
      update({ scale: Math.max(0.65, Math.min(3, Math.round((draft.scale - Math.sign(event.deltaY) * 0.05) * 100) / 100)) })
    }
    window.addEventListener('wheel', wheel, { passive: false })
    return () => window.removeEventListener('wheel', wheel)
  }, [draft.scale])

  return (
    <div className="fb-modal-backdrop" onMouseDown={onClose}>
      <section className="fb-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="立绘编辑器">
        <header>
          <h2>立绘编辑</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="fb-portrait-editor">
          <div
            ref={stage}
            className="fb-portrait-stage"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            title="拖动调整位置，滚轮缩放"
          >
            <svg viewBox="-200 -250 1200 1500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <image
                href={drawn.src}
                x={0}
                y={0}
                width={800}
                height={1000}
                preserveAspectRatio={`xMidYMid ${drawn.config.fit === 'cover' ? 'slice' : 'meet'}`}
                transform={`translate(${400 + drawn.config.x * 8} ${500 + drawn.config.y * 10}) scale(${drawn.config.scale}) translate(-400 -500)`}
              />
            </svg>
            <span className="fb-portrait-guide" data-area={draft.area} />
          </div>
          <div className="fb-portrait-fields">
            <label>
              缩放 <output>{draft.scale.toFixed(2)}×</output>
              <input type="range" min={0.65} max={3} step={0.05} value={draft.scale} onChange={(event) => update({ scale: Number(event.target.value) })} />
            </label>
            <label>
              横向 <output>{draft.x}</output>
              <input type="range" min={-60} max={60} step={1} value={draft.x} onChange={(event) => update({ x: Number(event.target.value) })} />
            </label>
            <label>
              纵向 <output>{draft.y}</output>
              <input type="range" min={-60} max={60} step={1} value={draft.y} onChange={(event) => update({ y: Number(event.target.value) })} />
            </label>
            <div className="fb-field-row">
              <button type="button" className={draft.fit === 'contain' ? 'fb-btn fb-btn-outline is-on' : 'fb-btn fb-btn-outline'} onClick={() => update({ fit: 'contain' })}>
                完整放入
              </button>
              <button type="button" className={draft.fit === 'cover' ? 'fb-btn fb-btn-outline is-on' : 'fb-btn fb-btn-outline'} onClick={() => update({ fit: 'cover' })}>
                填满裁切
              </button>
            </div>
            <div className="fb-field-row">
              <button type="button" className={draft.area === 'full' ? 'fb-btn fb-btn-outline is-on' : 'fb-btn fb-btn-outline'} onClick={() => update({ area: 'full' })}>
                全身
              </button>
              <button type="button" className={draft.area === 'upper' ? 'fb-btn fb-btn-outline is-on' : 'fb-btn fb-btn-outline'} onClick={() => update({ area: 'upper' })}>
                半身
              </button>
            </div>
            <label className="fb-check">
              <input type="checkbox" checked={draft.hidden === true} onChange={(event) => update({ hidden: event.target.checked })} />
              不显示立绘（只留卡面）
            </label>

            <div className="fb-tabs">
              <button type="button" className={tab === 'builtin' ? 'selected' : ''} onClick={() => setTab('builtin')}>
                内置立绘
              </button>
              <button type="button" className={tab === 'url' ? 'selected' : ''} onClick={() => setTab('url')}>
                自定义图片
              </button>
            </div>
            {tab === 'builtin' ? (
              <div className="fb-portrait-picks">
                {builtinPortraits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={draft.builtin === p.id ? 'is-on' : ''}
                    onClick={() => update({ builtin: p.id, ...p.preset, box: undefined, fit: 'contain' })}
                    title={p.label}
                  >
                    <img src={p.src} alt="" />
                    <span>{p.label}</span>
                  </button>
                ))}
                <button type="button" className={draft.builtin === NEUTRAL_PORTRAIT ? 'is-on' : ''} onClick={() => update({ builtin: NEUTRAL_PORTRAIT })}>
                  <span className="fb-portrait-none">原图</span>
                </button>
              </div>
            ) : (
              <label className="fb-text">
                图片地址（HTTPS）
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/player.webp" />
              </label>
            )}
          </div>
        </div>
        <footer>
          <button
            type="button"
            className="fb-btn fb-btn-ghost"
            onClick={() => {
              setDraft({ ...DEFAULT_PORTRAIT })
              setUrl('')
            }}
          >
            恢复默认
          </button>
          <span />
          <button type="button" className="fb-btn fb-btn-outline" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="fb-btn fb-btn-primary"
            onClick={() => {
              const next: PortraitConfig = { ...draft }
              if (tab === 'url' && url.trim()) next.url = url.trim()
              else delete next.url
              onChange(next)
              onClose()
            }}
          >
            保存立绘
          </button>
        </footer>
      </section>
    </div>
  )
}
