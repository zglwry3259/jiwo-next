import { useEffect, useRef, useState } from 'react'
import { CLOCK_ROWS, clockCells, clockText, type ClockCell } from '../domain/clock'

interface Ripple {
  x: number
  y: number
  at: number
  strength: number
}

const RIPPLE_SPEED = 9 // 每秒格子数
const RIPPLE_LIFE = 1.6
const WATER = '.:~'

/**
 * 按 ascii-pond 的方式画的时钟：单等宽字符网格铺在 canvas 上，数字是点阵块，其余是淡淡的水面；
 * 数字变化或指针经过会荡开一圈涟漪。
 */
export function AsciiClock({ motion }: { motion: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [label, setLabel] = useState(`当前时间 ${clockText(new Date()).slice(0, 5)}`)
  const state = useRef({
    width: 0,
    height: 0,
    cw: 10,
    ch: 14,
    cols: 0,
    rows: 0,
    originX: 0,
    originY: 0,
    leftX: 0,
    topY: 0,
    text: '',
    lit: new Map<number, ClockCell>(),
    changedAt: [] as number[],
    ripples: [] as Ripple[],
    colors: { digit: '#ff7a1a', water: '#565d6d' },
  })

  useEffect(() => {
    const el = canvas.current,
      host = root.current
    if (!el || !host) return undefined
    const s = state.current
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const animate = () => motion && !reduced
    let ctx: CanvasRenderingContext2D | null = null
    let frame = 0
    let timer = 0
    let lastFrame = 0
    let lastStir = 0

    const noise = (c: number, r: number) => {
      const v = Math.sin(c * 127.1 + r * 311.7) * 43758.5453
      return v - Math.floor(v)
    }
    const readColors = () => {
      const style = getComputedStyle(host)
      s.colors = {
        digit: style.getPropertyValue('--primary').trim() || s.colors.digit,
        water: style.getPropertyValue('--muted').trim() || s.colors.water,
      }
    }
    const setText = (next: string, ripple: boolean) => {
      const now = performance.now() / 1000
      const changed = [...next].map((c, i) => c !== s.text[i])
      s.text = next
      setLabel(`当前时间 ${next.slice(0, 5)}`)
      const layout = clockCells(next)
      s.lit = new Map(layout.cells.map((c) => [(s.originY + c.row) * s.cols + s.originX + c.col, c]))
      s.changedAt = changed.map((c, i) => (c ? now : (s.changedAt[i] ?? 0)))
      if (!ripple || !animate()) return
      // 每一位变化的数字从中间荡出一圈。
      changed.forEach((c, i) => {
        if (!c || next[i] === ':') return
        const own = layout.cells.filter((cell) => cell.index === i)
        if (!own.length) return
        const x = own.reduce((a, cell) => a + cell.col, 0) / own.length + s.originX
        s.ripples.push({ x, y: s.originY + CLOCK_ROWS / 2, at: now, strength: 0.9 })
      })
    }
    const layout = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      s.width = el.clientWidth
      s.height = el.clientHeight
      if (!s.width) return
      el.width = Math.round(s.width * dpr)
      el.height = Math.round(s.height * dpr)
      ctx = el.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      const textCols = clockCells('00:00:00').cols
      s.cw = Math.max(5, Math.min(9, Math.floor(s.width / (textCols + 2))))
      s.ch = Math.round(s.cw * 1.35)
      s.cols = Math.ceil(s.width / s.cw)
      s.rows = Math.ceil(s.height / s.ch)
      s.originX = s.cols - textCols
      // 网格锚在右下角：数字末尾与上方文字右齐，并踩在基线上。
      s.leftX = s.width - s.cols * s.cw
      s.topY = s.height - s.rows * s.ch
      s.originY = s.rows - CLOCK_ROWS
      setText(clockText(new Date()), false)
    }
    const draw = (now: number) => {
      if (!ctx) return
      s.ripples = s.ripples.filter((r) => now - r.at < RIPPLE_LIFE)
      ctx.clearRect(0, 0, s.width, s.height)
      ctx.font = `600 ${Math.round(s.ch * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const moving = animate()
      const half = now % 1 < 0.5
      for (let r = 0; r < s.rows; r++)
        for (let c = 0; c < s.cols; c++) {
          const x = s.leftX + c * s.cw,
            y = s.topY + r * s.ch
          let wave = 0
          for (const p of s.ripples) {
            const age = now - p.at,
              d = Math.hypot((c - p.x) * 0.8, r - p.y),
              band = 1 - Math.abs(d - age * RIPPLE_SPEED) / 1.3
            if (band > 0) wave = Math.max(wave, band * p.strength * (1 - age / RIPPLE_LIFE))
          }
          const cell = s.lit.get(r * s.cols + c)
          if (cell) {
            // 刚变的数字四分之一秒内落定；冒号每半秒呼吸一次。
            const settle = moving ? Math.min(1, (now - (s.changedAt[cell.index] ?? 0)) / 0.25) : 1,
              colon = cell.glyph === ':' && moving && !half ? 0.35 : 1,
              alpha = (0.35 + 0.65 * settle) * colon
            ctx.fillStyle = s.colors.digit
            ctx.globalAlpha = (0.24 + 0.22 * wave) * alpha
            ctx.fillRect(x + 0.5, y + 0.5, s.cw - 1, s.ch - 1)
            ctx.globalAlpha = alpha
            ctx.fillText(cell.glyph, x + s.cw / 2, y + s.ch / 2 + 1)
            continue
          }
          const n = noise(c, r)
          if (wave > 0.05) {
            ctx.fillStyle = s.colors.water
            ctx.globalAlpha = Math.min(0.55, wave * 0.6)
            ctx.fillText('~', x + s.cw / 2, y + s.ch / 2 + 1)
          } else if (n < 0.14) {
            ctx.fillStyle = s.colors.water
            ctx.globalAlpha = 0.12 + (moving ? 0.08 * Math.sin(now * 0.8 + n * 60) : 0)
            ctx.fillText(WATER[Math.floor(n * 100) % WATER.length]!, x + s.cw / 2, y + s.ch / 2 + 1)
          }
        }
      ctx.globalAlpha = 1
    }
    const tick = () => {
      if (document.hidden || !s.width) return
      const next = clockText(new Date())
      if (next !== s.text) setText(next, true)
      if (!animate()) draw(performance.now() / 1000)
      window.clearTimeout(timer)
      // 下一次半秒醒来：时间按整秒变，冒号按半秒呼吸。
      timer = window.setTimeout(tick, 500 - (Date.now() % 500) + 5)
    }
    const loop = (ms: number) => {
      frame = requestAnimationFrame(loop)
      // 每秒 30 帧对飘动的字符足够了。
      if (ms - lastFrame < 32) return
      lastFrame = ms
      draw(ms / 1000)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      if (document.hidden || !s.width) return
      readColors()
      tick()
      if (animate()) frame = requestAnimationFrame(loop)
    }
    const stir = (event: PointerEvent) => {
      if (!animate()) return
      const now = performance.now() / 1000
      if (now - lastStir < 0.12) return
      lastStir = now
      const box = el.getBoundingClientRect()
      s.ripples.push({
        x: (event.clientX - box.left - s.leftX) / s.cw,
        y: (event.clientY - box.top - s.topY) / s.ch,
        at: now,
        strength: 0.6,
      })
    }
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start())

    layout()
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            const was = s.width
            layout()
            if (!was !== !s.width) start()
            else draw(performance.now() / 1000)
          })
        : null
    observer?.observe(el)
    // 明暗主题切在 .fb-app 上，换色后立刻取新的颜色。
    const themeObserver = new MutationObserver(() => {
      readColors()
      draw(performance.now() / 1000)
    })
    const app = host.closest('.fb-app')
    if (app) themeObserver.observe(app, { attributes: true, attributeFilter: ['data-fb-theme'] })
    document.addEventListener('visibilitychange', onVisibility)
    el.addEventListener('pointermove', stir)
    start()
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      observer?.disconnect()
      themeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('pointermove', stir)
    }
  }, [motion])

  return (
    <div ref={root} className="ascii-clock" role="img" aria-label={label}>
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  )
}
