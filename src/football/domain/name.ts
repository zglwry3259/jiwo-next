/**
 * 服务器显示名。
 *
 * 妙妙屋 X 各版本把站长填的「探针显示名」放在不同键上，实测见过的有
 * name / real_name / remark / alias / display_name，还有的版本另开一个
 * 只有自己认得的键（probe_name、nickname、title…），甚至塞进一层子对象。
 * show_name=false 时 use-probe 还会把真名挪到 real_name 并把 name 换成序号。
 *
 * 所以这里不押单一键：
 *   1) 先按已知键的顺序取（real_name 优先，它装着 show_name=false 时的真名）；
 *   2) 再扫一遍对象的全部字段，凡是「名字类」键（含 name / remark / alias /
 *      label / title / nick / note / memo / comment / tag / host）都当候选，
 *      最多看两层嵌套；地域、运营商、系统、CPU 这类技术键排除，避免把
 *      「香港」「Akile」「Debian 12」当成站长的名字；
 *   3) 候选里跳过「服务器 N」这种占位值；
 *   4) 全都没有才用序号兜底。
 */
/** 任意主控下发的服务器对象。用 object 而不是 Record，接口类型才能直接传进来。 */
export type NameSource = object

/** 已知键的优先顺序。real_name 放第一：它是 show_name=false 时的真名落点。 */
const EXPLICIT = [
  'real_name',
  'probe_name',
  'probe_display_name',
  'display_name',
  'server_name',
  'nickname',
  'remark',
  'alias',
  'title',
  'label',
  'name',
  'note',
  'memo',
  'comment',
  'hostname',
] as const

/** 键名里带这些词就当名字候选。 */
const NAME_KEY = /name|remark|alias|label|title|nick|host|note|memo|comment/i

/**
 * 技术键：键名里出现这些「词」的一律不当名字。
 * 必须按词判而不是按子串：display_name 里含 "isp"，按子串判会把显示名自己挡掉。
 */
const TECH_WORDS = new Set([
  'region', 'country', 'city', 'area', 'group', 'provider', 'isp', 'asn', 'license',
  'theme', 'template', 'source', 'mode', 'type', 'unit', 'currency', 'kernel', 'arch',
  'os', 'cpu', 'disk', 'mem', 'swap', 'net', 'traffic', 'bucket', 'device', 'vendor',
  'model', 'version', 'status', 'state', 'code', 'id',
])

function words(key: string): string[] {
  // 驼峰先拆开（displayName → display name），再按非字母数字切，全部小写。
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function isTechKey(key: string): boolean {
  return words(key).some((word) => TECH_WORDS.has(word))
}

/** 一层取值：字符串直接返回，数字不认（名字不会是数字）。 */
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

interface Candidate {
  key: string
  value: string
}

/**
 * 扫描对象里的名字候选，输出顺序固定：先显式键（按 EXPLICIT 顺序），
 * 再其它名字类键（按对象自身字段顺序）。同名键取第一次出现的值。
 */
export function nameCandidates(server: NameSource | null | undefined): Candidate[] {
  if (!server || typeof server !== 'object') return []
  const explicit: Candidate[] = []
  const generic: Candidate[] = []
  const seen = new Set<string>()

  const walk = (source: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [rawKey, value] of Object.entries(source)) {
      if (!rawKey || isTechKey(rawKey)) continue
      const path = prefix ? `${prefix}.${rawKey}` : rawKey
      if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
        walk(value as Record<string, unknown>, path, depth + 1)
        continue
      }
      const text = asText(value)
      if (!text) continue
      if (seen.has(path)) continue
      seen.add(path)
      // 键名大小写不敏感：有的主控写 DisplayName / RealName
      const rank = EXPLICIT.indexOf(rawKey.toLowerCase() as (typeof EXPLICIT)[number])
      if (rank >= 0) explicit.push({ key: path, value: text })
      else if (NAME_KEY.test(rawKey)) generic.push({ key: path, value: text })
    }
  }

  walk(server as Record<string, unknown>, '', 0)
  const rankOf = (key: string) => {
    const leaf = (key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key).toLowerCase()
    const index = EXPLICIT.indexOf(leaf as (typeof EXPLICIT)[number])
    return index < 0 ? EXPLICIT.length : index
  }
  // 显式键按优先级排；同优先级（比如嵌套层里的 name）保持字段顺序。
  explicit.sort((a, b) => rankOf(a.key) - rankOf(b.key))
  return [...explicit, ...generic]
}

export function nodeName(server: NameSource | null | undefined, id: number): string {
  const candidates = nameCandidates(server)
  for (const candidate of candidates) {
    if (!isPlaceholderName(candidate.value, id)) return candidate.value
  }
  // 只有占位名时返回主控给的那个占位值（比另造一个更贴近主控），否则自己造。
  const placeholder = candidates.find((candidate) => isPlaceholderName(candidate.value, id))
  return placeholder?.value ?? `服务器 ${id}`
}

/** 卡面实际用了哪个键，设置页诊断用。 */
export function nameSourceKey(server: NameSource | null | undefined, id: number): string | null {
  const candidates = nameCandidates(server)
  const hit = candidates.find((candidate) => !isPlaceholderName(candidate.value, id))
  return hit?.key ?? null
}

/**
 * 设置页诊断：把主控真的发过来的名字类字段原样列出来。
 * 站长截图这一行就能看出主控把显示名塞在哪个键上。
 */
export function nameFields(server: NameSource | null | undefined, limit = 10): Candidate[] {
  return nameCandidates(server)
    .slice(0, limit)
    .map((candidate) => ({
      key: candidate.key,
      value: candidate.value.length > 40 ? `${candidate.value.slice(0, 40)}…` : candidate.value,
    }))
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
