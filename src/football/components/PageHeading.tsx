import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

export interface Crumb {
  label: string
  to?: string
}

export function navigate(to: string) {
  if (window.location.hash === `#${to}`) return
  window.location.hash = to
}

export function Link({
  to,
  className,
  children,
  title,
  ariaLabel,
  dataOnline,
}: {
  to: string
  className?: string
  children: ReactNode
  title?: string
  ariaLabel?: string
  /** 网络质量行按在线状态换样式，用属性而非 class 表达。 */
  dataOnline?: boolean
}) {
  return (
    <a
      href={`#${to}`}
      className={className}
      title={title}
      aria-label={ariaLabel}
      data-online={dataOnline === undefined ? undefined : dataOnline ? 'true' : 'false'}
      onClick={(event) => {
        // 保持 hash 路由语义：不整页跳转，也不往历史里塞重复项。
        if (event.metaKey || event.ctrlKey) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

export function PageHeading({
  crumbs,
  title,
  description,
  children,
  aside,
  tabs,
}: {
  crumbs: Crumb[]
  title: string
  description?: string
  children?: ReactNode
  aside?: ReactNode
  tabs?: ReactNode
}) {
  const head = useRef<HTMLElement>(null)
  const asideRef = useRef<HTMLDivElement>(null)
  // 右下角的装饰（时钟）在最后一枚 tab 会压到它时收起。
  const [asideFits, setAsideFits] = useState(true)
  useEffect(() => {
    if (!aside || typeof ResizeObserver !== 'function') return undefined
    const place = () => {
      const box = head.current?.getBoundingClientRect()
      if (!box) return
      const rights = [...(head.current?.querySelectorAll('.page-tabs button, .page-tabs a') ?? [])].map(
        (el) => el.getBoundingClientRect().right - box.left,
      )
      const width = asideRef.current?.offsetWidth || 220
      setAsideFits(Math.max(0, ...rights) + 24 <= box.width - width)
    }
    const observer = new ResizeObserver(place)
    if (head.current) observer.observe(head.current)
    head.current?.querySelectorAll('.page-tabs').forEach((el) => observer.observe(el))
    place()
    return () => observer.disconnect()
  }, [aside, tabs])

  return (
    <header ref={head} className="page-head">
      <div className="page-head-main">
        <div className="page-head-text">
          <nav className="page-crumbs" aria-label="面包屑">
            {crumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && (
                  <span className="page-crumb-sep" aria-hidden="true">
                    ›
                  </span>
                )}
                {crumb.to ? (
                  <Link to={crumb.to}>{crumb.label}</Link>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {aside && asideFits && (
          <div ref={asideRef} className="page-head-aside">
            {aside}
          </div>
        )}
        {children && <div className="page-head-actions">{children}</div>}
      </div>
      {tabs && <div className="page-tabs">{tabs}</div>}
    </header>
  )
}
