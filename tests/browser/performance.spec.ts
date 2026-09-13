import { test, expect } from '@playwright/test'

test('profile seven days of replay without rebuilding the full progressive path', async ({ page }, info) => {
  await page.goto('/tests/browser/benchmark.html')
  await expect(page.getByRole('button', { name: 'Avanzar' })).toBeVisible()
  await page.evaluate(() => {
    const lengths: number[] = []
    new MutationObserver(records => records.forEach(record => lengths.push((record.target as Element).getAttribute('d')!.length)))
      .observe(document.querySelector('svg')!, { subtree: true, attributes: true, attributeFilter: ['d'] })
    Object.assign(window, { changedPathLengths: lengths })
  })
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Avanzar' }).click()
  const timings: number[] = await page.evaluate(() => (window as any).benchmarkTimings.slice(1))
  const sorted = timings.toSorted((a, b) => a - b)
  const report = { samples: 120961, ticks: timings.length, medianRenderMs: sorted[Math.floor(sorted.length / 2)], maxRenderMs: Math.max(...timings) }
  console.log(JSON.stringify(report))
  await info.attach('replay-profile', { body: JSON.stringify(report), contentType: 'application/json' })
  expect(timings.length).toBe(20)
  const changedLengths: number[] = await page.evaluate(() => (window as any).changedPathLengths)
  expect(changedLengths.length).toBeGreaterThan(0)
  expect(Math.max(...changedLengths)).toBeLessThan(15000)
})
