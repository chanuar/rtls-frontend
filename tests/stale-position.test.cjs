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

test('positions received between clock ticks stay fresh; stale and disconnected markers remain', () => {
  let clock = Date.parse('2026-09-08T12:00:00Z'), cursor = 0
  const slots = []
  class Clock extends Date { static now() { return clock } }
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], () => {}]
    },
    useRef(initial) { return { current: initial } },
    useMemo(fn) { return fn() }, useEffect() {},
  }
  const store = { status: 'online', anchors: [], tags: [{ id: 'T0' }], live: {}, trails: {}, selectedTag: 'T0', init() {}, select() {} }
  const { default: App } = load('src/App.tsx', {
    react, './store': { useStore: () => store },
    './components/Replay': { useReplay: () => ({}), ReplayBar() {} },
  }, { Date: Clock })
  function find(node, name) {
    if (!node || typeof node !== 'object') return null
    if (node.type?.name === name) return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, name)
      if (found) return found
    }
    return null
  }
  function render() { cursor = 0; return find(App(), 'FloorPlan').props }
  render()
  clock += 200
  const pos = { tag: 'T0', ts: new Date(clock).toISOString(), x: 1, y: 2, quality: 0.1, n_anchors: 4 }
  store.live.T0 = pos
  clock += 50
  assert.equal(render().freshTags.includes('T0'), true)
  clock += 10001
  assert.equal(render().freshTags.length, 0)
  assert.equal(render().live.T0, pos)
  store.status = 'connecting'
  assert.equal(render().live.T0, pos)
  assert.equal(render().freshTags.length, 0)
  store.status = 'online'
  store.live.T0 = { ...pos, ts: new Date(clock).toISOString(), x: 2 }
  assert.equal(render().freshTags.includes('T0'), true)
})
