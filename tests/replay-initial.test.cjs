const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { load } = require('./load.cjs')
const { useReplay, ReplayBar } = load('src/components/Replay.tsx')

test('the first replay render already exposes the first observed timestamp', () => {
  const samples = [0, 5].map(second => ({
    ts: new Date(Date.parse('2026-09-13T12:00:00Z') + second * 1000).toISOString(),
    x: 1, y: 2, quality: 0.1, n_anchors: 4,
  }))
  function Replay() { return createElement(ReplayBar, { replay: useReplay(samples) }) }
  const html = renderToStaticMarkup(createElement(Replay))
  assert.ok(html.includes(`value="${Date.parse(samples[0].ts)}"`))
  assert.ok(html.includes(new Date(samples[0].ts).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'medium' })))
  assert.ok(!html.includes('1970'))
})
