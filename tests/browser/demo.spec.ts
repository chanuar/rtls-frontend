import { test, expect } from '@playwright/test'

test('explicit demo retains six anchors, three tags and replay across navigation', async ({ page }) => {
  let requests = 0
  await page.clock.install({ time: new Date('2026-09-13T12:00:00Z') })
  await page.route('http://127.0.0.1:8000/**', route => { requests++; return route.abort() })
  await page.goto('/')
  await expect(page.locator('.connection-badge')).toHaveText('DEMO')
  await expect(page.locator('.overview')).toContainText('6 referencias')
  await page.clock.runFor(1000)
  await expect(page.locator('svg [role="button"]')).toHaveCount(3)
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('slider')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Mapa de calor del periodo' }).check()
  await expect(page.locator('.map-heading')).toContainText('mapa de calor')
  await page.getByRole('button', { name: 'Reproducir jornada' }).click()
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  await page.clock.runFor(1000)
  await page.getByRole('button', { name: 'Plano', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reproducir jornada' })).toBeVisible()
  expect(requests).toBe(0)
})
