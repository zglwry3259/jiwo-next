import argentina from '../assets/portraits/argentina.webp'
import arsenal from '../assets/portraits/arsenal.webp'
import brazil from '../assets/portraits/brazil.webp'
import city from '../assets/portraits/city.webp'
import portugal from '../assets/portraits/portugal.webp'
import { DEFAULT_PORTRAIT } from './portrait'
import type { PortraitConfig } from './types'

type Preset = Pick<PortraitConfig, 'scale' | 'x' | 'y'>
// 全身立绘当作半身用：头部落在框顶下方，躯干填满画面，整体略向右偏，让举起的手臂避开评分数字。
const entries: { id: string; label: string; src: string; preset: Preset }[] = [
  { id: 'arsenal', label: '红白跪地', src: arsenal, preset: { scale: 2.2, x: 8, y: 52 } },
  { id: 'brazil', label: '黄衫庆祝', src: brazil, preset: { scale: 2.3, x: 6, y: 52 } },
  { id: 'argentina', label: '蓝白握拳', src: argentina, preset: { scale: 2.2, x: 14, y: 52 } },
  { id: 'city', label: '天蓝怒吼', src: city, preset: { scale: 1.45, x: 6, y: 18 } },
  { id: 'portugal', label: '红衫跃起', src: portugal, preset: { scale: 2.3, x: 0, y: 55 } },
]
const replaced: Record<string, string> = { france: 'city' }
export const replacementPortrait = (id: unknown) =>
  typeof id === 'string' ? builtinPortraits.find((p) => p.id === replaced[id]) : undefined
export const builtinPortraits = entries
export const NEUTRAL_PORTRAIT = 'neutral'
export const NEUTRAL_SRC = '/football/athlete.svg'
export const isBuiltinPortrait = (id: unknown): id is string =>
  id === NEUTRAL_PORTRAIT || builtinPortraits.some((p) => p.id === id)

/** 没设立绘的节点按 id 轮流用内置立绘。 */
export const autoPortrait = (nodeId: number) =>
  builtinPortraits[(((nodeId - 1) % builtinPortraits.length) + builtinPortraits.length) % builtinPortraits.length]!.id

export type ResolvedPortrait =
  | { kind: 'custom'; src: string; config: PortraitConfig }
  | { kind: 'builtin'; id: string; src: string; config: PortraitConfig }
  | { kind: 'neutral'; src: string; config: PortraitConfig }
/**
 * 卡面实际画什么：本地预览 → 绑定的图片 → 选定的内置立绘（带站长裁切参数），
 * 都没有时用自动分配的那张。
 */
export function resolvePortrait(
  portrait: PortraitConfig | undefined,
  fallback: string,
  preview?: string,
): ResolvedPortrait {
  const config = portrait ?? DEFAULT_PORTRAIT
  if (preview) return { kind: 'custom', src: preview, config }
  if (portrait?.url) return { kind: 'custom', src: portrait.url, config }
  if (portrait?.builtin === NEUTRAL_PORTRAIT) return { kind: 'neutral', src: NEUTRAL_SRC, config }
  const chosen = builtinPortraits.find((p) => p.id === portrait?.builtin)
  if (chosen) return { kind: 'builtin', id: chosen.id, src: chosen.src, config }
  const auto = builtinPortraits.find((p) => p.id === fallback)
  if (!auto) return { kind: 'neutral', src: NEUTRAL_SRC, config }
  return {
    kind: 'builtin',
    id: auto.id,
    src: auto.src,
    config: { ...config, ...auto.preset, box: undefined, fit: 'contain' },
  }
}
