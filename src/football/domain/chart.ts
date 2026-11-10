export interface ChartPoint {
  ts: number
  value: number | null
}
export interface ChartSeries {
  name: string
  color: string
  points: ChartPoint[]
}
export function chartSegments(points: ChartPoint[], step: number): ChartPoint[][] {
  const segments: ChartPoint[][] = []
  let current: ChartPoint[] = []
  let previous = 0
  for (const p of points) {
    if (p.value === null || !Number.isFinite(p.value) || (previous && p.ts - previous > step * 1.7)) {
      if (current.length) segments.push(current)
      current = []
    }
    if (p.value !== null && Number.isFinite(p.value)) current.push(p)
    previous = p.ts
  }
  if (current.length) segments.push(current)
  return segments
}
