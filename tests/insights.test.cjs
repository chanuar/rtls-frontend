const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const { generateInsights } = load('src/lib/insights.ts')
const sample = seconds => ({ ts: new Date(seconds * 1000).toISOString(), x: 1, y: 1, quality: 0.1, n_anchors: 4 })

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
