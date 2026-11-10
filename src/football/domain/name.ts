/**
 * 服务器显示名。
 *
 * 妙妙屋 X 各版本把站长填的名字放在不同键上，`show_name=false` 时 use-probe 还会把
 * 真名挪到 real_name 并把 name 换成序号。只认 name 会退化成「服务器 N」，
 * 所以这里按固定优先级回退，最后才用序号兜底。
 */
export interface NameSource {
  real_name?: string
  name?: string
  remark?: string
  alias?: string
  display_name?: string
}

const ORDER: (keyof NameSource)[] = ['real_name', 'name', 'remark', 'alias', 'display_name']

export function nodeName(server: NameSource | null | undefined, id: number): string {
  for (const key of ORDER) {
    const value = server?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return `服务器 ${id}`
}

/**
 * 主控占位名判定。
 *
 * 主控在 show_name=false 时不一定只是抹掉字段，有的版本直接把 name 写成「服务器 N」再下发，
 * 前端此时无法区分「站长真的叫这个名字」和「主控占位」。别名输入框据此提示，
 * 避免站长以为名字没生效。
 */
export function isPlaceholderName(name: string | undefined, id?: number): boolean {
  if (!name) return true
  const text = name.trim()
  if (!text) return true
  const match = /^服务器\s*(\d+)$/.exec(text)
  if (!match) return false
  return id === undefined || Number(match[1]) === id
}

/**
 * 卡面名称档位。卡宽固定、单行 nowrap，字号必须按显示宽度退档。
 * 半角算 1 格、全角与 emoji 算 2 格；可用宽度约 0.88 卡宽，
 * 一格的宽度约 0.5em，于是各档单行上限：
 *   9cqw  → 0.88 / 0.045 ≈ 19 格
 *   7cqw  → 0.88 / 0.035 ≈ 25 格
 *   4.9cqw→ 0.88 / 0.0245 ≈ 36 格（18 个全角字）
 */
export type NameSize = 'lg' | 'xl' | undefined

/** 东亚宽字符（CJK、假名、全角符号）与 emoji 占两格。 */
function wide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

export function nameWidth(name: string): number {
  let width = 0
  for (const char of name) width += wide(char.codePointAt(0) ?? 0) ? 2 : 1
  return width
}

export function nameSize(name: string): NameSize {
  const width = nameWidth(name)
  if (width > 25) return 'xl'
  if (width > 19) return 'lg'
  return undefined
}
