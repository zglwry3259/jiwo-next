import { useMemo, useState } from 'react'
import { providers } from '../domain/providers'
import { carriers, lines } from '../domain/carriers'
import { isPlaceholderName } from '../domain/name'
import { emptyScore, nextTier } from '../domain/score'
import { nodeTemplate, skins } from '../domain/skins'
import type { CarrierId, GlobalConfig, MonitorNode, NodeConfig, PortraitConfig, ThemeConfig } from '../domain/types'
import { PageHeading } from '../components/PageHeading'
import { PlayerCard } from '../components/PlayerCard'
import { PortraitEditor } from '../components/PortraitEditor'
import { buildTheme, clearLocalConfig, DEFAULT_GLOBAL, readLocalConfig, writeLocalConfig, type FootballConfigFile } from '../model'

const TEMPLATES = [{ value: 'auto', label: '自动（按评分）' }, ...skins.map((s) => ({ value: s.id, label: s.name }))]

export function Settings({
  config,
  nodes,
  onChange,
  focusNode,
}: {
  config: ThemeConfig
  nodes: MonitorNode[]
  onChange: (next: ThemeConfig) => void
  focusNode?: number
}) {
  const [draft, setDraft] = useState<ThemeConfig>(config)
  const [editing, setEditing] = useState<number | null>(focusNode ?? null)
  const [portraitFor, setPortraitFor] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

  const nodeConfig = (id: number): NodeConfig => draft.nodes[String(id)] ?? {}
  const patchGlobal = <K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K]) => setDraft((prev) => ({ ...prev, [key]: value }))
  const patchNode = (id: number, patch: Partial<NodeConfig>) =>
    setDraft((prev) => ({ ...prev, nodes: { ...prev.nodes, [String(id)]: { ...(prev.nodes[String(id)] ?? {}), ...patch } } }))

  const preview = useMemo(() => nodes.find((n) => n.id === editing) ?? nodes[0], [nodes, editing])
  const previewScore = emptyScore()

  const save = () => {
    const file: FootballConfigFile = {
      version: 1,
      global: Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'nodes')) as Partial<GlobalConfig>,
      nodes: draft.nodes,
    }
    writeLocalConfig(file)
    onChange(draft)
    setNotice('已保存到本机浏览器')
    window.setTimeout(() => setNotice(''), 2400)
  }
  const reset = () => {
    clearLocalConfig()
    const next = buildTheme(undefined, undefined)
    setDraft(next)
    onChange(next)
    setNotice('已恢复默认设置')
    window.setTimeout(() => setNotice(''), 2400)
  }
  const exportJson = () => {
    const file: FootballConfigFile = {
      version: 1,
      global: Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'nodes')) as Partial<GlobalConfig>,
      nodes: draft.nodes,
    }
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'football-theme.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as FootballConfigFile
      const next = buildTheme(parsed, readLocalConfig())
      setDraft(next)
      onChange(next)
      writeLocalConfig(parsed)
      setNotice(`已导入 ${file.name}`)
      window.setTimeout(() => setNotice(''), 2400)
    } catch {
      setNotice('导入失败：不是合法的主题 JSON')
    }
  }

  const counts = Object.keys(draft.nodes).length
  const isDefault = JSON.stringify(draft) === JSON.stringify({ ...DEFAULT_GLOBAL, nodes: {} })

  return (
    <>
      <PageHeading
        crumbs={[{ label: 'Football Monitor', to: '/' }, { label: '主题设置' }]}
        title="主题设置"
        description="设置保存在本机浏览器；也可以导出 JSON 放进 public/football/theme.json 成为全站默认。"
      >
        {notice && <span className="sync-note">{notice}</span>}
        <button type="button" className="fb-btn fb-btn-outline" onClick={reset} disabled={isDefault}>
          恢复默认
        </button>
        <button type="button" className="fb-btn fb-btn-outline" onClick={exportJson}>
          导出 JSON
        </button>
        <label className="fb-btn fb-btn-outline">
          导入 JSON
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importJson(file)
              event.target.value = ''
            }}
          />
        </label>
        <button type="button" className="fb-btn fb-btn-primary" onClick={save}>
          保存设置
        </button>
      </PageHeading>

      <div className="fb-settings">
        <section className="fb-settings-block panel">
          <h2>球星卡与外观</h2>
          <div className="fb-field-grid">
            <label className="fb-text">
              默认卡面
              <select value={draft.default_template} onChange={(event) => patchGlobal('default_template', event.target.value as GlobalConfig['default_template'])}>
                {TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fb-text">
              卡片布局
              <select value={draft.layout} onChange={(event) => patchGlobal('layout', event.target.value as GlobalConfig['layout'])}>
                <option value="comfortable">标准（每行 7 张）</option>
                <option value="compact">紧凑（每行 8 张）</option>
              </select>
            </label>
            <label className="fb-text">
              首页形式
              <select value={draft.card_view} onChange={(event) => patchGlobal('card_view', event.target.value as GlobalConfig['card_view'])}>
                <option value="stacked">上下（卡面 + 卡下数据）</option>
                <option value="split">左右（卡面 + 右侧数据面板）</option>
              </select>
            </label>
            <label className="fb-text">
              卡片尺寸
              <select value={draft.card_size} onChange={(event) => patchGlobal('card_size', event.target.value as GlobalConfig['card_size'])}>
                <option value="standard">标准</option>
                <option value="large">大卡（每行 6 张）</option>
              </select>
            </label>
            <label className="fb-text">
              外观
              <select value={draft.appearance} onChange={(event) => patchGlobal('appearance', event.target.value as GlobalConfig['appearance'])}>
                <option value="dark">深色</option>
                <option value="light">浅色</option>
                <option value="system">跟随系统</option>
              </select>
            </label>
            <label className="fb-text">
              汇率（折合人民币）
              <input value={draft.exchange_rates} onChange={(event) => patchGlobal('exchange_rates', event.target.value)} />
            </label>
          </div>
          <div className="fb-checks">
            {(
              [
                ['motion', '启用轻量动效'],
                ['show_summary', '显示汇总'],
                ['show_traffic', '显示流量'],
                ['show_billing', '显示费用'],
                ['show_daily', '显示今日流量'],
                ['show_score', '显示评分汇总'],
                ['show_carriers', '显示三网'],
                ['show_clock', '显示时钟'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="fb-check">
                <input type="checkbox" checked={draft[key]} onChange={(event) => patchGlobal(key, event.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section className="fb-settings-block panel">
          <h2>
            节点 <small>{counts} 台有自定义设置</small>
          </h2>
          <div className="fb-node-list">
            {nodes.map((node) => {
              const open = editing === node.id
              const conf = nodeConfig(node.id)
              const template = nodeTemplate(draft, node.id)
              return (
                <div key={node.id} className="fb-node-row" data-open={open || undefined}>
                  <button type="button" className="fb-node-head" onClick={() => setEditing(open ? null : node.id)}>
                    <b>{conf.alias?.trim() || node.name}</b>
                    <small>{template === 'auto' ? '卡面自动' : skins.find((s) => s.id === template)?.name}</small>
                    <em>{node.online ? '在线' : '离线'}</em>
                  </button>
                  {open && (
                    <div className="fb-node-body">
                      <div className="fb-alias">
                        <label className="fb-text">
                          显示名
                          <input
                            value={conf.alias ?? ''}
                            placeholder={node.name}
                            maxLength={48}
                            onChange={(event) => patchNode(node.id, { alias: event.target.value || undefined })}
                          />
                        </label>
                        <p className="fb-quiet">
                          主控下发：
                          {node.name_key ? `「${node.name}」` : node.master_name ? `「${node.master_name}」` : '未下发名称字段'}
                          {node.name_key && (
                            <>
                              （取自 <code>{node.name_key}</code> 字段）
                            </>
                          )}
                          {!node.name_key &&
                            isPlaceholderName(node.master_name, node.id) &&
                            ' —— 这是序号占位名，主控没有把真实名称发给探针（主控关掉「显示服务器名称」时会这样）。在这里填一个，卡面就用它。'}
                        </p>
                        {Boolean(node.master_fields?.length) && (
                          <p className="fb-quiet fb-fields">
                            主控字段：
                            {node.master_fields?.map((field) => (
                              <code key={field.key}>
                                {field.key}={field.value}
                              </code>
                            ))}
                          </p>
                        )}
                      </div>
                      <label className="fb-text">
                        卡面
                        <select
                          value={conf.template ?? 'auto'}
                          onChange={(event) => patchNode(node.id, { template: event.target.value as NodeConfig['template'] })}
                        >
                          {TEMPLATES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="fb-text">
                        服务商
                        <select
                          value={conf.provider?.id ?? ''}
                          onChange={(event) =>
                            patchNode(node.id, { provider: event.target.value ? { id: event.target.value } : undefined })
                          }
                        >
                          <option value="">不显示</option>
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {carriers.map((c) => (
                        <div key={c.id} className="fb-carrier-row">
                          <span className="fb-carrier-name">{c.short}</span>
                          <label className="fb-text">
                            探测任务 #<input
                              type="number"
                              min={1}
                              value={conf.carriers?.[c.id]?.taskId ?? ''}
                              onChange={(event) =>
                                patchNode(node.id, {
                                  carriers: {
                                    ...conf.carriers,
                                    [c.id as CarrierId]: {
                                      ...conf.carriers?.[c.id],
                                      ...(event.target.value ? { taskId: Number(event.target.value) } : { taskId: undefined }),
                                    },
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="fb-text">
                            线路
                            <select
                              value={conf.carriers?.[c.id]?.line ?? ''}
                              onChange={(event) =>
                                patchNode(node.id, {
                                  carriers: {
                                    ...conf.carriers,
                                    [c.id as CarrierId]: { ...conf.carriers?.[c.id], line: event.target.value || undefined },
                                  },
                                })
                              }
                            >
                              <option value="">不显示</option>
                              {lines.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ))}
                      <div className="fb-field-row">
                        <button type="button" className="fb-btn fb-btn-outline" onClick={() => setPortraitFor(node.id)}>
                          编辑立绘
                        </button>
                        <button
                          type="button"
                          className="fb-btn fb-btn-ghost"
                          onClick={() => setDraft((prev) => ({ ...prev, nodes: Object.fromEntries(Object.entries(prev.nodes).filter(([k]) => k !== String(node.id))) }))}
                        >
                          清除此节点设置
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {!nodes.length && <p className="fb-quiet">主控还没有下发节点。</p>}
          </div>
        </section>

        {preview && (
          <section className="fb-settings-block panel fb-preview-block">
            <h2>即时预览</h2>
            <div className="fb-preview">
              <PlayerCard
                node={{ ...preview, name: nodeConfig(preview.id).alias?.trim() || preview.name }}
                config={draft}
                score={previewScore}
                tier={nextTier(null)}
                interactive={false}
              />
            </div>
            <p className="fb-quiet">评分为实时值，未连接到历史时这里显示占位。</p>
          </section>
        )}
      </div>

      {portraitFor !== null && (
        <PortraitEditor
          value={nodeConfig(portraitFor).portrait}
          fallback="arsenal"
          onChange={(next: PortraitConfig) => patchNode(portraitFor, { portrait: next })}
          onClose={() => setPortraitFor(null)}
        />
      )}
    </>
  )
}
