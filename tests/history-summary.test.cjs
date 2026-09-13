const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { load } = require('./load.cjs')
const { HistoryOverview } = load('src/components/TrackingView.tsx')

test('history keeps the tag identity when an optional employee name is empty', () => {
  for (const employee of [null, '', '  ']) {
    const html = renderToStaticMarkup(React.createElement(HistoryOverview, {
      tag: { id: 'T0', employee, active: true }, period: { start: new Date(0), end: new Date(1000) }, sampleCount: null, durationS: null,
    }))
    assert.match(html, /<strong>T0<\/strong>/)
  }
})
