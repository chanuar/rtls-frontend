const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')

test('history follows the selected tag and ignores a request completed after selection changes', async () => {
  // Execute App's hooks with controlled renders and deferred API responses.
  const slots = [], pending = []
  let cursor = 0, trajectory
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef(initial) { return this.useState({ current: initial })[0] },
    useMemo(fn) { return fn() },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i]
      if (!old || deps.some((v, j) => v !== old.deps[j])) {
        old?.cleanup?.()
        slots[i] = { deps }
        pending.push(() => { slots[i].cleanup = fn() })
      }
    },
  }
  react.useRef = initial => react.useState({ current: initial })[0]
  const store = { status: 'online', anchors: [], tags: [{ id: 'T0' }, { id: 'T1' }],
    live: {}, trails: {}, selectedTag: 'T0', init: async () => {}, select: () => {} }
  let resolve
  const { default: App } = load('src/App.tsx', {
    react,
    './store': { useStore: Object.assign(() => store, { getState: () => ({ stop() {} }) }) },
    './lib/api': {
      fetchPositions: () => new Promise(done => { resolve = done }),
      fetchHeatmap: async () => ({ cell: 0.5, bins: [] }),
    },
    './components/Replay': { useReplay: samples => { trajectory = samples; return {} }, ReplayBar() {} },
  }, { window: { setInterval() { return 1 }, clearInterval() {} } })
  function render() {
    cursor = 0
    const tree = App()
    pending.splice(0).forEach(fn => fn())
    return tree
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate)
      if (found) return found
    }
    return null
  }
  function loadHistory(tree) {
    return find(tree, n => n.type === 'button' && n.props.children === 'Cargar jornada').props.onClick()
  }
  // An old T0 response must not populate T1.
  loadHistory(render())
  store.selectedTag = 'T1'
  render()
  resolve([{ ts: '2026-09-05T12:00:00Z', x: 9, y: 2 }])
  await new Promise(done => setImmediate(done))
  render()
  assert.equal(trajectory.length, 0)
  // A successful T1 load disappears immediately when selecting T0.
  loadHistory(render())
  resolve([{ ts: '2026-09-05T12:00:00Z', x: 1, y: 2 }])
  await new Promise(done => setImmediate(done))
  render()
  assert.equal(trajectory.length, 1)
  store.selectedTag = 'T0'
  render()
  assert.equal(trajectory.length, 0)
})
