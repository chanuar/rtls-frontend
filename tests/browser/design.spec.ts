import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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

test('map controls, replay time and analysis results expose accessible state without decorative motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const sockets = await openApp(page)
  sockets.values().next().value!.send(JSON.stringify({ tag: 'T0', ts: '2026-09-13T12:00:00Z', x: 1, y: 2, quality: 0.1, n_anchors: 4 }))
  const map = page.getByRole('group', { name: /posiciones/ })
  const marker = map.getByRole('button', { name: 'Seleccionar T0', exact: true })
  await marker.focus()
  await marker.press('Space')
  await expect(marker).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('.tag-pulse').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  expect(await page.locator('.animate-pulse').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  await page.route('**/positions/*', route => route.fulfill({ json: [0, 5, 10].map(second => ({
    ts: new Date(Date.parse('2026-09-13T11:59:00Z') + second * 1000).toISOString(), x: second / 5, y: 2, quality: 0.1, n_anchors: 4,
  })) }))
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  const slider = page.getByRole('slider', { name: 'Posición temporal' })
  await slider.focus()
  await slider.press('End')
  await expect(slider).toHaveAttribute('aria-valuetext', /13 de septiembre de 2026.*12:59:10/)
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  await page.getByRole('button', { name: 'Analizar periodo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Análisis finalizado' })).toContainText('2 tags, 6 muestras')
  await page.route('**/positions/*', route => route.fulfill({ status: 500 }))
  await page.getByRole('button', { name: 'Analizar periodo' }).click()
  await expect(page.getByRole('alert')).toContainText('500')
})

test('themes follow the system, persist explicit choices and apply before React loads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openApp(page)
  const select = page.getByRole('combobox', { name: 'Tema' })
  await expect(select).toHaveValue('system')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 24, 21)')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 243, 236)')
  await select.selectOption('dark')
  await expect(page.getByLabel('Desde', { exact: true })).toHaveCSS('color-scheme', 'dark')
  await page.reload()
  await expect(select).toHaveValue('dark')
  await page.route('**/src/main.tsx', route => route.abort())
  await page.reload()
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark')
  await page.unroute('**/src/main.tsx')
  await page.reload()
  await select.selectOption('system')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 243, 236)')
})

test('theme selection remains usable when local storage is blocked', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
  })
  await openApp(page)
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 24, 21)')
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 243, 236)')
  expect(errors).toEqual([])
})

for (const theme of ['light', 'dark']) {
  test(`readable text contrast in the ${theme} theme`, async ({ page }) => {
    await openApp(page)
    await page.getByRole('combobox', { name: 'Tema' }).selectOption(theme)
    const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })) }))).toEqual([])
  })
}
