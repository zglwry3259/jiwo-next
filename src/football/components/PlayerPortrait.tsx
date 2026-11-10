import { useId, useState } from 'react'
import { portraitClipRect, portraitPlacement, portraitTransform } from '../domain/portrait'
import { resolvePortrait } from '../domain/portraits'
import type { PortraitConfig } from '../domain/types'

/** 只接受公开 HTTPS 图片地址，避免把内网地址写进公开配置。 */
export function safeImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || host.length > 253 || url.href.length > 2048) return false
    if (!host.includes('.') || host.includes(':') || /(^|\.)(localhost|local|internal|lan|test|invalid)$/.test(host)) return false
    return true
  } catch {
    return false
  }
}

export function PlayerPortrait({
  portrait,
  preview,
  fallback,
}: {
  portrait?: PortraitConfig
  preview?: string
  fallback?: string
}) {
  const clip = useId().replace(/:/g, '')
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // 绑定图片加载失败或不安全时退回该节点的内置立绘。
  const usable = !failed && (preview || (portrait?.url && safeImageUrl(portrait.url)))
  const drawn = resolvePortrait(usable ? portrait : portrait && { ...portrait, url: undefined }, fallback ?? '', usable ? preview : undefined)
  const config = drawn.config

  return (
    <div className={`portrait-layer${config.area === 'upper' ? ' portrait-upper' : ''}`} aria-hidden="true">
      {!config.hidden && (
        <svg className="portrait-canvas" viewBox="-200 -250 1200 1500" preserveAspectRatio="xMidYMid meet">
          <defs>
            <clipPath id={clip}>
              <rect {...portraitClipRect(config)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <image
              className={drawn.kind === 'custom' ? 'custom-portrait' : 'default-portrait'}
              href={drawn.src}
              data-portrait={drawn.kind === 'builtin' ? drawn.id : drawn.kind}
              {...portraitPlacement(config)}
              preserveAspectRatio={`xMidYMid ${config.fit === 'cover' ? 'slice' : 'meet'}`}
              transform={portraitTransform(config)}
              data-loaded={loaded ? 'true' : 'false'}
              onLoad={() => setLoaded(true)}
              onError={() => {
                if (drawn.kind === 'custom') {
                  setFailed(true)
                  setLoaded(false)
                }
              }}
            />
          </g>
        </svg>
      )}
    </div>
  )
}
