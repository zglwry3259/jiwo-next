import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { geoContains, geoDistance, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Feature, FeatureCollection, MultiLineString } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import landAtlas from 'world-atlas/land-110m.json'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import type { CountryMarker } from '../domain/ops'

/**
 * 运维模式的地球：world-atlas 1:110m 国家，按正射投影画在 canvas 上，缓慢自转；
 * 每个国家一个可点的 HTML 标记叠在上面。有目标时地球转过去、拉近，并放下准星。
 * 每帧最多 30 次（拖动时 60 次），页面隐藏时停；关掉动效就静止并直接跳转。
 */
const countries = (
  feature(
    world as unknown as Topology,
    (world as unknown as Topology).objects.countries as GeometryCollection,
  ) as FeatureCollection
).features as Feature[]
// 所有国界与海岸线画一次，描边就不会一国家一条。
const borders = mesh(world as unknown as Topology, (world as unknown as Topology).objects.countries as GeometryCollection) as MultiLineString
const landTopology = landAtlas as unknown as Topology
const land = feature(landTopology, landTopology.objects.land as GeometryCollection) as FeatureCollection
const coast = mesh(landTopology, landTopology.objects.land as GeometryCollection) as MultiLineString

// 规则网格：每 15 度一条经线（到 75 度纬线为止），每 15 度一条纬线。
// 逐度采样太密：450px 半径下 5 度折线与 1 度折线的最大偏差不到 0.4px，
// 但点数降到 1/5，每帧的投影与描边开销同比减少。
const STEP = 15,
  EDGE = 75,
  SAMPLE = 5
const ramp = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let v = from; v <= to; v += step) out.push(v)
  if (out[out.length - 1] !== to) out.push(to)
  return out
}
const graticule: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [
    ...ramp(0, 360 / STEP - 1, 1).map((i) => ramp(-EDGE, EDGE, SAMPLE).map((lat) => [i * STEP - 180, lat] as [number, number])),
    ...ramp(-EDGE / STEP, EDGE / STEP, 1).map((i) => ramp(-180, 180, SAMPLE).map((lon) => [lon, i * STEP] as [number, number])),
  ],
}
const TILT = -18,
  SPIN = 4, // 度/秒
  ZOOM = 1.7,
  DIP = 0.35

type Target = { key: string; code: string; at: readonly [number, number] } | null

