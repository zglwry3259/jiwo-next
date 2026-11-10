import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geoOrthographic } from 'd3-geo'
import { arcAltitude, arcPath, arcPointAt, MESH_MAX_REGIONS, pickArcPairs, sampleArc } from './globe-arcs.ts'

// 与经典地球同一套参数：球心 (320,190)、半径 168，视角对着东亚
const projection = () => geoOrthographic().translate([320, 190]).scale(168).clipAngle(90).rotate([-105, -18])
const HK = [114.17, 22.32]
const JP = [138.25, 36.2]
const US = [-98.5, 39.8]
const dist = (x, y) => Math.hypot(x - 320, y - 190)

test('弧线高度：两地越远抬得越高，最高不超过半径的 0.34', () => {
  assert.ok(arcAltitude(HK, US) > arcAltitude(HK, JP))
  assert.ok(arcAltitude([0, 0], [180, 0]) <= 0.34 + 1e-9)
})

test('正面短弧：起点贴着地表、整条可见、中段抬离地表', () => {
  const p = projection()
  const points = sampleArc(p, HK, JP)
  const [hx, hy] = p(HK)
  assert.ok(Math.abs(points[0].x - hx) < 1e-6 && Math.abs(points[0].y - hy) < 1e-6)
  assert.ok(points.every((pt) => pt.visible))
  const surfaceMid = p([(HK[0] + JP[0]) / 2, (HK[1] + JP[1]) / 2])
  assert.ok(dist(points[32].x, points[32].y) > dist(surfaceMid[0], surfaceMid[1]))
})

test('绕到背面的弧：被挡的点在地球圆盘内，伸出轮廓的部分仍可见', () => {
  const points = sampleArc(projection(), HK, US)
  assert.ok(points[0].visible && !points[points.length - 1].visible)
  const outside = points.filter((pt) => dist(pt.x, pt.y) > 168)
  assert.ok(outside.length > 0 && outside.every((pt) => pt.visible))
  assert.ok(points.filter((pt) => !pt.visible).every((pt) => dist(pt.x, pt.y) <= 168))
})

test('path 在被挡住的地方断开，弧上取点按相邻点插值', () => {
  assert.equal(arcPath([
    { x: 0, y: 0, visible: true }, { x: 1, y: 1, visible: true }, { x: 2, y: 2, visible: false },
    { x: 3, y: 3, visible: true }, { x: 4, y: 4, visible: true },
  ]), 'M0.0 0.0L1.0 1.0M3.0 3.0L4.0 4.0')
  const pts = [{ x: 0, y: 0, visible: true }, { x: 10, y: 0, visible: true }, { x: 20, y: 0, visible: false }]
  assert.deepEqual(arcPointAt(pts, 0.25), { x: 5, y: 0 })
  assert.equal(arcPointAt(pts, 0.75), null)
})

test('连线：地区少时两两相连，多了从服务器最多的地区放射，一样多取离默认朝向最近的', () => {
  const at = (count, lon = 0) => ({ count, coordinates: [lon, 0] })
  assert.equal(pickArcPairs([at(1), at(2), at(3)], [0, 0]).length, 3)
  const many = Array.from({ length: MESH_MAX_REGIONS + 2 }, (_, i) => at(i === 3 ? 9 : 1, i * 10))
  const pairs = pickArcPairs(many, [0, 0])
  assert.ok(pairs.length === many.length - 1 && pairs.every(([hub]) => hub === many[3]))
  const tie = Array.from({ length: MESH_MAX_REGIONS + 1 }, (_, i) => at(1, i * 20))
  assert.ok(pickArcPairs(tie, [61, 0]).every(([hub]) => hub === tie[3]))
})
