const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const position = { tag: 'T0', ts: '2026-09-05T12:00:00Z', x: 1, y: 2, quality: 0.1, n_anchors: 4 }

test('freshness expires without incoming messages and rejects future timestamps', () => {
  const { isFresh } = load('src/config.ts')
  const now = Date.parse(position.ts)
  assert.equal(isFresh(position, now), true)
  assert.equal(isFresh(position, now + 10001), false)
  assert.equal(isFresh(position, now - 1000), false)
})

function runtime(api = {}) {
  const intervals = new Map(), timeouts = new Map(), sockets = []
  let id = 0
  class Socket {
    static OPEN = 1
    readyState = 1
    constructor() { sockets.push(this) }
    close() { this.onclose?.() }
    send() {}
  }
  const window = {
    setInterval(fn, ms) { intervals.set(++id, { fn, ms }); return id },
    clearInterval(key) { intervals.delete(key) },
    setTimeout(fn) { timeouts.set(++id, fn); return id },
    clearTimeout(key) { timeouts.delete(key) },
  }
  const { useStore } = load('src/store.ts', {
    './lib/api': { fetchAnchors: async () => [], fetchTags: async () => [], ...api },
  }, { window, WebSocket: Socket })
  return { useStore, intervals, timeouts, sockets }
}

test('reconnect keeps one keepalive and shutdown cancels timers and socket callbacks', async () => {
  const r = runtime()
  await r.useStore.getState().init()
  for (let i = 0; i < 5; i++) {
    assert.equal([...r.intervals.values()].filter(t => t.ms === 30000).length, 1)
    r.sockets.at(-1).close()
    assert.equal([...r.intervals.values()].filter(t => t.ms === 30000).length, 0)
    const retry = [...r.timeouts.values()][0]
    r.timeouts.clear()
    retry()
  }
  r.useStore.getState().stop()
  assert.equal(r.intervals.size, 0)
  assert.equal(r.timeouts.size, 0)
  assert.equal(r.sockets.at(-1).onclose, null)
})

test('reject malformed and older positions before updating the store', () => {
  const { useStore } = load('src/store.ts')
  for (const p of [null, {}, { ...position, quality: null }, { ...position, x: Infinity },
    { ...position, n_anchors: 2 }, { ...position, ts: 'invalid' }, { ...position, tag: '' },
    { ...position, ts: '2026-02-30T12:00:00Z' }, { ...position, ts: '2026-09-05T12:00:00' }]) {
    useStore.getState()._apply(p)
  }
  assert.equal(Object.keys(useStore.getState().live).length, 0)
  useStore.getState()._apply(position)
  useStore.getState()._apply({ ...position, x: 9 })
  useStore.getState()._apply({ ...position, ts: '2026-09-05T11:00:00Z', x: 9 })
  assert.equal(useStore.getState().live.T0.x, 1)
  assert.equal(useStore.getState().trails.T0.length, 1)
})

test('a rejected future position cannot block the next valid measurement', () => {
  const { useStore } = runtime()
  const present = { ...position, ts: new Date().toISOString() }
  const before = useStore.getState()
  useStore.getState()._apply({ ...present, ts: new Date(Date.now() + 86400000).toISOString(), x: 9 })
  assert.equal(useStore.getState(), before)
  useStore.getState()._apply(present)
  assert.equal(useStore.getState().live.T0.x, present.x)
  assert.equal(useStore.getState().trails.T0.length, 1)
})

test('startup failure retries the backend without manufacturing demo positions', async () => {
  let fail = true
  const r = runtime({ fetchAnchors: async () => { if (fail) throw Error('offline'); return [] } })
  await r.useStore.getState().init()
  assert.equal(r.useStore.getState().status, 'connecting')
  assert.equal(r.useStore.getState().tags.length, 0)
  assert.equal(r.intervals.size, 0)
  assert.equal(r.timeouts.size, 1)
  const error = r.useStore.getState().connectionError
  assert.ok(error)
  for (let i = 0; i < 2; i++) {
    const retry = r.useStore.getState().init()
    assert.equal(r.useStore.getState().connectionError, error)
    await retry
    assert.equal(r.useStore.getState().connectionError, error)
    assert.equal(r.timeouts.size, 1)
  }
  fail = false
  const recovery = r.useStore.getState().init()
  assert.equal(r.useStore.getState().connectionError, error)
  await recovery
  assert.equal(r.useStore.getState().connectionError, null)
  assert.equal(r.sockets.length, 1)
  r.sockets[0].onopen()
  assert.equal(r.useStore.getState().status, 'online')
  r.useStore.getState().stop()
})

