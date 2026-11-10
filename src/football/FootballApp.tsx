// Football Monitor 主题入口：把 NSJLUCAS/football-monitor 的球星卡界面接在妙妙屋 X 主控快照上。
// 数据来自 useProbe()，节点映射在 model.ts，路由是 hash（主站详情页也在用 hash，两边互不干扰）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Moon, Search, Settings2, Sun, SunMoon } from 'lucide-react'
import type { ProbePayload, ThemeName } from '../types'
import { PasskeyLogin } from '../PasskeyLogin'
import { ThemeSelect } from '../ThemePicker'
import { useProbe } from '../use-probe'
import { emptyScore, nextTier, type Tier } from './domain/score'
import { fetchSeries, linesOf } from './domain/history'
import type { HistoryResponse } from './domain/types'
import {
  buildModel,
  buildTheme,
  fetchConfigFile,
  readLocalConfig,
  seriesHistory,
  writeLocalConfig,
  type FootballConfigFile,
} from './model'
import { effectiveTheme, masterHints } from './master'
import { navigate } from './components/PageHeading'
import { Dashboard } from './views/Dashboard'
import { NetworkView } from './views/Network'
import { NodeDetail } from './views/NodeDetail'
import { Ops } from './views/Ops'
import { Settings } from './views/Settings'
import './index.css'

type Route =
  | { name: 'home'; anchor?: string }
  | { name: 'node'; id: number }
  | { name: 'network' }
  | { name: 'ops' }
  | { name: 'settings'; node?: number }

const TITLES: Record<Route['name'], string> = {
  home: '主场',
  node: '节点详情',
  network: '网络质量',
  ops: '运维模式',
  settings: '主题设置',
}

