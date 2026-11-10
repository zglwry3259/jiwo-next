import { useEffect, useState } from 'react'

/**
 * 一条最近数值的折线。绘制宽度比框宽一步，静止时左移这一步，最新点就贴在右边缘；
 * 新点到达时先不偏移重绘、再滑过去，看起来就是线在滚动。关掉动效时直接停在偏移后的位置。
 */
export function Sparkline({ values, color, fill = true, className }: { values: number[]; color: string; fill?: boolean; className?: string }) {
  const [version, setVersion] = useState(0)
  useEffect(() => setVersion((v) => v + 1), [values.join()])

  const shape = (() => {
    if (values.length < 3) return null
    const max = Math.max(...values),
      min = Math.min(...values),
      span = max - min || 1,
      steps = values.length - 1
    const points = values.map((y, i) => `${((i / steps) * 100).toFixed(2)},${(92 - ((y - min) / span) * 80).toFixed(2)}`).join(' ')
    return {
      points,
      area: `0,100 ${points} 100,100`,
      width: `${(steps / (steps - 1)) * 100}%`,
      step: `${-100 / steps}%`,
    }
  })()

  return (
    <span className={`sparkline${className ? ` ${className}` : ''}`} aria-hidden="true">
      {shape && (
        <svg key={version} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: shape.width, '--spark-step': shape.step } as React.CSSProperties}>
          {fill && <polygon points={shape.area} fill={color} opacity="0.14" />}
          <polyline points={shape.points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </span>
  )
}
