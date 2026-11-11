import test from 'node:test'
import assert from 'node:assert/strict'
import { isPlaceholderName, nameFields, nameSize, nameSourceKey, nameWidth, nodeName } from './name.ts'

test('主控关了 show_name 时用 real_name 里的真名', () => {
  assert.equal(nodeName({ real_name: '香港 01', name: '服务器 1' }, 1), '香港 01')
})

test('显示名回退链：remark / alias / display_name 都能取到', () => {
  assert.equal(nodeName({ remark: '东京 CN2' }, 2), '东京 CN2')
  assert.equal(nodeName({ alias: 'SG-GIA' }, 3), 'SG-GIA')
  assert.equal(nodeName({ display_name: '德国 备份' }, 4), '德国 备份')
  assert.equal(nodeName({ name: '  ', remark: '兜底名' }, 5), '兜底名')
})

test('全空才用序号占位，且首尾空白会被去掉', () => {
  assert.equal(nodeName({}, 6), '服务器 6')
  assert.equal(nodeName(null, 7), '服务器 7')
  assert.equal(nodeName({ name: '  HK-01  ' }, 8), 'HK-01')
})

test('占位名识别：主控自己下发的「服务器 N」也认出来', () => {
  // 主控 show_name=false 且不保留真名时，name 字段本身就是序号
  assert.equal(isPlaceholderName('服务器 1', 1), true)
  assert.equal(isPlaceholderName('服务器 12', 12), true)
  assert.equal(isPlaceholderName(' 服务器 3 ', 3), true)
  // 序号对不上、或本来就是站长的名字，不算占位
  assert.equal(isPlaceholderName('服务器 1', 2), false)
  assert.equal(isPlaceholderName('香港 01', 1), false)
  assert.equal(isPlaceholderName('香港服务器 1', 1), false)
  // 字段缺失同样视为没拿到名字
  assert.equal(isPlaceholderName(undefined, 4), true)
  assert.equal(isPlaceholderName('   ', 5), true)
})

test('全角与 emoji 按两格计算宽度', () => {
  assert.equal(nameWidth('HK-01'), 5)
  assert.equal(nameWidth('香港'), 4)
  // 国旗由两个区域指示符拼成，各算一格，合计正好等于它占的两格宽
  assert.equal(nameWidth('🇭🇰'), 2)
  assert.equal(nameWidth('A香'), 3)
})

test('卡面字号档位按显示宽度退档', () => {
  // 16 格，9cqw 放得下，不降档
  assert.equal(nameSize('HK-Hysteria2-01'), undefined)
  // 17 格（中英混排）仍在 9cqw 上限内
  assert.equal(nameSize('香港-Hysteria2-01'), undefined)
  // 21 格（中英混排 + 10 个全角字）降到 7cqw
  assert.equal(nameSize('香港-高级专线-东京-02'), 'lg')
  // 26 格（18 字全角名）必须降到 4.9cqw
  assert.equal(nameSize('香港-Hysteria2-高级专线-01'), 'xl')
})

test('主控把显示名放在自创键上时也能取到（真机各个版本落点不同）', () => {
  assert.equal(nodeName({ name: '服务器 1', nickname: 'JP 光帆' }, 1), 'JP 光帆')
  assert.equal(nodeName({ name: '服务器 2', probe_name: 'US-AK' }, 2), 'US-AK')
  assert.equal(nodeName({ name: '服务器 3', server_name: '海创HK' }, 3), '海创HK')
  assert.equal(nodeName({ name: '服务器 4', label: 'HKREE' }, 4), 'HKREE')
})

test('名字塞在一层子对象里也能取到', () => {
  assert.equal(nodeName({ name: '服务器 1', meta: { title: 'HKREE' } }, 1), 'HKREE')
  assert.equal(nodeName({ name: '服务器 1', probe: { name: 'JP 光帆' } }, 1), 'JP 光帆')
})

test('技术键绝不当名字：region_name / provider_name / cpu_model / group_name', () => {
  const server = { name: '服务器 1', region_name: '香港', region_city: 'Hong Kong', provider_name: 'Akile', cpu_model: 'EPYC 7763', group_name: '进口' }
  assert.equal(nodeName(server, 1), '服务器 1')
  assert.equal(nameSourceKey(server, 1), null)
})

test('nameFields 把主控下发的名字类字段原样列出来，便于核对', () => {
  assert.deepEqual(nameFields({ name: '服务器 1', nickname: 'JP 光帆', region_name: '香港' }), [
    { key: 'nickname', value: 'JP 光帆' },
    { key: 'name', value: '服务器 1' },
  ])
})

test('nameSourceKey 报出卡面实际用了哪个键', () => {
  assert.equal(nameSourceKey({ name: '服务器 1', remark: '东京 CN2' }, 1), 'remark')
  assert.equal(nameSourceKey({ name: '服务器 1', meta: { title: 'HKREE' } }, 1), 'meta.title')
})
