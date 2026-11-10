import bronze from '../assets/cards/bronze.webp'
import emerald from '../assets/cards/emerald.webp'
import frames from '../assets/cards/frames.json'
import galaxy from '../assets/cards/galaxy.webp'
import glitch from '../assets/cards/glitch.webp'
import gold from '../assets/cards/gold.webp'
import lapis from '../assets/cards/lapis.webp'
import legend from '../assets/cards/legend.webp'
import neonCity from '../assets/cards/neon-city.webp'
import neon from '../assets/cards/neon.webp'
import pioneer from '../assets/cards/pioneer.webp'
import prism from '../assets/cards/prism.webp'
import shatter from '../assets/cards/shatter.webp'
import silver from '../assets/cards/silver.webp'
import splash from '../assets/cards/splash.webp'
import totyOrbit from '../assets/cards/toty-orbit.webp'
import totyXi from '../assets/cards/toty-xi.webp'
import weeklyBlack from '../assets/cards/weekly-black.webp'
import type { Tier } from './score'
import type { SkinId, TemplateId, ThemeConfig } from './types'

export interface Skin {
  id: SkinId
  name: string
  image: string
  kind: 'tier' | 'special'
  /** 深色卡面用亮色评级文字；线路徽章跟随 `badge`。 */
  tone: 'light' | 'dark'
  badge?: 'gold' | 'pioneer' | 'green'
  /** 卡面主文字色。 */
  ink: string
  /** 分组角标：[背景, 前景]。 */
  chip: [string, string]
  shadow?: string
  /** 640x860 画布内不透明的框体位置（百分比），可能包含两侧装饰碎片。 */
  frame: { left: number; right: number; top: number; bottom: number }
  layout: { inset: number; ratingTop: number; portraitTop: number; nameTop: number }
}

export const skins: Skin[] = [
  {
    id: 'gold',
    name: '金卡',
    image: gold,
    tone: 'light',
    kind: 'tier',
    ink: '#3b2a08',
    chip: ['#3b2a08', '#f6dc7a'],
    frame: frames.gold,
    layout: { inset: 13, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'silver',
    name: '银卡',
    image: silver,
    tone: 'light',
    kind: 'tier',
    ink: '#1f2630',
    chip: ['#1f2630', '#e9edf2'],
    frame: frames.silver,
    layout: { inset: 13, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'bronze',
    name: '铜卡',
    image: bronze,
    tone: 'light',
    kind: 'tier',
    ink: '#2a1408',
    chip: ['#2a1408', '#f1c39b'],
    frame: frames.bronze,
    layout: { inset: 13, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'weekly-black',
    name: '周黑',
    image: weeklyBlack,
    tone: 'dark',
    badge: 'gold',
    kind: 'special',
    ink: '#f6d77d',
    chip: ['#f6d77d', '#141414'],
    shadow: '0 1px 2px rgba(0,0,0,.7)',
    frame: frames['weekly-black'],
    layout: { inset: 12, ratingTop: 17, portraitTop: 15, nameTop: 62 },
  },
  {
    id: 'pioneer',
    name: '开拓者',
    image: pioneer,
    tone: 'dark',
    badge: 'pioneer',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#d0142a', '#ffffff'],
    shadow: '0 1px 3px rgba(40,0,60,.9)',
    frame: frames.pioneer,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'legend',
    name: '传奇',
    image: legend,
    tone: 'light',
    kind: 'special',
    ink: '#5a3e0c',
    chip: ['#d4a017', '#2a1d04'],
    frame: frames.legend,
    layout: { inset: 12, ratingTop: 18, portraitTop: 17, nameTop: 63 },
  },
  {
    id: 'galaxy',
    name: '星河',
    image: galaxy,
    tone: 'dark',
    badge: 'gold',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#f0abfc', '#2a0a3a'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.galaxy,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'shatter',
    name: '碎焰',
    image: shatter,
    tone: 'dark',
    badge: 'gold',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#facc15', '#1a1d4a'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.shatter,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'toty-xi',
    name: '年度最佳',
    image: totyXi,
    tone: 'dark',
    badge: 'gold',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#e8c768', '#0b1a5c'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames['toty-xi'],
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'neon',
    name: '霓虹',
    image: neon,
    tone: 'dark',
    badge: 'pioneer',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#c4b5fd', '#1e1240'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.neon,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'splash',
    name: '幻彩',
    image: splash,
    tone: 'dark',
    badge: 'pioneer',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#4ade80', '#2a0a2a'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.splash,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'lapis',
    name: '青金',
    image: lapis,
    tone: 'dark',
    badge: 'gold',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#e8c768', '#0b1a5c'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.lapis,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'neon-city',
    name: '霓虹城',
    image: neonCity,
    tone: 'dark',
    badge: 'pioneer',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#67e8f9', '#1a1040'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames['neon-city'],
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'emerald',
    name: '翡翠',
    image: emerald,
    tone: 'dark',
    badge: 'green',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#6ee7b7', '#06281c'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.emerald,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'toty-orbit',
    name: '星环',
    image: totyOrbit,
    tone: 'dark',
    badge: 'gold',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#e8c768', '#0b1a5c'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames['toty-orbit'],
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'prism',
    name: '棱镜',
    image: prism,
    tone: 'dark',
    badge: 'pioneer',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#a5b4fc', '#140c36'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.prism,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
  {
    id: 'glitch',
    name: '故障',
    image: glitch,
    tone: 'dark',
    badge: 'green',
    kind: 'special',
    ink: '#ffffff',
    chip: ['#5eead4', '#04201c'],
    shadow: '0 1px 3px rgba(0,0,0,.85)',
    frame: frames.glitch,
    layout: { inset: 12, ratingTop: 17, portraitTop: 16, nameTop: 62 },
  },
]

const byId = new Map<string, Skin>(skins.map((s) => [s.id, s]))

export const isTemplate = (id: unknown): id is TemplateId =>
  id === 'auto' || (typeof id === 'string' && byId.has(id))
export const skinOf = (id: SkinId): Skin => byId.get(id)!
export const resolveSkin = (template: TemplateId, tier: Tier): Skin => skinOf(template === 'auto' ? tier : template)

export function nodeTemplate(config: ThemeConfig, nodeId: number): TemplateId {
  return config.nodes[String(nodeId)]?.template ?? config.default_template
}

/** V1 模板 id 的兼容映射（节点 / 全局两个作用域）。 */
const LEGACY: Record<string, [TemplateId, TemplateId]> = {
  'classic-gold': ['gold', 'auto'],
  'black-elite': ['weekly-black', 'weekly-black'],
  'white-icon': ['legend', 'legend'],
  'blue-europe': ['auto', 'auto'],
  'minimal-carbon': ['auto', 'auto'],
}

export function migrateTemplate(value: unknown, scope: 'global' | 'node'): TemplateId | undefined {
  if (isTemplate(value)) return value
  if (typeof value === 'string' && Object.hasOwn(LEGACY, value)) return LEGACY[value]![scope === 'node' ? 0 : 1]
  return undefined
}
