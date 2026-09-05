const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const position = { tag: 'T0', ts: '2026-09-05T12:00:00Z', x: 1, y: 2, quality: 0.1, n_anchors: 4 }

test('reject malformed and older positions before updating the store', () => {
  const { useStore } = load('src/store.ts')
  for (const p of [null, {}, { ...position, quality: null }, { ...position, x: Infinity },
    { ...position, n_anchors: 2 }, { ...position, ts: 'invalid' }, { ...position, tag: '' }]) {
    useStore.getState()._apply(p)
  }
  assert.equal(Object.keys(useStore.getState().live).length, 0)
  useStore.getState()._apply(position)
  useStore.getState()._apply({ ...position, x: 9 })
  useStore.getState()._apply({ ...position, ts: '2026-09-05T11:00:00Z', x: 9 })
  assert.equal(useStore.getState().live.T0.x, 1)
  assert.equal(useStore.getState().trails.T0.length, 1)
})
