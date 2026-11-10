// 主控（妙妙屋 X）下发的站点级设定 → 主题的有效配置。
// football 自己的 theme.json / localStorage 是站长与访客的偏好，主控的 show_* 是发布方的口径：
// 两边冲突时主控只能「关掉」内容，不能反过来强制打开访客关掉的区块。
import type { ProbePayload } from '../types'
import { parseThemeName } from '../theme-name'
import type { ThemeConfig } from './domain/types'

export interface MasterBranding {
  /** 页头品牌图标；主控没下发时用主题自带的小人 */
  logo?: string
  /** 站点名，页脚与页面标题用 */
  title: string
  /** 主控下发的版权徽标（license_badge），没有就不显示 */
  license: string[]
}

export interface MasterHints {
  /** 主控用 football-light / football-dark 或 appearance.color_mode 指定的明暗 */
  appearance?: 'dark' | 'light' | 'system'
  branding: MasterBranding
  /** 主控关闭了续费时间线 */
  hideBilling: boolean
  /** 主控关闭了流量配额 */
  hideQuota: boolean
  /** 主控关闭了日流量趋势 */
  hideDailyTrend: boolean
  /** 主控关闭了健康分 */
  hideScore: boolean
  /** 主控关闭了地球 */
  hideGlobe: boolean
}

/** license_badge 允许单个对象或数组，字段名两种写法都出现过。 */
function licenseOf(payload?: ProbePayload): string[] {
  const raw = payload?.license_badge
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list
    .map((item) => (item?.display_name || item?.name || '').trim())
    .filter((value): value is string => !!value)
}

/**
 * 明暗优先级：`football-light` / `football-dark` 后缀 > `appearance.color_mode`。
 * 两个都没有时返回 undefined，交给 theme.json 的默认值。
 */
export function masterAppearance(payload?: ProbePayload): 'dark' | 'light' | 'system' | undefined {
  const theme = payload?.appearance?.theme
  if (theme) {
    const parsed = parseThemeName(theme)
    if (parsed.theme === 'football' && parsed.light !== undefined) return parsed.light ? 'light' : 'dark'
  }
  const mode = payload?.appearance?.color_mode
  return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : undefined
}

export function masterHints(payload?: ProbePayload): MasterHints {
  return {
    appearance: masterAppearance(payload),
    branding: {
      // 主控的 logo 可能是站内相对路径（/api/public/...），原样用即可。
      logo: payload?.logo?.trim() || payload?.icon?.trim() || undefined,
      title: payload?.title?.trim() || '妙妙屋 X',
      license: licenseOf(payload),
    },
    hideBilling: payload?.show_renewal_timeline === false,
    hideQuota: payload?.show_traffic_quota === false,
    hideDailyTrend: payload?.show_daily_trend === false,
    hideScore: payload?.show_health_score === false,
    hideGlobe: payload?.show_globe === false,
  }
}

/**
 * 把主控口径压进主题配置：只在主控明确关闭时才改，未下发的字段保持站长设置。
 * 设置页编辑的仍是站长自己的配置，这里返回的是一份临时视图，不写回 localStorage。
 */
export function effectiveTheme(config: ThemeConfig, hints: MasterHints): ThemeConfig {
  return {
    ...config,
    show_billing: config.show_billing && !hints.hideBilling,
    // 配额条看 show_traffic_quota，今日数字看 show_daily_trend，两者独立。
    show_traffic: config.show_traffic && !hints.hideQuota,
    show_daily: config.show_daily && !hints.hideDailyTrend,
    show_score: config.show_score && !hints.hideScore,
  }
}
