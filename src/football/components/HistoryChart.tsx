import { useCallback, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { chartSegments, type ChartSeries } from '../domain/chart'

const LEFT = 50
const RIGHT = 18
const TOP = 11

function nearest<T extends { ts: number }>(list: T[], ts: number): T | null {
  return list.reduce<T | null>((a, p) => (!a || Math.abs(p.ts - ts) < Math.abs(a.ts - ts) ? p : a), null)
}

export function HistoryChart({
  title,
  series,
  unit,
  step = 60,
  maximum,
  height = 140,
  className,
}: {
  title: string
  series: ChartSeries[]
  unit: string
  step?: number
  maximum?: number
  height?: number
  className?: string
}) {
  const titleId = useId()
  const plot = useRef<HTMLDivElement>(null)
  const observer = useRef<ResizeObserver | null>(null)
  useEffect(() => () => observer.current?.disconnect(), [])
  // 按面板自身宽度绘制，一个单位一像素，宽面板能填满，字号也不缩。
  const [width, setWidth] = useState(480)
  const [hover, setHover] = useState<{ ts: number; left: number; flip: boolean } | null>(null)

  // 回调 ref 只在节点挂载/卸载时变一次：这里用 useCallback 固定引用，避免每次渲染重建观察器。
  const setPlot = useCallback((element: HTMLDivElement | null) => {
    plot.current = element
    observer.current?.disconnect()
    if (!element || typeof ResizeObserver !== 'function') return
    observer.current = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width))
    })
    observer.current.observe(element)
  }, [])

  const points = series.flatMap((s) => s.points)
  const valid = points.filter((p) => p.value !== null)
  if (!valid.length) {
    return (
      <section className={`chart-panel panel${className ? ` ${className}` : ''}`}>
        <h3 id={titleId}>{title}</h3>
        <div className="chart-empty">{points.length ? '此窗口没有成功样本（可能离线或探测失败）' : '暂无历史数据'}</div>
      </section>
    )
  }
  const minTime = Math.min(...points.map((p) => p.ts))
  const maxTime = Math.max(...points.map((p) => p.ts))
  const top = maximum || Math.max(1, ...valid.map((p) => p.value || 0)) * 1.1
  const right = width - RIGHT
  const bottom = height - 27
  const x = (ts: number) => LEFT + ((ts - minTime) / (maxTime - minTime || 1)) * (right - LEFT)
  const y = (value: number | null) => bottom - ((value || 0) / top) * (bottom - TOP)
  const paths = series.map((s) => ({
    ...s,
    segments: chartSegments(s.points, step).map((seg) => ({
      points: seg,
      path: seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(2)},${y(p.value).toFixed(2)}`).join(' '),
    })),
  }))
  const short = (v: number) => `${Number(v.toFixed(1))}${unit}`
  const latest = (s: ChartSeries) => {
    const value = s.points.filter((p) => p.value !== null).at(-1)?.value
    return value == null ? '—' : short(value)
  }
  const clock = (ts: number) =>
    new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const move = (event: ReactMouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect(),
      scale = box.width / width || 1,
      vx = (event.clientX - box.left) / scale
    const point = nearest(valid, minTime + ((vx - LEFT) / (right - LEFT)) * (maxTime - minTime))
    if (!point) {
      setHover(null)
      return
    }
    const left = x(point.ts) * scale
    setHover({ ts: point.ts, left, flip: left > box.width * 0.6 })
  }
  // 悬停时刻的各条曲线；附近没有样本的曲线按缺数据显示。
  const readings = (() => {
    const at = hover?.ts
    if (at === undefined) return []
    return series.map((s) => {
      const p = nearest(s.points, at),
        value = p && Math.abs(p.ts - at) <= step * 1.7 ? p.value : null
      return { name: s.name, color: s.color, value: value === null ? '—' : short(value), y: value === null ? null : y(value) }
    })
  })()

  return (
    <section className={`chart-panel panel${className ? ` ${className}` : ''}`}>
      <h3 id={titleId}>{title}</h3>
      <div ref={setPlot} className="chart-plot">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          style={{ height: `${height}px` }}
          role="img"
          aria-labelledby={titleId}
          onMouseMove={move}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((tick) => (
            <g key={tick}>
              <line
                x1={LEFT}
                x2={right}
                y1={bottom - tick * (bottom - TOP)}
                y2={bottom - tick * (bottom - TOP)}
                stroke="currentColor"
                strokeOpacity=".12"
                strokeDasharray="3 4"
              />
              <text x={0} y={bottom + 3 - tick * (bottom - TOP)}>
                {short(top * tick)}
              </text>
            </g>
          ))}
          {paths.map((item) => (
            <g key={item.name}>
              {item.segments.map((segment, index) => (
                <g key={index}>
                  <path d={segment.path} fill="none" stroke={item.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                  {segment.points.length === 1 && (
                    <circle cx={x(segment.points[0]!.ts)} cy={y(segment.points[0]!.value)} r="2" fill={item.color} />
                  )}
                </g>
              ))}
            </g>
          ))}
          <text x={LEFT} y={height - 3}>
            {clock(minTime)}
          </text>
          <text x={right} y={height - 3} textAnchor="end">
            {clock(maxTime)}
          </text>
          {hover && (
            <g>
              <line x1={x(hover.ts)} x2={x(hover.ts)} y1={TOP - 1} y2={bottom} stroke="currentColor" strokeOpacity=".5" />
              {readings.map((r) =>
                r.y === null ? null : (
                  <circle key={r.name} className="chart-hover-dot" cx={x(hover.ts)} cy={r.y} r="3" fill={r.color} stroke="var(--surface)" strokeWidth="1" />
                ),
              )}
            </g>
          )}
        </svg>
        {hover && (
          <div className={`chart-tip${hover.flip ? ' flip' : ''}`} style={{ left: `${hover.left}px` }} role="status">
            <strong>{clock(hover.ts)}</strong>
            {readings.map((r) => (
              <span key={r.name}>
                <i style={{ background: r.color }} />
                {r.name}
                <b>{r.value}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name} · {latest(s)}
          </span>
        ))}
      </div>
      <details>
        <summary>查看数据与时间</summary>
        <div className="chart-table-wrap">
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>时间</th>
                <th>数值</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap((s) =>
                s.points.map((point, i) => (
                  <tr key={`${s.name}-${i}`}>
                    <td>{s.name}</td>
                    <td>{clock(point.ts)}</td>
                    <td>{point.value === null ? '无数据 / 探测失败' : short(point.value)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
