import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billingInfo, nezhaOverview, osShortName, regionTabs, selectNezhaServers, uptimeLabel, usageTone } from './nezha-model.ts'

const servers = [
  { name: 'b', online: true, region: '🇭🇰', cpu_pct: 20, mem_used: 1, mem_total: 4, upload_speed: 10, download_speed: 30, traffic_used_up: 100, traffic_used_down: 300, uptime: 90000 },
  { name: 'a', online: false, region: 'JP', cpu_pct: 80, upload_speed: 0, download_speed: 0, traffic_used_up: 5, traffic_used_down: 7, uptime: 3600 },
  { name: 'c', online: true, region_country: 'HK', region: 'HK · Hong Kong', cpu_pct: 50, upload_speed: 1, download_speed: 2, uptime: 7200 },
]
const base = { status: 'all', group: 'all', query: '', sort: 'default', order: 'desc' }

test('概览：总数、在线、离线，本期上下行与实时网速合计', () => {
  assert.deepEqual(nezhaOverview(servers), { total: 3, online: 2, offline: 1, up: 105, down: 307, upSpeed: 11, downSpeed: 32 })
})

test('分组按地区：旗帜和国家代码算同一组，台数多的在前，「全部」第一个', () => {
  assert.deepEqual(regionTabs(servers).map((tab) => [tab.key, tab.count]), [['all', 3], ['HK', 2], ['JP', 1]])
  assert.equal(regionTabs(servers)[1].label, '🇭🇰 香港')
})

test('筛选：在线 / 离线、分组、关键词，保留原始下标', () => {
  assert.deepEqual(selectNezhaServers(servers, { ...base, status: 'online' }).map((x) => x.index), [0, 2])
  assert.deepEqual(selectNezhaServers(servers, { ...base, status: 'offline' }).map((x) => x.index), [1])
  assert.deepEqual(selectNezhaServers(servers, { ...base, group: 'HK' }).map((x) => x.index), [0, 2])
  assert.deepEqual(selectNezhaServers(servers, { ...base, query: 'C' }).map((x) => x.index), [2])
})

test('排序：默认保持主控顺序，其余按升降序，相同时按原顺序', () => {
  assert.deepEqual(selectNezhaServers(servers, base).map((x) => x.index), [0, 1, 2])
  assert.deepEqual(selectNezhaServers(servers, { ...base, sort: 'cpu' }).map((x) => x.index), [1, 2, 0])
  assert.deepEqual(selectNezhaServers(servers, { ...base, sort: 'name', order: 'asc' }).map((x) => x.server.name), ['a', 'b', 'c'])
  assert.deepEqual(selectNezhaServers(servers, { ...base, sort: 'down total' }).map((x) => x.index), [0, 1, 2])
})

test('占用条配色与在线时间', () => {
  assert.deepEqual([usageTone(95), usageTone(71), usageTone(70)], ['bad', 'warn', 'ok'])
  assert.equal(uptimeLabel(90000), '1 天')
  assert.equal(uptimeLabel(7200), '2 小时')
  assert.equal(uptimeLabel(undefined), '—')
})

test('计费信息：剩余天数与比例、已过期、永久、只有价格', () => {
  const now = Date.parse('2026-10-01T00:00:00Z')
  const info = billingInfo({ online: true, expires_at: '2026-10-16', renewal_cycle: 'month', renewal_price: 30, renewal_currency: 'CNY' }, now)
  assert.equal(info.days, 16)
  assert.equal(info.expired, false)
  assert.equal(Math.round(info.remainPct), 53)
  assert.equal(info.price, '¥30/月')
  assert.equal(billingInfo({ online: true, expires_at: '2026-09-20' }, now).expired, true)
  assert.equal(billingInfo({ online: true, renewal_cycle: 'permanent', renewal_price: 99 }, now).permanent, true)
  assert.equal(billingInfo({ online: true, renewal_price: 7.99, renewal_currency: 'USD', renewal_price_cny: 56.73, renewal_cycle: 'year' }, now).price, '¥56.73/年')
  assert.equal(billingInfo({ online: true }, now), undefined)
})

test('系统简称：取发行版名，Windows / macOS 统一写法', () => {
  assert.equal(osShortName('Debian GNU/Linux 12 (bookworm)'), 'Debian')
  assert.equal(osShortName('Ubuntu 24.04.1 LTS'), 'Ubuntu')
  assert.equal(osShortName('Microsoft Windows Server 2022'), 'Windows')
  assert.equal(osShortName(''), '—')
})
