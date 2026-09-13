const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./load.cjs')
const { todayPeriod } = load('src/components/PeriodPicker.tsx')

test('today starts at local midnight and remains valid before 08:00 and at date boundaries', () => {
  for (const date of ['2026-09-13T07:00:00', '2026-09-13T08:00:00', '2027-01-01T00:00:00', '2026-10-25T00:00:01']) {
    const now = new Date(date), before = now.getTime()
    const { start, end } = todayPeriod(now)
    assert.equal(start.getDate(), now.getDate())
    assert.equal(start.getHours(), 0)
    assert.equal(start.getMinutes(), 0)
    assert.ok(end > start)
    assert.ok(Math.abs(end - now) <= 1)
    assert.equal(now.getTime(), before)
    assert.equal(Date.parse(end.toISOString()), end.getTime())
  }
})