function parseRoute(hash: string): Route {
  const raw = (hash || '').replace(/^#/, '')
  const [pathPart, queryPart] = raw.split('?')
  const path = pathPart || '/'
  const query = new URLSearchParams(queryPart || '')
  // 首页内的锚点（导航里「服务器」指向 /#squad）会变成 #/#squad。
  if (path.startsWith('/#')) return { name: 'home', anchor: path.slice(2) || 'squad' }
  if (path === '/' || path === '') return { name: 'home' }
  const node = /^\/node\/(\d+)$/.exec(path)
  if (node) return { name: 'node', id: Number(node[1]) }
  if (path === '/network') return { name: 'network' }
  if (path === '/ops') return { name: 'ops' }
  if (path === '/settings') {
    const raw = Number(query.get('node'))
    return { name: 'settings', node: Number.isFinite(raw) && raw > 0 ? raw : undefined }
  }
  return { name: 'home' }
}

const APPEARANCE_ORDER = ['dark', 'light', 'system'] as const
const APPEARANCE_ICON = { dark: Moon, light: Sun, system: SunMoon } as const
const APPEARANCE_NAME = { dark: '深色', light: '浅色', system: '跟随系统' } as const

export default function FootballApp({
  data,
  error,
  onThemeChange,
}: {
  data: ProbePayload
  error?: string
  onThemeChange: (name: ThemeName | null) => void
}) {
  const { updatedAt } = useProbe()
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const [search, setSearch] = useState('')
  const searchBox = useRef<HTMLInputElement>(null)

  // ---------- 路由 ----------
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    document.title = `${TITLES[route.name]} · Football Monitor`
  }, [route.name])
  useEffect(() => {
    if (route.name === 'home' && route.anchor) {
      const target = document.getElementById(route.anchor)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [route])
  // 「/」聚焦顶部搜索框，和原工程一致；输入框里再按不拦。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      searchBox.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- 配置：静态 theme.json + 本机 localStorage ----------
  // 主控口径：明暗、品牌、show_* 开关。数据帧每几秒到一次，用 useMemo 跟住。
  const hints = useMemo(() => masterHints(data), [data])
  const [fileConfig, setFileConfig] = useState<FootballConfigFile | undefined>()
  const [config, setConfig] = useState(() => buildTheme(undefined, readLocalConfig(), hints.appearance))
  useEffect(() => {
    let alive = true
    void fetchConfigFile().then((file) => {
      if (!alive || !file) return
      setFileConfig(file)
      setConfig(buildTheme(file, readLocalConfig(), hints.appearance))
    })
    return () => {
      alive = false
    }
    // theme.json 只在挂载时读一次；主控明暗变化由下面的 effect 单独跟。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 访客没在本机选过明暗时，跟随主控（主控把主题从 football-light 改成 football-dark 要立即生效）。
  useEffect(() => {
    if (!hints.appearance) return
    if (readLocalConfig()?.global?.appearance) return
    setConfig((current) => (current.appearance === hints.appearance ? current : { ...current, appearance: hints.appearance! }))
  }, [hints.appearance])
  // 视图拿的是「主控口径 + 站长配置」的合并结果；设置页编辑的仍是站长自己的配置。
  const view = useMemo(() => effectiveTheme(config, hints), [config, hints])
  const applyConfig = useCallback((next: typeof config) => {
    setConfig(next)
    // 设置页已经把 nodes 之外的值平铺进 global；这里保持同样的落盘形状。
    const { nodes, ...global } = next
    writeLocalConfig({ version: 1, global, nodes })
  }, [])

  // ---------- 外观 ----------
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  const appearance = config.appearance === 'system' ? (systemDark ? 'dark' : 'light') : config.appearance
  const AppearanceIcon = APPEARANCE_ICON[config.appearance]
  const cycleAppearance = () => {
    const next = APPEARANCE_ORDER[(APPEARANCE_ORDER.indexOf(config.appearance) + 1) % APPEARANCE_ORDER.length]
    applyConfig({ ...config, appearance: next })
  }
  // 卡面上的数字滚动读 documentElement.dataset.motion，样式表读 [data-motion]，两边都要有。
  useEffect(() => {
    document.documentElement.dataset.motion = config.motion ? 'true' : 'false'
    return () => {
      delete document.documentElement.dataset.motion
    }
  }, [config.motion])

  // ---------- 主控快照 → 主题模型 ----------
  const model = useMemo(() => buildModel(data, error, updatedAt), [data, error, updatedAt])

  // 档位带滞回：分数在阈值附近抖动时不要来回换色（nextTier 的 GAP 就是干这个的）。
  const tierCache = useRef<Record<number, Tier>>({})
  const tiers = useMemo(() => {
    const out: Record<number, Tier> = {}
    for (const node of model.nodes) out[node.id] = nextTier(model.scores[node.id]?.overall ?? null, tierCache.current[node.id])
    tierCache.current = out
    return out
  }, [model])

  // ---------- 24 小时探测历史：进入视野才拉，一个节点只拉一次 ----------
  const [history, setHistory] = useState<Record<number, HistoryResponse>>({})
  const [historyFailed, setHistoryFailed] = useState<Record<number, boolean>>({})
  const pending = useRef(new Set<number>())
  const settled = useRef(new Set<number>())
  const requestHistory = useCallback((nodeId: number) => {
    if (pending.current.has(nodeId) || settled.current.has(nodeId)) return
    pending.current.add(nodeId)
    fetchSeries(nodeId, '24h', 'all')
      .then((payload) => {
        const series = linesOf(payload)
        setHistory((prev) => ({ ...prev, [nodeId]: seriesHistory(payload, series) }))
      })
      .catch(() => setHistoryFailed((prev) => ({ ...prev, [nodeId]: true })))
      .finally(() => {
        pending.current.delete(nodeId)
        // 成功失败都记一笔：失败重试交给页面上的刷新按钮，不要每帧重打。
        settled.current.add(nodeId)
      })
  }, [])
  // 直接打开详情页或网络质量页时首页卡片没被滚动过，这里补拉，否则卡下条与三网全是空的。
  useEffect(() => {
    if (route.name === 'node') requestHistory(route.id)
    else if (route.name === 'network' || route.name === 'ops') for (const node of model.nodes) requestHistory(node.id)
  }, [route, model.nodes, requestHistory])

  const bare = route.name === 'ops'
  const title = hints.branding.title
  // 主控下发的 logo 可能 404（换了站点但没清设置），失败就退回主题自带的小人。
  const [logoFailed, setLogoFailed] = useState(false)
  const logo = !logoFailed && hints.branding.logo ? hints.branding.logo : '/football/athlete.svg'
  const online = model.nodes.filter((node) => node.online).length
  const connection = error ? 'closed' : data ? 'live' : 'connecting'

  const page = (() => {
    if (route.name === 'node') {
      const node = model.nodes.find((item) => item.id === route.id)
      return (
        <NodeDetail
          node={node}
          config={view}
          tier={node ? tiers[node.id] : 'silver'}
          score={node ? (model.scores[node.id] ?? emptyScore()) : emptyScore()}
          historyDays={data.history_days ?? 7}
          pingHistory={node ? history[node.id] : undefined}
        />
      )
    }
    if (route.name === 'network')
      return <NetworkView nodes={model.nodes} config={view} historyDays={data.history_days ?? 7} initialHistory={history} />
    if (route.name === 'ops')
      return <Ops nodes={model.nodes} config={view} scores={model.scores} pingHistory={history} updatedAt={model.updatedAt} hideGlobe={hints.hideGlobe} />
    if (route.name === 'settings')
      return <Settings config={config} nodes={model.nodes} onChange={applyConfig} focusNode={route.node} />
    return (
      <Dashboard
        nodes={model.nodes}
        config={view}
        scores={model.scores}
        tiers={tiers}
        history={history}
        historyFailed={historyFailed}
        updatedAt={model.updatedAt}
        error={error}
        loading={model.loading}
        requestHistory={requestHistory}
        onRefresh={() => navigate('/')}
        hasLogin
        forward={data.show_forward === false ? undefined : data.forward}
        search={search}
        onSearch={setSearch}
      />
    )
  })()

  return (
    <div className="fb-app" data-fb-theme={appearance} data-motion={config.motion ? 'true' : 'false'}>
      <div className="fb-root">
        <a className="skip-link" href="#main">
          跳到主内容
        </a>
        <header className="site-header">
          <div className="header-inner">
            <a className="brand" href="#/" aria-label="Football Monitor 首页">
              <img src={logo} alt="" width={28} height={28} onError={() => setLogoFailed(true)} />
              <span className="brand-word">
                FOOTBALL <strong>MONITOR</strong>
              </span>
            </a>
            <nav className="main-nav" aria-label="主导航">
              <a className={route.name === 'home' ? 'active' : ''} href="#/">
                首页
              </a>
              <a href="#/#squad">服务器</a>
              <a className={route.name === 'network' ? 'active' : ''} href="#/network">
                网络质量
              </a>
              <a className={`ops-link${route.name === 'ops' ? ' active' : ''}`} href="#/ops">
                运维模式
              </a>
            </nav>
            <label className="header-search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchBox}
                id="node-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  if (route.name !== 'home') navigate('/')
                }}
                placeholder="搜索名称、分组或备注…"
                aria-label="搜索节点"
              />
              <kbd>/</kbd>
            </label>
            <div className="header-actions">
              <span
                className="connection-pill"
                data-state={connection}
                role="status"
                title={error ? `连接中断，显示最近数据：${error}` : '实时数据已连接'}
              >
                <i aria-hidden="true" />
                <span className="connection-text">{error ? '离线' : '在线'}</span>
              </span>
              <PasskeyLogin buttonClassName="fb-btn fb-btn-ghost" iconSize={16} />
              <ThemeSelect value={null} onChange={onThemeChange} buttonClassName="fb-btn fb-btn-ghost" />
              <button
                type="button"
                className="fb-btn fb-btn-ghost"
                aria-label={`外观：${APPEARANCE_NAME[config.appearance]}，点击切换`}
                title={`外观：${APPEARANCE_NAME[config.appearance]}；点击切换`}
                onClick={cycleAppearance}
              >
                <AppearanceIcon size={16} aria-hidden="true" />
              </button>
              <a
                className="fb-btn fb-btn-ghost"
                href="#/settings"
                aria-label="主题设置"
                title="主题设置"
                data-slot="settings"
              >
                <Settings2 size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </header>
        <main id="main" className={bare ? 'is-bare' : 'page-container'}>
          {page}
        </main>
        {!bare && (
          <footer className="site-footer">
            <span className="footer-brand">
              FOOTBALL<strong>MONITOR</strong>
              <span>主题 · 数据来自 {title}</span>
            </span>
            <span>
              {online} / {model.nodes.length} 在线
              {model.updatedAt ? ` · 更新于 ${new Date(model.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : ''}
              {hints.branding.license.map((name) => ` · ${name}`).join('')}
            </span>
            <a href="#/settings">主题设置</a>
          </footer>
        )}
      </div>
    </div>
  )
}
