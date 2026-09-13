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

test('analysis renders summaries and distinguishes empty, limited and sufficient data without zones', async () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  for (const [samples, message, duration, stops] of [
    [[], 'Sin datos: no hay posiciones', '0 s', '—'],
    [[sample(0)], 'Datos insuficientes', '0 s', '—'],
    [Array.from({ length: 61 }, (_, i) => sample(i)), 'Datos insuficientes', '1 min', '1'],
    [Array.from({ length: 361 }, (_, i) => sample(i * 5)), 'Sin hallazgos en las comprobaciones disponibles', '30 min', '1'],
  ]) {
    const state = []
    let index = 0
    const { InsightsPage } = load('src/components/Insights.tsx', {
      react: { useState(initial) {
        const key = index++
        if (!(key in state)) state[key] = initial
        return [state[key], value => { state[key] = value }]
      } },
      '../config': { ZONES: [], zoneAt: () => null, zoneName: id => id, tagColor: () => '#fff' },
      '../lib/api': { fetchPositions: async () => samples },
    })
    const props = { status: 'online', tags: [{ id: 'T0' }], tagIds: ['T0'],
      period: { start: new Date(0), end: new Date(7200000) } }
    const initial = InsightsPage(props)
    await initial.props.children[0].props.children[1].props.onClick()
    // The click handler intentionally returns void; settle the fetch and Promise.all.
    await new Promise(done => setImmediate(done))
    index = 0
    const html = renderToStaticMarkup(InsightsPage(props))
    assert.ok(html.includes(message), message)
    assert.ok(html.includes('Sin zonas configuradas'))
    assert.ok(html.includes('Tiempo observado'))
    assert.ok(html.includes(`>${samples.length}</td>`))
    assert.ok(html.includes(`>${duration}</td>`))
    assert.ok(html.includes(`>${stops}</td>`))
    assert.ok(!html.includes('dentro de lo esperado'))
  }
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
