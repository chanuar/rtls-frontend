const { test } = require('node:test')
const assert = require('node:assert/strict')
const { maxHeatCount } = require('./load.cjs').load('src/lib/heatmap.ts')

test('heatmap scale handles absent, empty and large sets of cells without changing counts', () => {
  assert.equal(maxHeatCount(null), 0)
  assert.equal(maxHeatCount({ cell: 0.5, bins: [] }), 0)
  const bins = Array.from({ length: 150000 }, (_, i) => ({ cx: i, cy: 0, count: i + 1 }))
  assert.equal(maxHeatCount({ cell: 0.5, bins }), 150000)
  assert.equal(bins[0].count, 1)
  assert.equal(maxHeatCount({ cell: 0.5, bins: [bins[0]] }), 1)
})
