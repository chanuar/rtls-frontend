const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')

const start = new Date('2026-09-05T08:00:00Z'), end = new Date('2026-09-05T21:00:00Z')
const sample = { ts: '2026-09-05T12:00:00+00:00', x: 1, y: 2, quality: null, n_anchors: null }
function api(value) {
  return load('src/lib/api.ts', {}, { AbortSignal, fetch: async () => ({ ok: true, json: async () => value }) })
}

test('REST rejects malformed responses instead of passing invalid data to consumers', async () => {
  for (const value of [{ detail: 'unexpected shape' }, [null], [{ id: 'A', x: Infinity, y: 0, z: 3, description: null }]]) {
    await assert.rejects(api(value).fetchAnchors(), /Respuesta inválida/)
  }
  await assert.rejects(api([{ id: 'T0', employee: null, active: 'true' }]).fetchTags(), /Respuesta inválida/)
  for (const value of [[{ ...sample, ts: 'invalid' }], [{ ...sample, x: Infinity }],
    [{ ...sample, quality: -1 }], [{ ...sample, n_anchors: 2 }],
    [sample, { ...sample, ts: '2026-09-05T11:00:00Z' }], [sample, sample],
    [{ ...sample, ts: '2026-09-04T12:00:00Z' }]]) {
    await assert.rejects(api(value).fetchPositions('T0', start, end), /Respuesta inválida/)
  }
  for (const value of [{ cell: 0, bins: [] }, { cell: 0.5, bins: {} },
    { cell: 0.5, bins: [{ cx: 0, cy: 0, count: -1 }] }]) {
    await assert.rejects(api(value).fetchHeatmap(start, end, 0.5), /Respuesta inválida/)
  }
  assert.throws(() => api([]).fetchPositions('T0', end, start), /periodo/)
  await assert.rejects(api([{ ...sample, ts: '2026-02-30T12:00:00Z' }]).fetchPositions(
    'T0', new Date('2026-02-01T00:00:00Z'), end), /Respuesta inválida/)
})

test('REST accepts empty responses, nullable sample fields and the backend contract', async () => {
  const anchors = [{ id: 'A0', x: -1, y: 2, z: 3, description: null }]
  const tags = [{ id: 'T0', employee: null, active: false }]
  const heat = { cell: 0.5, bins: [{ cx: -1, cy: 2, count: 3 }] }
  assert.equal(await api(anchors).fetchAnchors(), anchors)
  assert.equal(await api(tags).fetchTags(), tags)
  assert.equal((await api([sample]).fetchPositions('T0', start, end))[0], sample)
  assert.equal(await api(heat).fetchHeatmap(start, end, 0.5), heat)
  assert.equal((await api([]).fetchPositions('T0', start, end)).length, 0)
})
