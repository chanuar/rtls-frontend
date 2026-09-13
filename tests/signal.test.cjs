const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const { analyzeSignal } = load('src/lib/signal.ts')
const sample = (second, quality, n_anchors) => Object.freeze({
  ts: new Date(second * 1000).toISOString(), x: 1, y: 2, quality, n_anchors,
})

test('signal summaries preserve missing fields, zero residuals and temporal gaps', () => {
  const samples = Object.freeze([sample(0, 0.1, 4), sample(5, null, null), sample(20, 0.5, 3), sample(25, 0, null)])

  const result = analyzeSignal(samples)

  assert.ok(Math.abs(result.meanRms - 0.2) < 1e-12)
  assert.equal(result.maxRms, 0.5)
  assert.equal(result.qualitySamples, 3)
  assert.equal(result.anchorSamples, 2)
  assert.equal(result.minAnchors, 3)
  assert.equal(result.maxAnchors, 4)
  assert.equal(result.cadenceHz, 0.12)
  assert.deepEqual(Array.from(result.gaps, gap => [gap.start, gap.end, gap.seconds]), [
    ['1970-01-01T00:00:05.000Z', '1970-01-01T00:00:20.000Z', 15],
  ])
})

test('signal summaries need an elapsed interval for cadence and keep unknown quality unknown', () => {
  for (const samples of [[], [sample(0, null, null)], [
    { ...sample(0, null, null), ts: '1970-01-01T00:00:00.000100Z' },
    { ...sample(0, null, null), ts: '1970-01-01T00:00:00.000900Z' },
  ]]) {
    const result = analyzeSignal(samples)

    assert.equal(result.cadenceHz, null)
    assert.equal(result.meanRms, null)
    assert.equal(result.maxRms, null)
    assert.equal(result.minAnchors, null)
    assert.equal(result.maxAnchors, null)
    assert.equal(result.gaps.length, 0)
  }
  assert.equal(analyzeSignal([sample(0, 0, 4), sample(10, 0, 4)]).gaps.length, 0)
})

test('averaging finite residuals does not overflow to infinity', () => {
  const samples = [sample(0, Number.MAX_VALUE, 4), sample(1, Number.MAX_VALUE, 4)]

  const result = analyzeSignal(samples)

  assert.equal(result.meanRms, Number.MAX_VALUE)
})
