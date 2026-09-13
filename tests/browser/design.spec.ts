import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'

test.use({ timezoneId: 'Atlantic/Canary' })

async function openApp(page: Page) {
  await page.clock.install({ time: new Date('2026-09-13T12:00:00Z') })
  await page.route('http://127.0.0.1:8000/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path === '/anchors' ? [[0, 0], [0, 5.86], [28, 0], [28, 5.86]].map(([x, y], i) => ({ id: `A${i}`, x, y, z: 3, description: null }))
      : path === '/tags' ? [{ id: 'T0', employee: 'Ana', active: true }, { id: 'T1', employee: 'Luis', active: true }]
        : path === '/heatmap' ? { cell: 0.5, bins: [{ cx: 4, cy: 4, count: 20 }] } : []
    return route.fulfill({ json })
  })
  const sockets = new Set<WebSocketRoute>()
  await page.routeWebSocket('**/ws/positions', socket => { sockets.add(socket); socket.onClose(() => sockets.delete(socket)) })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Ana/ })).toBeVisible()
  return sockets
}

test('native dates expose labels, accept keyboard changes and send local ranges as UTC', async ({ page }) => {
  await openApp(page)
  const start = page.getByLabel('Desde', { exact: true }), end = page.getByLabel('Hasta', { exact: true })
  await start.fill('2026-08-31T23:30')
  await end.fill('2026-09-01T00:30')
  const request = page.waitForRequest('**/positions/T0?*')
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  const query = new URL((await request).url()).searchParams
  expect(query.get('start')).toBe('2026-08-31T22:30:00.000Z')
  expect(query.get('end')).toBe('2026-08-31T23:30:00.000Z')
  await start.focus()
  await start.press('ArrowUp')
  await expect(start).not.toHaveValue('2026-08-31T23:30')
  await start.fill('')
  await expect(page.getByRole('alert').filter({ hasText: 'Completa ambas fechas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cargar jornada', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Analizar periodo' })).toBeDisabled()
  await page.getByRole('button', { name: 'Hoy', exact: true }).click()
  await expect(start).toHaveValue('2026-09-13T00:00')
  await expect(page.getByRole('button', { name: 'Analizar periodo' })).toBeEnabled()
})