test('anchor refresh applies calibration and clears positions in the old coordinate frame', async () => {
  let anchors = [{ id: 'A0', x: 0, y: 0, z: 3 }]
  const r = runtime({ fetchAnchors: async () => anchors })
  await r.useStore.getState().init()
  r.useStore.getState()._apply(position)
  anchors = [{ id: 'A0', x: 1, y: 0, z: 3 }]
  const refresh = [...r.intervals.values()].find(t => t.ms === 5000).fn
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.useStore.getState().anchors[0].x, 1)
  assert.equal(Object.keys(r.useStore.getState().live).length, 0)
  r.useStore.getState().stop()
  assert.equal(r.intervals.size, 0)
})

test('reconnect refreshes tag metadata and catalogue while preserving an existing selection', async () => {
  let tags = [{ id: 'T0', employee: 'Antes', active: true }, { id: 'T1', employee: null, active: true }]
  const r = runtime({ fetchTags: async () => tags })
  await r.useStore.getState().init()
  r.useStore.getState().select('T1')
  r.sockets[0].close()
  tags = [{ id: 'T1', employee: 'Después', active: false }, { id: 'T2', employee: 'Nuevo', active: true }]
  const retry = [...r.timeouts.values()][0]
  r.timeouts.clear()
  retry()
  r.sockets.at(-1).onopen()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.useStore.getState().tags, tags)
  assert.equal(r.useStore.getState().selectedTag, 'T1')
  assert.equal(Object.keys(r.useStore.getState().live).length, 0)
  r.useStore.getState().stop()
})

test('tag refresh completed after shutdown cannot replace the catalogue', async () => {
  let resolve, calls = 0
  const tags = [{ id: 'T0', employee: null, active: true }]
  const r = runtime({ fetchTags: () => ++calls === 1 ? Promise.resolve(tags) : new Promise(done => { resolve = done }) })
  await r.useStore.getState().init()
  r.sockets[0].onopen()
  r.useStore.getState().stop()
  resolve([])
  await new Promise(done => setImmediate(done))
  assert.equal(r.useStore.getState().tags, tags)
})

test('catalogue refresh preserves concurrent discoveries while applying removals and metadata', async () => {
  let resolve, calls = 0
  const initial = [{ id: 'removed', employee: null, active: true }, { id: 'known', employee: 'Antes', active: true }]
  const received = [{ id: 'known', employee: 'Después', active: false }, { id: 'T1', employee: 'Nuevo', active: true }]
  const r = runtime({ fetchTags: () => ++calls === 1 ? Promise.resolve(initial) : new Promise(done => { resolve = done }) })
  await r.useStore.getState().init()
  r.sockets[0].onopen()
  r.useStore.getState()._apply(position)
  r.useStore.getState()._apply({ ...position, tag: 'T1' })
  r.useStore.getState().select('T0')

  resolve(received)
  await new Promise(done => setImmediate(done))

  assert.deepEqual(Array.from(r.useStore.getState().tags, t => [t.id, t.employee, t.active]), [
    ['known', 'Después', false], ['T1', 'Nuevo', true], ['T0', null, true],
  ])
  assert.equal(r.useStore.getState().selectedTag, 'T0')
  assert.equal(r.useStore.getState().live.T0, position)
  assert.equal(received.length, 2)
  r.useStore.getState().stop()
})

test('unchanged anchors publish no state and preserve geometry identity', async () => {
  let description = null
  const r = runtime({ fetchAnchors: async () => [{ id: 'A0', x: 0, y: 0, z: 3, description }] })
  await r.useStore.getState().init()
  const previous = r.useStore.getState().anchors
  let updates = 0
  const unsubscribe = r.useStore.subscribe(() => updates++)
  const refresh = [...r.intervals.values()].find(t => t.ms === 5000).fn
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.useStore.getState().anchors, previous)
  assert.equal(updates, 0)
  description = 'Entrada'
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.useStore.getState().anchors[0].description, description)
  assert.equal(updates, 1)
  unsubscribe()
  r.useStore.getState().stop()
})

test('resource errors persist independently and failed tag refreshes retry', async () => {
  let failTags = false, failAnchors = false, tagRequests = 0
  const r = runtime({
    fetchTags: async () => {
      tagRequests++
      if (failTags) throw Error('tags offline')
      return [{ id: 'T0', employee: 'Ana', active: true }]
    },
    fetchAnchors: async () => { if (failAnchors) throw Error('anchors offline'); return [] },
  })
  await r.useStore.getState().init()
  failTags = true
  r.sockets[0].onopen()
  await new Promise(resolve => setImmediate(resolve))
  const refresh = [...r.intervals.values()].find(t => t.ms === 5000).fn
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.match(r.useStore.getState().tagError, /tags/)
  assert.equal(r.useStore.getState().anchorError, null)
  assert.equal(tagRequests, 3)

  failAnchors = true
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.match(r.useStore.getState().anchorError, /anchors/)
  failTags = false
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.useStore.getState().tagError, null)
  assert.match(r.useStore.getState().anchorError, /anchors/)
  failAnchors = false
  refresh()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.useStore.getState().anchorError, null)
  assert.equal(tagRequests, 5)
  r.useStore.getState().stop()
})
