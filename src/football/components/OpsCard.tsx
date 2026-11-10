import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { flagUrl } from '../domain/flags'
import { countryName } from '../domain/format'
import type { CountryCard, NodeCard } from '../domain/ops'
import { Link } from './PageHeading'

/** 地球准星旁的卡片：一台节点的细节，或一个国家里所有节点供挑选。 */
export function OpsCard({
  card,
  onClose,
  onNode,
  onCountry,
}: {
  card: { kind: 'node'; data: NodeCard } | { kind: 'country'; data: CountryCard }
  onClose: () => void
  onNode: (id: number) => void
  onCountry: (code: string) => void
}) {
  return (
    <section className="ops-card" data-online={card.kind === 'node' ? (card.data.state === 'ONLINE' ? 'true' : 'false') : undefined} aria-live="polite">
      <button type="button" className="oc-close" aria-label="关闭" onClick={onClose}>
        <X size={14} />
      </button>
      {card.kind === 'node' ? (
        <>
          <p className="oc-kicker">
            <span>{card.data.kicker}</span>
            <span className="oc-state">{card.data.state}</span>
          </p>
          <h3 className="oc-name">{card.data.name}</h3>
          <p className="oc-sub">
            {flagUrl(card.data.code) && <img className="oc-flag" src={flagUrl(card.data.code)} alt="" />}
            {card.data.code ? countryName(card.data.code) : '未设置地区'}
          </p>
          {card.data.tags.length > 0 && (
            <div className="oc-tags">
              {card.data.tags.map((t, i) => (
                <span key={i} className="oc-tag" data-tone={t.tone}>
                  {t.label}
                  <i>{t.value}</i>
                </span>
              ))}
            </div>
          )}
          <div className="oc-metrics">
            {card.data.metrics.map((m) => (
              <div key={m.label} className="oc-metric">
                <span>{m.label}</span>
                <strong>
                  {m.value}
                  <small>{m.unit}</small>
                </strong>
              </div>
            ))}
          </div>
          {card.data.probes.length > 0 && (
            <div className="oc-section">
              <h4>各检测线路延迟</h4>
              {card.data.probes.map((p, i) => (
                <div key={i} className="oc-latency" data-level={p.level}>
                  <span title={p.name}>{p.name}</span>
                  <u>
                    <s style={{ width: `${p.width}%` }} />
                  </u>
                  <em>{p.ms === null ? '—' : `${p.ms} ms`}</em>
                </div>
              ))}
            </div>
          )}
          <div className="oc-actions">
            {card.data.siblings > 1 ? (
              <button type="button" className="oc-link" onClick={() => onCountry(card.data.code)}>
                <ChevronLeft size={14} />
                {countryName(card.data.code)}的全部 {card.data.siblings} 台
              </button>
            ) : (
              <span />
            )}
            <Link to={`/node/${card.data.id}`} className="oc-link">
              打开详情页
              <ChevronRight size={14} />
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="oc-kicker">
            <span>该区域的服务器</span>
          </p>
          <h3 className="oc-name">
            {flagUrl(card.data.code) && <img className="oc-flag" src={flagUrl(card.data.code)} alt="" />}
            {countryName(card.data.code)}
          </h3>
          <p className="oc-sub">
            {card.data.total} 台 · {card.data.ok} 正常 · {card.data.warn} 有异常
            {card.data.off > 0 && ` · ${card.data.off} 离线`}
          </p>
          <div className="oc-list">
            {card.data.rows.map((r) => (
              <button key={r.id} type="button" className="oc-row" data-status={r.status} onClick={() => onNode(r.id)}>
                <i aria-hidden="true" />
                <span>{r.name}</span>
                <em>{r.issue}</em>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
