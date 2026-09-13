const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const { positionAt, sampleIndexAt, isContinuous, analyzeTrajectory } = load('src/lib/trajectory.ts')
const sample = (seconds, x = 1, y = 1) => ({ ts: new Date(seconds * 1000).toISOString(), x, y, quality: 0.1, n_anchors: 4 })

test('replay interpolates short intervals but hides the marker across missing measurements', () => {
  assert.equal(positionAt([sample(0), sample(1200, 20)], 600000), null)
  assert.equal(isContinuous(sample(0), sample(1200)), false)
  assert.equal(positionAt([sample(0), sample(5, 6)], 2500).x, 3.5)
  assert.equal(positionAt([sample(0), sample(1200, 20)], 1200000).x, 20)
})

test('the rendered replay path has a new segment after a gap', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { FloorPlan } = load('src/components/FloorPlan.tsx')
  const html = renderToStaticMarkup(React.createElement(FloorPlan, {
    anchors: [], live: {}, trails: {}, tagIds: [], selectedTag: null, onSelect() {}, mode: 'replay',
    replayPath: [sample(0), sample(5, 2), sample(1200, 20)], replayTime: 1200000,
  }))
  const paths = [...html.matchAll(/<path d="([^"]+)"[^>]*stroke="var\(--(?:map-path|color-accent)\)"/g)]
  assert.equal(paths.length, 2)
  for (const [, path] of paths) assert.equal(path.replace(/[^ML]/g, ''), 'MLM')
})

test('stationary intervals count once even at the end or before a coverage gap', () => {
  const stopped = Array.from({ length: 61 }, (_, i) => sample(i))
  assert.equal(analyzeTrajectory(stopped).stops, 1)
  assert.equal(analyzeTrajectory([...stopped, sample(1200)]).stops, 1)
  assert.equal(analyzeTrajectory([...stopped, ...Array.from({ length: 31 }, (_, i) => sample(1200 + i))]).stops, 2)
  assert.equal(analyzeTrajectory(stopped.slice(0, 30)).stops, 0)
})

test('cursor search preserves boundaries and gaps with cached timestamps', () => {
  const samples = [sample(0), sample(5, 2), sample(1200, 20)]
  const timestamps = samples.map(s => Date.parse(s.ts))
  for (const [time, index] of [[-1, -1], [0, 0], [4999, 0], [5000, 1], [600000, 1], [1200000, 2], [1300000, 2]]) {
    assert.equal(sampleIndexAt(samples, time, timestamps), index)
  }
  assert.equal(sampleIndexAt([], 0), -1)
  assert.equal(positionAt(samples, -1).index, 0)
  assert.equal(positionAt(samples, 1300000).index, 2)
})

test('chunk boundaries preserve continuity and never bridge a gap or rejected jump', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { ReplayPath } = load('src/components/ReplayPath.tsx')
  for (const last of [sample(256 * 5), sample(256 * 5 + 20), sample(256 * 5, 100)]) {
    const samples = [...Array.from({ length: 256 }, (_, i) => sample(i * 5)), last]
    const html = renderToStaticMarkup(React.createElement(ReplayPath, { samples, time: Date.parse(last.ts), minX: 0, maxY: 6, scale: 64 }))
    const paths = [...html.matchAll(/<path d="([^"]+)"/g)]
    assert.equal(paths.length, 4)
    assert.equal(paths[1][1].replace(/[^ML]/g, ''), isContinuous(samples[255], last) ? 'ML' : 'MM')
    assert.equal(paths[0][1], paths[2][1])
    assert.equal(paths[1][1], paths[3][1])
  }
})

test('distance uses elapsed time and rejects impossible movement without counting zone time', () => {
  assert.equal(analyzeTrajectory([sample(0, 1), sample(5, 6)]).distanceM, 5)
  const glitch = analyzeTrajectory([sample(0, 1), sample(1, 20)])
  assert.equal(glitch.distanceM, 0)
  assert.equal(glitch.durationS, 0)
  assert.equal(glitch.perZoneS.length, 0)
})
