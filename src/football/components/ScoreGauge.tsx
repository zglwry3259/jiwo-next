const ARC = 'M8 46 A38 38 0 0 1 84 46'

export function ScoreGauge({ value, label }: { value: number | null; label: string }) {
  // 与卡面档位同一组线：75+ 金、65–74 银、以下铜。
  const color = value === null ? null : value >= 75 ? '#4ade80' : value >= 65 ? '#facc15' : '#f87171'
  return (
    <div
      className="score-gauge"
      role="meter"
      aria-valuemin={1}
      aria-valuemax={99}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? '无数据' : undefined}
      aria-label={`${label} 评分`}
    >
      <svg viewBox="0 0 92 52" aria-hidden="true">
        <path className="gauge-track" d={ARC} pathLength={99} />
        {value !== null && (
          <path className="gauge-value-arc" d={ARC} pathLength={99} stroke={color!} strokeDasharray={`${value} 99`} />
        )}
      </svg>
      <strong className="gauge-value">{value ?? '—'}</strong>
      <span className="gauge-label">{label}</span>
    </div>
  )
}
