import type { CSSProperties } from 'react'
import { levelColor } from '../domain/carriers'
import { SEGMENTS, type Segment } from '../domain/network'

const pad = (n: number) => String(n).padStart(2, '0')
// 超过一小时的切片（7 天、30 天窗口）带上日期。
const stamp = (ts: number, dated: boolean) => {
  const d = new Date(ts * 1000)
  return `${dated ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` : ''}${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function QualityBar({
  segments,
  label,
  loading = true,
  className,
}: {
  segments: Segment[] | null
  label: string
  loading?: boolean
  className?: string
}) {
  const cells = segments
    ? segments.map((s) => {
        const dated = s.to - s.from > 3600,
          span = `${stamp(s.from, dated)}–${stamp(s.to, dated)}`
        return {
          color: s.color,
          title:
            s.latency === null && s.loss === null
              ? `${span} · 无数据`
              : `${span} · 平均 ${s.latency === null ? '—' : `${Math.round(s.latency)} ms`} · 丢包 ${s.loss === null ? '—' : `${s.loss.toFixed(1)}%`}`,
        }
      })
    : Array.from({ length: SEGMENTS }, () => ({ color: levelColor(null), title: undefined as string | undefined }))

  return (
    <span
      className={`quality-bar${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label}
      data-state={!segments && loading ? 'loading' : undefined}
    >
      {cells.map((cell, n) => (
        <i key={n} style={{ background: cell.color, '--i': n } as CSSProperties} title={cell.title} />
      ))}
    </span>
  )
}
