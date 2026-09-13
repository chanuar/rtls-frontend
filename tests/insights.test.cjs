const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const { analyzePeriod } = load('src/lib/insights.ts')
const generateInsights = (data, tags) => analyzePeriod(data, tags).insights
const sample = seconds => ({ ts: new Date(seconds * 1000).toISOString(), x: 1, y: 1, quality: 0.1, n_anchors: 4 })

test('sample and observed-time thresholds remain distinct for gaps and dwell', () => {
  const beforeGap = Array.from({ length: 10 }, (_, i) => sample(i * 5))
  const withGap = [...beforeGap, sample(45 + 900)]
  assert.equal(generateInsights({ T0: withGap.slice(1) }, []).length, 0)
  assert.deepEqual(Array.from(generateInsights({ T0: withGap }, []), i => i.id), ['gap-T0-10'])
  assert.equal(generateInsights({ T0: [...beforeGap, sample(45 + 899)] }, []).length, 0)
  const halfHour = Array.from({ length: 361 }, (_, i) => sample(i * 5))
  assert.equal(generateInsights({ T0: halfHour.slice(0, -1) }, []).some(i => i.id === 'dwell-T0'), false)
  assert.equal(generateInsights({ T0: halfHour }, []).some(i => i.id === 'dwell-T0'), true)
})

test('low movement works without zones and still requires two observed hours', () => {
  const { analyzePeriod: withoutZones } = load('src/lib/insights.ts', {
    '../config': { ZONES: [], zoneAt: () => null, zoneName: id => id },
  })
  const stationary = Array.from({ length: 1441 }, (_, i) => sample(i * 5))
  const result = withoutZones({ T0: stationary }, []).insights
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'low-T0')
  assert.equal(withoutZones({ T0: stationary.slice(0, -1) }, []).insights.length, 0)
})

test('period summaries retain empty and limited tags and exclude gaps from observed time', () => {
  const result = analyzePeriod({ empty: [], one: [sample(0)], gap: [sample(0), sample(5), sample(900)] }, [])
  assert.deepEqual(Array.from(result.summaries, s => [s.tag, s.count, s.stats.durationS]), [
    ['empty', 0, 0], ['one', 1, 0], ['gap', 3, 5],
  ])
  assert.equal(result.insights.length, 0)
})

test('samples in the same minute without temporal overlap do not establish co-presence', () => {
  const a = [], b = []
  for (let minute = 0; minute < 60; minute++) {
    a.push(sample(minute * 60), sample(minute * 60 + 5))
    b.push(sample(minute * 60 + 50), sample(minute * 60 + 55))
  }
  assert.equal(generateInsights({ T0: a, T1: b }, []).some(i => i.id.startsWith('co-')), false)
})

test('co-presence uses overlapping seconds and makes no habitual-baseline claim', () => {
  const a = Array.from({ length: 361 }, (_, i) => sample(i * 5))
  const b = Array.from({ length: 361 }, (_, i) => sample(i * 5 + 60))
  const insight = generateInsights({ T0: a, T1: b }, []).find(i => i.id === 'co-T0-T1')
  assert.ok(insight)
  assert.match(insight.detail, /29 min/)
  assert.doesNotMatch(insight.title, /habitual/)
})
