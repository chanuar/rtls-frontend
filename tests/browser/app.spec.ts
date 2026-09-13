import { test, expect, type Page } from '@playwright/test'

const today = new Date('2026-09-13T12:00:00Z')
const samples = [0, 5, 10].map((seconds, i) => ({
  ts: new Date(today.getTime() - 60000 + seconds * 1000).toISOString(), x: 1 + i, y: 2, quality: 0.1, n_anchors: 4,
}))

async function setup(page: Page) {
  await page.clock.install({ time: today })
  await page.route('http://127.0.0.1:8000/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path === '/anchors' ? [] : path === '/tags'
      ? ['T0', 'T1'].map(id => ({ id, employee: null, active: true }))
      : path.startsWith('/positions/') ? samples : { cell: 0.5, bins: [] }
    return route.fulfill({ json })
  })
  const sockets = new Set()
  await page.routeWebSocket('**/ws/positions', socket => {
    sockets.add(socket)
    socket.onClose(() => sockets.delete(socket))
  })
  await page.goto('/tests/browser/harness.html')
  await expect(page.getByRole('button', { name: 'T0 T0', exact: false })).toBeVisible()
  return sockets
}

test('real React loads history, changes identity and cleans up StrictMode resources', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const active = new Set<number>()
    const start = window.setInterval.bind(window), stop = window.clearInterval.bind(window)
    window.setInterval = ((...args: Parameters<typeof start>) => {
      const id = start(...args); active.add(id); return id
    }) as typeof window.setInterval
    window.clearInterval = id => { active.delete(id!); stop(id) }
    Object.assign(window, { activeIntervals: active })
  })
  const sockets = await setup(page)
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Posición temporal' })).toBeVisible()
  await page.getByRole('button', { name: 'T1 T1', exact: false }).click()
  await expect(page.getByRole('slider')).toHaveCount(0)
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Analizar periodo' })).toBeVisible()
  await expect.poll(() => sockets.size).toBe(1)
  await page.evaluate(() => (window as any).unmountApp())
  await expect.poll(() => page.evaluate(() => (window as any).activeIntervals.size)).toBe(0)
  await expect.poll(() => sockets.size).toBe(0)
  expect(errors).toEqual([])
})

test('history ignores an old response after changing tag or period', async ({ page }) => {
  await setup(page)
  let release: () => void = () => {}
  let started = false
  await page.route('**/positions/T0?*', async route => {
    started = true
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: samples })
  })
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect.poll(() => started).toBe(true)
  await page.getByRole('button', { name: 'T1 T1', exact: false }).click()
  release()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('slider')).toBeVisible()
  await page.getByRole('button', { name: 'Ayer', exact: true }).click()
  await expect(page.getByRole('slider')).toHaveCount(0)
})

test('optional heatmap failure leaves history and replay available', async ({ page }) => {
  await setup(page)
  let requests = 0
  await page.route('**/heatmap?*', route => { requests++; return route.fulfill({ status: 500 }) })
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('slider')).toBeVisible()
  expect(requests).toBe(0)
  await page.getByRole('checkbox', { name: 'Mapa de calor del periodo' }).check()
  await expect(page.getByRole('alert')).toContainText('Mapa de calor:')
  await expect(page.getByRole('slider')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cargar jornada', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Reproducir jornada' }).click()
  await expect(page.getByRole('button', { name: 'Pausar reproducción' })).toBeVisible()
  await page.getByRole('button', { name: 'T1 T1', exact: false }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('slider')).toHaveCount(0)
})

test('a delayed heatmap cannot attach to a different tag or period', async ({ page }) => {
  await setup(page)
  let release: () => void = () => {}, requested = false
  await page.route('**/heatmap?*', async route => {
    requested = true
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ status: 500 })
  })
  await page.getByRole('checkbox', { name: 'Mapa de calor del periodo' }).check()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await expect(page.getByRole('button', { name: 'Cargar jornada', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'T1 T1', exact: false }).click()
  await page.getByRole('button', { name: 'Ayer', exact: true }).click()
  const response = page.waitForResponse('**/heatmap?*')
  release()
  await response
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Cargando mapa de calor…')).toHaveCount(0)
})