function OpsGlobeView({
  markers,
  target,
  stale,
  onPick,
  onGrab,
  onBlank,
  children,
}: {
  markers: CountryMarker[]
  target: Target
  stale: boolean
  onPick: (code: string) => void
  onGrab: () => void
  onBlank: () => void
  children?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const still = () =>
    document.documentElement.dataset.motion === 'false' || matchMedia('(prefers-reduced-motion: reduce)').matches

  // 全部逐帧状态放在 ref 里，避免每帧触发 React 重渲染。
  const s = useRef({
    rotation: [-110, TILT] as [number, number],
    flight: null as { from: [number, number]; to: [number, number]; start: number; zoom: number; dip: number } | null,
    zoom: 1,
    frame: 0,
    looping: false,
    last: 0,
    drag: null as { id: number; x: number; y: number; t: number } | null,
    press: { x: 0, y: 0, t: 0 },
    fling: [0, 0] as [number, number],
    quietUntil: 0,
    places: new WeakMap<HTMLElement, [number, number]>(),
    // 叠层里的标记元素缓存；pos/vis 记上一帧写过什么，没变就不碰 style。
    marks: [] as HTMLElement[],
    pos: new WeakMap<HTMLElement, [number, number]>(),
    vis: new WeakMap<HTMLElement, boolean>(),
    // 上一次真正画出去的姿态，用来跳过没有变化的帧。
    drew: { rotation: [Number.NaN, Number.NaN] as [number, number], zoom: Number.NaN },
    // 球体渐变按半径缓存，缩放过程中不必每帧 createRadialGradient。
    sea: null as CanvasGradient | null,
    seaKey: '',
    lit: [] as Feature[],
    // 每帧读 ref 会看到旧闭包，所以用 ref 保存最新的 props 值。
    markers,
    target,
    stale,
  })
  s.current.markers = markers
  s.current.target = target
  s.current.stale = stale

  // 有节点的国家点亮；只在「哪些国家、在哪」真的变了才重算。
  // Ops 页面每秒都会重建 markers 数组（时钟），按引用比较会让 geoContains
  // 对 177 个国家 × 每个标记每秒全跑一遍，主线程被这几万次点在多边形判断占满。
  const litKey = useRef('')
  useEffect(() => {
    const key = markers.map((m) => `${m.code}@${m.at[0].toFixed(2)},${m.at[1].toFixed(2)}`).join('|')
    if (key === litKey.current) return
    litKey.current = key
    s.current.marks = []
    const points = markers.map((m) => m.at as [number, number])
    s.current.lit = countries.filter((c) => points.some((p) => geoContains(c, p)))
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers])

  const zoomGoal = () => (s.current.target ? ZOOM : 1)

  function draw() {
    const el = canvas.current,
      ctx = el?.getContext('2d')
    const { width, height } = size
    if (!el || !ctx || !width || !height) return
    const st = s.current
    // 4K/高 DPI 屏上 canvas 会到 5000 万像素，clearRect + 大面积填充直接把 30fps 吃光。
    // 给绘制面积设 400 万像素预算，超出就按 sqrt 降采样：细线略软，但滚动与拖动不掉帧。
    const budget = 4_000_000
    let ratio = Math.min(2, window.devicePixelRatio || 1)
    if (width * height * ratio * ratio > budget) ratio = Math.max(1, Math.sqrt(budget / (width * height)))
    if (el.width !== Math.round(width * ratio)) el.width = Math.round(width * ratio)
    if (el.height !== Math.round(height * ratio)) el.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    // 和舞台一样高，铺满屏幕并从左侧溢出，压在状态列后面。
    const radius = height * 0.52 * st.zoom,
      cx = width / 2,
      cy = height / 2
    const at = (rotate: [number, number, number]) => geoOrthographic().scale(radius).translate([cx, cy]).rotate(rotate).clipAngle(90).precision(0)
    // 背面透过玻璃看到的：对跖点的视图，左右镜像。
    // 只在放大（看单个国家）时画：全景视角下这层 0.05 的线贴在球心附近几乎不可见，
    // 却要每帧多做一次完整海岸线投影与裁剪。
    if (st.zoom > 1.02) {
      const back = at([st.rotation[0] + 180, -st.rotation[1], 0]).reflectX(true)
      const behind = geoPath(back, ctx)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      behind(coast)
      ctx.stroke()
    }

    const projection = at([st.rotation[0], st.rotation[1], 0])
    const path = geoPath(projection, ctx)
    // 渐变每帧新建也是一笔开销；半径取整到像素后缓存，缩放过程中最多重建几百次。
    const seaKey = `${Math.round(radius)}:${Math.round(cx)}:${Math.round(cy)}`
    if (!st.sea || st.seaKey !== seaKey) {
      const sea = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.05, cx, cy, radius)
      sea.addColorStop(0, 'rgba(255, 255, 255, 0.06)')
      sea.addColorStop(1, 'rgba(255, 255, 255, 0.012)')
      st.sea = sea
      st.seaKey = seaKey
    }
    ctx.fillStyle = st.sea!
    ctx.beginPath()
    path({ type: 'Sphere' })
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 0.6
    ctx.beginPath()
    path(graticule)
    ctx.stroke()
    // 陆地一次填充、国界一次描边，再叠上有点的国家。
    ctx.fillStyle = 'rgba(255, 255, 255, 0.075)'
    ctx.beginPath()
    path(land)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    path(borders)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (const c of st.lit) path(c)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    path({ type: 'Sphere' })
    ctx.stroke()
    place(projection)
    // 记下画出去时的姿态：下一帧如果旋转与缩放都没动，就跳过整轮重绘。
    st.drew = { rotation: [st.rotation[0], st.rotation[1]], zoom: st.zoom }
  }

  /** 标记与准星是 canvas 之上的 HTML：每帧直接写样式，转到背面就藏起来。
   *  元素列表缓存起来：每帧 querySelectorAll 会遍历整个叠层（含卡片 DOM），
   *  而且无条件写 transform 会让浏览器每帧重算样式。坐标变化超过半像素才写。 */
  function place(projection: ReturnType<typeof geoOrthographic>) {
    const st = s.current
    const centre: [number, number] = [-st.rotation[0], -st.rotation[1]]
    let marks = st.marks
    if (!marks.length || marks.some((el) => !el.isConnected)) {
      marks = st.marks = Array.from(layer.current?.querySelectorAll<HTMLElement>('[data-at]') ?? [])
    }
    for (const el of marks) {
      let at = st.places.get(el)
      if (!at) st.places.set(el, (at = JSON.parse(el.dataset.at!) as [number, number]))
      const point = projection(at),
        away = geoDistance(at, centre)
      const shown = Boolean(point) && away < Math.PI / 2 - 0.08
      if (st.vis.get(el) !== shown) {
        st.vis.set(el, shown)
        el.style.opacity = shown ? String(Math.min(1, (Math.PI / 2 - away) * 3)) : '0'
        el.style.visibility = shown ? '' : 'hidden'
      }
      if (point) {
        const last = st.pos.get(el)
        if (!last || Math.abs(last[0] - point[0]) > 0.4 || Math.abs(last[1] - point[1]) > 0.4) {
          st.pos.set(el, [point[0], point[1]])
          el.style.transform = `translate(${point[0]}px, ${point[1]}px)`
        }
      }
    }
  }

  const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

  function tick(time: number) {
    const st = s.current
    st.frame = requestAnimationFrame(tick)
    if (time - st.last < (st.drag ? 1000 / 60 : 1000 / 30) - 1) return
    const dt = st.last ? Math.min(0.1, (time - st.last) / 1000) : 0
    st.last = time
    if (st.flight) {
      const k = Math.min(1, (time - st.flight.start) / 1600)
      const [lon, lat] = geoInterpolate([-st.flight.from[0], -st.flight.from[1]], [-st.flight.to[0], -st.flight.to[1]])(ease(k))
      st.rotation = [-lon, -lat]
      // 路上拉远一点、落地再拉近，像镜头在两个地方之间移动。
      st.zoom = st.flight.zoom + (zoomGoal() - st.flight.zoom) * ease(k) - st.flight.dip * Math.sin(Math.PI * k)
      if (k === 1) st.flight = null
    } else if (st.drag) {
      // 手在控制。
    } else if (Math.abs(st.fling[0]) + Math.abs(st.fling[1]) > 0.5) {
      st.rotation = turned(st.rotation, st.fling[0] * dt, st.fling[1] * dt)
      const decay = Math.exp(-3 * dt)
      st.fling = [st.fling[0] * decay, st.fling[1] * decay]
    } else if (!st.target && !st.stale && time > st.quietUntil) {
      st.rotation = [st.rotation[0] + SPIN * dt, st.rotation[1] + (TILT - st.rotation[1]) * dt]
    }
    // 关掉卡片后地球回到全景。
    if (!st.flight) st.zoom += (zoomGoal() - st.zoom) * (1 - Math.exp(-4 * dt))
    // 姿态没变就不画：卡片打开、缩放收敛完、又没有自转时，每帧重绘纯属白烧。
    const d = st.drew
    const moved =
      !Number.isFinite(d.zoom) ||
      Math.abs(st.rotation[0] - d.rotation[0]) > 0.02 ||
      Math.abs(st.rotation[1] - d.rotation[1]) > 0.02 ||
      Math.abs(st.zoom - d.zoom) > 0.001
    if (moved) draw()
  }

  const turned = (r: [number, number], dLon: number, dLat: number): [number, number] => [r[0] + dLon, Math.max(-85, Math.min(85, r[1] + dLat))]
  const perPixel = () => 180 / (Math.PI * Math.max(1, size.height * 0.52 * s.current.zoom))

  const grab = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const st = s.current
    st.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() }
    st.press = { x: event.clientX, y: event.clientY, t: st.drag.t }
    st.flight = null
    st.fling = [0, 0]
    event.currentTarget.setPointerCapture?.(event.pointerId)
    onGrab()
  }
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const st = s.current
    if (!st.drag || event.pointerId !== st.drag.id) return
    const k = perPixel(),
      now = performance.now(),
      dLon = (event.clientX - st.drag.x) * k,
      dLat = -(event.clientY - st.drag.y) * k,
      dt = Math.max(0.008, (now - st.drag.t) / 1000)
    st.rotation = turned(st.rotation, dLon, dLat)
    st.fling = [dLon / dt, dLat / dt]
    st.drag = { id: st.drag.id, x: event.clientX, y: event.clientY, t: now }
    // 拖动时 tick 循环本来就是 60fps 并在末尾重绘；这里再排一帧等于每帧画两次，
    // 指针事件越密（120Hz 触控板）重复绘制越多，这正是拖动发涩的来源。
    if (!st.looping) draw()
  }
  const release = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const st = s.current
    if (!st.drag || event.pointerId !== st.drag.id) return
    // 松手前停顿过就不甩出去；关掉动效时从不甩。
    if (performance.now() - st.drag.t > 80 || still()) st.fling = [0, 0]
    st.drag = null
    st.quietUntil = performance.now() + 4000
    // 几乎没动的按下算点击地球本身：关卡片，让地球退回全景。
    if (Math.hypot(event.clientX - st.press.x, event.clientY - st.press.y) < 6 && performance.now() - st.press.t < 500) onBlank()
  }

  function start() {
    const st = s.current
    cancelAnimationFrame(st.frame)
    st.last = 0
    st.looping = !still() && !document.hidden
    if (!st.looping) {
      draw()
      return
    }
    st.frame = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const el = box.current
    if (!el) return undefined
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(([entry]) => {
            if (!entry) return
            setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
          })
        : null
    observer?.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    // 第一眼就面向有节点的方向，而不是空海面。
    const first = s.current.markers[0]
    if (first) s.current.rotation = [-first.at[0], TILT]
    const onVisible = () => {
      if (document.hidden) {
        cancelAnimationFrame(s.current.frame)
        s.current.looping = false
      } else start()
    }
    document.addEventListener('visibilitychange', onVisible)
    start()
    return () => {
      cancelAnimationFrame(s.current.frame)
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 画布尺寸变化后补一帧。
  useEffect(() => draw(), [size])

  // 目标变化：把地球转到那个地方，偏上一点；关掉动效就直接跳。
  const targetKey = target ? `${target.at[0]},${target.at[1]}` : ''
  useEffect(() => {
    const st = s.current
    // 准星卡片随 target.key 重建，缓存里的旧节点已经脱离文档。
    st.marks = []
    const t = s.current.target
    if (!t) {
      if (still()) {
        st.zoom = 1
        draw()
      }
      return
    }
    const to: [number, number] = [-t.at[0], Math.max(-60, Math.min(60, -t.at[1] + 8))]
    if (still()) {
      st.rotation = to
      st.zoom = ZOOM
      draw()
    } else {
      const far = geoDistance([-st.rotation[0], -st.rotation[1]], [-to[0], -to[1]]) / (Math.PI / 2)
      st.flight = { from: st.rotation, to, start: performance.now(), zoom: st.zoom, dip: DIP * Math.min(1, far) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  const ring = (m: CountryMarker) => {
    const ok = (m.ok / m.total) * 100,
      warn = ok + (m.warn / m.total) * 100
    return `conic-gradient(var(--success) 0 ${ok}%, var(--warning) ${ok}% ${warn}%, var(--danger) ${warn}% 100%)`
  }
  const label = (m: CountryMarker) =>
    `${countryName(m.code)} · ${m.total} 台${m.off ? ` · ${m.off} 台离线` : ''}${m.warn ? ` · ${m.warn} 台有异常` : ''}`

  return (
    <div ref={box} className="ops-globe">
      <canvas
        ref={canvas}
        className="og-canvas"
        role="img"
        aria-label={`节点分布地球，${markers.length} 个国家与地区，可拖动旋转`}
        onPointerDown={grab}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
      />
      <div ref={layer} className="og-layer">
        {markers.map((m) => (
          <button
            key={m.code}
            type="button"
            className="og-marker"
            data-at={JSON.stringify(m.at)}
            data-state={m.off ? 'off' : m.warn ? 'warn' : 'ok'}
            data-focus={target?.code === m.code || undefined}
            aria-label={label(m)}
            title={label(m)}
            onClick={() => onPick(m.code)}
          >
            <span className="og-dot" style={{ background: ring(m) }}>
              <b>{m.total}</b>
            </span>
            {flagUrl(m.code) && <img className="og-flag" src={flagUrl(m.code)} alt="" />}
          </button>
        ))}
        {target && (
          <div key={target.key} className="og-hud" data-at={JSON.stringify(target.at)}>
            <svg className="og-reticle" viewBox="0 0 132 132" fill="none" aria-hidden="true">
              <g className="og-reticle-spin">
                <circle className="og-reticle-dash" cx="66" cy="66" r="60" />
                <path className="og-reticle-tick" d="M66 2v10M66 120v10M2 66h10M120 66h10" />
              </g>
              <circle className="og-reticle-inner" cx="66" cy="66" r="38" />
              <path className="og-reticle-corner" d="M28 44V28h16M88 28h16v16M104 88v16H88M44 104H28V88" />
            </svg>
            <i className="og-lead" aria-hidden="true" />
            <div className="og-card">{children}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 运维地球。Ops 页面每秒都因时钟重渲染一次，memo 之后没有卡片时（children 为 false）
 * 秒针不会传进这个组件；卡片打开时 children 本身每秒要更新，这里就不再省这一层。
 */
export const OpsGlobe = memo(OpsGlobeView)
