import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { lineSkills } from '../domain/carriers'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import { nameSize } from '../domain/name'
import { cardPortraitBox } from '../domain/portrait'
import { autoPortrait } from '../domain/portraits'
import { osBadge, providerOf, type BrandIcon } from '../domain/providers'
import { STAT_KEYS, STAT_LABELS, statReadings, type NodeScore, type Tier } from '../domain/score'
import { nodeTemplate, resolveSkin } from '../domain/skins'
import type { MonitorNode, TemplateId, ThemeConfig } from '../domain/types'
import { PlayerPortrait } from './PlayerPortrait'

interface Crest {
  kind: 'flag' | 'provider' | 'os'
  title: string
  image?: string
  icon?: BrandIcon
  text?: string
}

export function PlayerCard({
  node,
  config,
  score,
  tier,
  size = 'sm',
  interactive = true,
  portraitPreview,
  templateOverride,
}: {
  node: MonitorNode
  config: ThemeConfig
  score: NodeScore
  tier: Tier
  size?: 'sm' | 'lg'
  interactive?: boolean
  portraitPreview?: string
  templateOverride?: TemplateId
}) {
  const settings = config.nodes[String(node.id)]
  const skin = resolveSkin(templateOverride ?? nodeTemplate(config, node.id), tier)
  const rating = !node.online ? 'OFF' : score.overall === null ? '—' : String(score.overall)
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  // 在线卡还在等第一个评分时数字像计数器一样滚动，拿到后停在它上面；已知评分与后续变化直接显示。
  const [phase, setPhase] = useState<'spin' | 'stop' | null>(rating === '—' ? 'spin' : null)
  const previous = useRef(rating)
  useEffect(() => {
    if (previous.current === rating) return
    previous.current = rating
    setPhase((now) => (now === 'spin' ? (/^\d+$/.test(rating) ? 'stop' : rating === '—' ? 'spin' : null) : now))
  }, [rating])
  // 评分永远拿不到时（主控没下发探测桶）不能一直转：转够 4 秒就停住显示「—」。
  useEffect(() => {
    if (phase !== 'spin') return undefined
    const timer = window.setTimeout(() => setPhase('stop'), 4000)
    return () => window.clearTimeout(timer)
  }, [phase])
  const rolling = config.motion && !reduced ? phase : null
  const digits = rolling === 'spin' ? ['0', '0'] : [...rating]

  // 卡宽固定且名称单行 nowrap，字号必须按实际渲染宽度收敛：
  // 半角字符宽度差异很大（W/M 与 i/l 差一倍），只按字数估算会把 "JP-Tokyo-Premium" 也截掉。
  // 从 9cqw 往下逐档试，第一个不溢出的档位即定值；卡宽变化时重算。
  const nameRef = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const el = nameRef.current
    if (!el) return undefined
    const fit = () => {
      el.style.fontSize = ''
      for (const cqw of [9, 7.6, 6.4, 5.4, 4.6, 4]) {
        el.style.fontSize = `${cqw}cqw`
        if (el.scrollWidth <= el.clientWidth + 1) return
      }
    }
    fit()
    if (typeof ResizeObserver !== 'function') return undefined
    // 观察卡片本身而不是标题：改字号会改变标题盒尺寸，观察它自己会自我触发循环。
    const box = el.parentElement
    if (!box) return undefined
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [node.name])
  const readings = statReadings(node, score)
  const stats = STAT_KEYS.map((key) => ({ key, label: STAT_LABELS[key], ...readings[key] }))
  const skills = lineSkills(settings)

  // FC 的国家 / 联赛 / 俱乐部一行，换成国旗、VPS 服务商与操作系统。
  const crests: Crest[] = []
  const code = node.country
  const provider = settings?.provider
  const os = osBadge(node.os)
  if (code) crests.push({ kind: 'flag', title: countryName(code), image: flagUrl(code), text: code.toUpperCase() })
  if (provider?.id === 'custom') {
    crests.push({ kind: 'provider', title: provider.name || '自定义服务商', image: provider.logo, text: provider.name })
  } else {
    const known = providerOf(provider?.id)
    if (known) crests.push({ kind: 'provider', title: known.name, image: known.image, icon: known.icon, text: known.short })
  }
  if (os) crests.push({ kind: 'os', title: os.name, icon: os.icon, text: os.short })

  const { inset, ratingTop, portraitTop, nameTop } = skin.layout
  const box = cardPortraitBox({ inset, portraitTop })
  const style = {
    '--ink': skin.ink,
    '--chip-bg': skin.chip[0],
    '--chip-fg': skin.chip[1],
    '--ink-shadow': skin.shadow ?? 'none',
    '--inset': `${inset}%`,
    '--rating-top': `${ratingTop}%`,
    '--art-top': `${skin.frame.top + 2}%`,
    '--portrait-left': `${box.left}%`,
    '--portrait-top': `${box.top}%`,
    '--portrait-width': `${box.width}%`,
    '--portrait-height': `${box.height}%`,
    '--name-top': `${nameTop}%`,
  } as CSSProperties

  return (
    <article
      className={`player-card${node.online ? '' : ' card-offline'}${interactive ? ' card-interactive' : ''}`}
      data-skin={skin.id}
      data-tone={skin.tone}
      data-badge={skin.badge}
      data-size={size}
      style={style}
      aria-label={`${node.name} ${node.online ? '在线' : '离线'} 综合 ${score.overall ?? '无数据'}`}
    >
      <img className="pc-face" src={skin.image} alt="" loading="lazy" decoding="async" draggable={false} />
      <div className="pc-art">
        <div className="pc-portrait">
          <PlayerPortrait portrait={settings?.portrait} preview={portraitPreview} fallback={autoPortrait(node.id)} />
        </div>
      </div>
      <div className="pc-text">
        <div className="pc-meta">
          <span className={`pc-rating${rolling ? ' pc-rating-roll' : ''}`}>
            {rolling ? (
              <>
                <span className="sr-only">{rating}</span>
                <span className="pc-roll" data-phase={rolling} aria-hidden="true">
                  {digits.map((digit, i) => (
                    <span className="pc-roll-digit" key={i} style={{ '--d': digit, '--n': i } as CSSProperties}>
                      <span
                        className="pc-roll-strip"
                        onAnimationEnd={() => {
                          if (rolling === 'stop' && i === digits.length - 1) setPhase(null)
                        }}
                      >
                        {Array.from({ length: 20 }, (_, k) => (
                          <span key={k}>{k % 10}</span>
                        ))}
                      </span>
                    </span>
                  ))}
                </span>
              </>
            ) : (
              rating
            )}
          </span>
          <span className="pc-position">{node.country || '—'}</span>
        </div>
        {skills.length > 0 && (
          <ul className="pc-skills" aria-label="线路">
            {skills.map((skill) => (
              <li
                key={skill.line}
                className="pc-skill"
                data-carrier={skill.carrier}
                title={`${skill.name} · ${skill.line}`}
                style={{ '--carrier': skill.color } as CSSProperties}
              >
                {skill.line}
              </li>
            ))}
          </ul>
        )}
        <div className="pc-chips">{!node.online && <span className="pc-offline-tag">离线</span>}</div>
        {/* 首帧用宽度档位兜底，挂载后由上面的测量逻辑收敛到实际放得下的字号。 */}
        <h2 ref={nameRef} className="pc-name" data-long={nameSize(node.name)} title={node.name}>
          {node.name}
        </h2>
        <dl className="pc-stats">
          {stats.map((stat) => (
            <div key={stat.key} className="pc-stat">
              <dt className="pc-stat-label">{stat.label}</dt>
              <dd
                className="pc-stat-value"
                data-grade={stat.grade ?? undefined}
                data-long={stat.value.length > 2 ? 'true' : undefined}
              >
                {stat.value}
                {stat.unit && <span className="pc-stat-unit">{stat.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {crests.length > 0 && (
          <div className="pc-crests">
            {crests.map((crest) => (
              <span key={crest.kind} className="pc-crest" data-kind={crest.kind} title={crest.title}>
                {crest.image ? (
                  <img src={crest.image} alt="" draggable={false} />
                ) : crest.icon ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={crest.icon.path} fill={`#${crest.icon.hex}`} />
                  </svg>
                ) : (
                  <span className="pc-crest-text">{crest.text}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
