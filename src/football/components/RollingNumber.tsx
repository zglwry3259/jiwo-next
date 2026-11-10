import { useEffect, useRef, useState } from 'react'

/** 缓动到新值的数字；关掉动效时立刻显示新值。 */
export function RollingNumber({ value, digits = 0 }: { value: number | null; digits?: number }) {
  const [shown, setShown] = useState<number | null>(value)
  const frame = useRef(0)
  const prev = useRef<number | null>(value)

  useEffect(() => {
    const still =
      document.documentElement.dataset.motion === 'false' || matchMedia('(prefers-reduced-motion: reduce)').matches
    cancelAnimationFrame(frame.current)
    const from = prev.current
    prev.current = value
    if (value === null || from === null || still) {
      setShown(value)
      return undefined
    }
    const start = performance.now(),
      begin = shown ?? from
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 900)
      setShown(begin + (value - begin) * (1 - (1 - k) ** 3))
      if (k < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className="rolling-number">{shown === null ? '—' : shown.toFixed(digits)}</span>
}
