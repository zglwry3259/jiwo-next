import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flagTwemojiFile, globeLabelWidth, layoutGlobeLabels } from './globe-labels.ts'

const m = { height: 14, flag: 11, digit: 6, padding: 3, gap: 2, offset: 6, dotRadius: 4 }
const sphere = { cx: 200, cy: 200, r: 160 }
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('标签宽度贴合内容：一位数后面不留空', () => {
  assert.equal(globeLabelWidth(2, m), 3 + 11 + 2 + 6 + 3)
  assert.equal(globeLabelWidth(12, m), 3 + 11 + 2 + 12 + 3)
})

test('单独一个标签放在亮点右边，不画引线', () => {
  const [label] = layoutGlobeLabels([{ code: 'HK', count: 4, x: 200, y: 200 }], m, sphere)
  assert.equal(label.x, 206)
  assert.equal(label.y, 193)
  assert.equal(label.leader, undefined)
})

test('地区扎堆时标签互不重叠，也不压住别的亮点', () => {
  const pts = [
    { code: 'HK', count: 6, x: 200, y: 200 }, { code: 'MO', count: 1, x: 197, y: 201 }, { code: 'TW', count: 4, x: 215, y: 194 },
    { code: 'PH', count: 2, x: 214, y: 214 }, { code: 'VN', count: 1, x: 186, y: 203 }, { code: 'JP', count: 3, x: 240, y: 172 },
    { code: 'KR', count: 2, x: 225, y: 172 },
  ]
  const labels = layoutGlobeLabels(pts, m, sphere)
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), `${labels[i].code} × ${labels[j].code}`)
    for (const p of pts) {
      if (p.code === labels[i].code) continue
      assert.ok(!overlap(labels[i], { x: p.x - 4, y: p.y - 4, width: 8, height: 8 }), `${labels[i].code} 压住了 ${p.code}`)
    }
  }
  // 服务器多的先放：香港一定有标签
  assert.ok(labels.some((l) => l.code === 'HK'))
})

test('放不下的标签直接跳过，不叠上去', () => {
  const pts = Array.from({ length: 9 }, (_, i) => ({ code: `A${i}`, count: 1, x: 200 + (i % 3) * 3, y: 200 + Math.floor(i / 3) * 3 }))
  assert.ok(layoutGlobeLabels(pts, m, sphere).length < pts.length)
})

test('国家代码转成本地 twemoji 旗帜文件名', () => {
  assert.equal(flagTwemojiFile('hk'), '1f1ed-1f1f0')
  assert.equal(flagTwemojiFile('TW'), '1f1f9-1f1fc')
  assert.equal(flagTwemojiFile('X'), '')
})
