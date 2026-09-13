const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')

test('tag labels use measured width to stay inside the right edge of the map', () => {
  const { FloorPlan } = load('src/components/FloorPlan.tsx', {
    react: { useMemo: fn => fn(), useState: () => [null, () => {}] },
  })
  function labelOffset(x, width) {
    const tree = FloorPlan({
      anchors: [], live: { T0: { tag: 'T0', x, y: 2, ts: '2026-09-08T12:00:00Z', quality: 0.1, n_anchors: 4 } },
      trails: {}, tagIds: ['T0'], selectedTag: 'T0', onSelect() {}, mode: 'live', freshTags: [],
      now: Date.parse('2026-09-08T12:00:15Z'),
    })
    function find(node) {
      if (!node || typeof node !== 'object') return null
      if (node.type === 'text' && typeof node.props.children === 'string' && node.props.children.startsWith('T0')) return node
      return [node.props?.children].flat(Infinity).map(find).find(Boolean)
    }
    let offset
    find(tree).props.ref({ getComputedTextLength: () => width, setAttribute: (key, value) => {
      assert.equal(key, 'x')
      offset = Number(value)
    } })
    return offset
  }
  assert.equal(labelOffset(1, 230), 14)
  assert.equal(labelOffset(27.5, 230), -244)
  assert.equal(labelOffset(27.5, 20), 14)
  assert.equal(labelOffset(27.5, 300), -314)
})
