const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { load } = require('./load.cjs')

test('last known marker stays visible without pulse until fresh data returns', () => {
  const { FloorPlan } = load('src/components/FloorPlan.tsx')
  const { LiveInfo } = load('src/components/Stats.tsx')
  const pos = { tag: 'T0', ts: '2026-09-08T12:00:00Z', x: 1, y: 2, quality: 0.1, n_anchors: 4 }
  const props = { anchors: [], live: { T0: pos }, trails: {}, tagIds: ['T0'], selectedTag: 'T0', onSelect() {}, mode: 'live', now: Date.parse(pos.ts) + 15000 }
  const stale = renderToStaticMarkup(React.createElement(FloorPlan, { ...props, freshTags: [] }))
  const fresh = renderToStaticMarkup(React.createElement(FloorPlan, { ...props, freshTags: ['T0'] }))
  assert.match(stale, /Última posición · hace 15 s/)
  assert.doesNotMatch(stale, /tag-pulse/)
  assert.match(stale, /stroke-dasharray="3 3"/)
  assert.equal(stale.match(/transform="translate\([^)]+\)"/)[0], fresh.match(/transform="translate\([^)]+\)"/)[0])
  assert.match(fresh, /tag-pulse/)
  assert.doesNotMatch(fresh, /Última posición/)
  const detail = renderToStaticMarkup(React.createElement(LiveInfo, { pos, stale: true, now: props.now }))
  assert.match(detail, /Ubicación actual sin confirmar/)
})
