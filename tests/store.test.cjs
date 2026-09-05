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

test('startup failure retries the backend without manufacturing demo positions', async () => {
  let fail = true
  const r = runtime({ fetchAnchors: async () => { if (fail) throw Error('offline'); return [] } })
  await r.useStore.getState().init()
  assert.equal(r.useStore.getState().status, 'connecting')
  assert.equal(r.useStore.getState().tags.length, 0)
  assert.equal(r.intervals.size, 0)
  assert.equal(r.timeouts.size, 1)
  fail = false
  await r.useStore.getState().init()
  assert.equal(r.sockets.length, 1)
  r.sockets[0].onopen()
  assert.equal(r.useStore.getState().status, 'online')
  r.useStore.getState().stop()
})
