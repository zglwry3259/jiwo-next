import test from 'node:test'
import assert from 'node:assert/strict'
import { nameSize, nameWidth, nodeName } from './name.ts'

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
