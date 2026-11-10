/**
 * 国旗：复用 jiwo-probe 自带的 twemoji 本地资源（public/twemoji/svg），不引入外部依赖。
 * 文件名规则：两个区域指示符的码位十六进制小写，用 - 连接，例如 HK -> 1f1ed-1f1f0。
 */
export function flagUrl(code: string): string | undefined {
  const id = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(id) || id === 'XX') return undefined
  const points = [...id].map((c) => (127397 + c.charCodeAt(0)).toString(16))
  return `/twemoji/svg/${points.join('-')}.svg`
}

/** 无图片时的文本兜底，与主题其它地方的省略符号一致。 */
export const flag = (code: string) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : '◎'
