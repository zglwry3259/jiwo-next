// 主题内部的小 hook：把主控的运行期设置（站点级）接进组件，避免每个组件各自读 localStorage。
import { useCallback } from 'react'
import { useProbe } from '../use-probe'
import { speed } from './domain/format'

/**
 * 速率格式化：跟随主控下发的站点单位（bit / byte）。
 * 返回的函数只依赖单位，主控改设置时会重新生成，组件里的 useMemo 能跟着更新。
 */
export function useSpeed() {
  const { networkSpeedUnit } = useProbe()
  return useCallback((value: number | null | undefined) => speed(value, networkSpeedUnit), [networkSpeedUnit])
}
