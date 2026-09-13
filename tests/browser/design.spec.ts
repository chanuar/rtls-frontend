import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ timezoneId: 'Atlantic/Canary' })

async function openApp(page: Page) {
  await page.clock.install({ time: new Date('2026-09-13T12:00:00Z') })
  await page.route('http://127.0.0.1:8000/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path === '/anchors' ? [[0, 0], [0, 5.86], [28, 0], [28, 5.86]].map(([x, y], i) => ({ id: `A${i}`, x, y, z: 3, description: null }))
      : path === '/tags' ? [{ id: 'T0', employee: 'Ana', active: true }, { id: 'T1', employee: 'Luis', active: true }]
        : path === '/heatmap' ? { cell: 0.5, bins: [4, 10, 11].map(cy => ({ cx: 4, cy, count: 20 })) } : []
    return route.fulfill({ json })
  })
  const sockets = new Set<WebSocketRoute>()
  await page.routeWebSocket('**/ws/positions', socket => { sockets.add(socket); socket.onClose(() => sockets.delete(socket)) })
  await page.goto('/')
  if (!await page.locator('.sidebar details').evaluate(node => (node as HTMLDetailsElement).open)) {
    await page.locator('.filter-summary').click()
  }
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

test('multi-day replay and signal gaps display both local dates', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: '7 días', exact: true }).click()
  const samples = [...Array.from({ length: 11 }, (_, i) => new Date(Date.parse('2026-09-08T12:00:00Z') + i * 5000).toISOString()), '2026-09-09T12:00:00Z']
    .map(ts => ({ ts, x: 1, y: 2, quality: 0.1, n_anchors: 4 }))
  await page.route('**/positions/*', route => route.fulfill({ json: samples }))
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByText('8/9/26, 13:00:00', { exact: true })).toBeVisible()
  await expect(page.getByText('9/9/26, 13:00:00', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'tmp/fix-multiday-replay.png', fullPage: true })
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  await page.getByRole('button', { name: 'Analizar periodo' }).click()
  await expect(page.getByText(/Entre 8\/9\/26.*9\/9\/26/).first()).toBeVisible()
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

test('history summary identifies the local period and observed coverage without live metrics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await page.getByLabel('Desde', { exact: true }).fill('2026-09-12T23:55')
  await page.getByLabel('Hasta', { exact: true }).fill('2026-09-13T13:00')
  await page.route('**/positions/*', route => route.fulfill({ json: [0, 5, 1200, 1205].map(second => ({
    ts: new Date(Date.parse('2026-09-13T10:00:00Z') + second * 1000).toISOString(), x: 1, y: 2, quality: 0.1, n_anchors: 4,
  })) }))
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  const summary = page.getByRole('group', { name: 'Resumen del histórico' })
  await expect(summary).toContainText('Sin histórico cargado')
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(summary).toContainText('Ana')
  await expect(summary).toContainText('4 muestras')
  await expect(summary).toContainText('10 s')
  await expect(summary).toContainText('12/9/26, 23:55')
  await expect(summary.locator('time').first()).toHaveAttribute('datetime', '2026-09-12T22:55:00.000Z')
  await expect(page.getByRole('group', { name: 'Resumen del sistema' })).toHaveCount(0)
  await page.locator('.filter-summary').click()
  await expect(summary).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'tmp/history-summary-mobile.png', fullPage: true })
  await page.locator('.filter-summary').click()
  await page.getByRole('button', { name: /Luis/ }).click()
  await expect(summary).toContainText('Luis')
  await expect(summary).toContainText('Sin histórico cargado')
  await expect(summary).not.toContainText('4 muestras')
  await page.getByLabel('Desde', { exact: true }).fill('')
  await expect(summary).toContainText('Desde pendiente')
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
  test(`accessible live, stale, replay and analysis states in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const sockets = await openApp(page)
    await page.getByRole('combobox', { name: 'Tema' }).selectOption(theme)
    const contrast = await page.evaluate(() => {
      const probe = document.createElement('span')
      document.body.append(probe)
      function luminance(variable: string) {
        probe.style.color = `var(--${variable})`
        const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
          .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      }
      const background = luminance('map-zone')
      const ratios = ['color-muted', 'color-accent', 'color-ok', 'color-warn', 'color-danger', 'map-path', 'map-zone-line', ...[1, 2, 3, 4, 5, 6].map(i => `tag-${i}`)]
        .map(token => { const ink = luminance(token); return { token, ratio: (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05) } })
      probe.remove()
      return ratios
    })
    for (const { token, ratio } of contrast) expect(ratio, token).toBeGreaterThanOrEqual(token.startsWith('map-') ? 3 : 4.5)
    async function audit(state: string) {
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })) })), state).toEqual([])
      await page.screenshot({ path: `tmp/design-${theme}-${state}.png`, fullPage: true })
    }
    await audit('empty')
    sockets.values().next().value!.send(JSON.stringify({ tag: 'T0', ts: await page.evaluate(() => new Date().toISOString()), x: 3, y: 2, quality: 0.1, n_anchors: 4 }))
    await expect(page.getByRole('button', { name: 'Seleccionar T0', exact: true })).toBeVisible()
    await audit('live')
    await page.clock.runFor(11000)
    await audit('stale')
    await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
    await page.route('**/positions/*', route => route.fulfill({ json: [0, 5, 10].map(second => ({
      ts: new Date(Date.parse('2026-09-13T11:59:00Z') + second * 1000).toISOString(), x: second / 5, y: 2, quality: 0.1, n_anchors: 4,
    })) }))
    await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
    await page.getByRole('checkbox').check()
    await expect(page.getByRole('slider')).toBeVisible()
    await expect(page.getByText('Más muestras')).toBeVisible()
    await audit('replay-heat')
    await page.getByRole('button', { name: 'Ver detalle' }).click()
    await audit('detail')
    await page.getByRole('button', { name: 'Análisis', exact: true }).click()
    await page.getByRole('button', { name: 'Analizar periodo' }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await audit('analysis')
    await page.route('**/positions/*', route => route.fulfill({ status: 500 }))
    await page.getByRole('button', { name: 'Analizar periodo' }).click()
    await expect(page.getByRole('alert')).toContainText('500')
    await audit('error')
    await page.setViewportSize({ width: 390, height: 844 })
    await audit('mobile-error')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
}

for (const width of [1440, 1024, 390]) {
  test(`map labels and selection targets stay legible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const sockets = await openApp(page)
    if (width < 801) await page.locator('.filter-summary').click()
    for (const [tag, x] of [['T0', 0.1], ['T1', 27.8]] as const) {
      sockets.values().next().value!.send(JSON.stringify({ tag, ts: '2026-09-13T12:00:00Z', x, y: 2, quality: 0.1, n_anchors: 4 }))
    }
    await expect(page.locator('.tag-hit-target')).toHaveCount(2)
    await expect.poll(() => page.locator('.tag-hit-target').first().evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(31)
    const textSizes = await page.locator('svg text').evaluateAll(nodes => nodes.map(node =>
      parseFloat(getComputedStyle(node).fontSize) * Math.hypot((node as SVGTextElement).getScreenCTM()!.a, (node as SVGTextElement).getScreenCTM()!.b)))
    expect(Math.min(...textSizes)).toBeGreaterThan(11.8)
    await page.getByRole('button', { name: 'Ver detalle' }).click()
    await expect(page.locator('.map-stage')).toHaveAttribute('data-view', 'detail')
    expect(await page.locator('svg').evaluate(node => node.clientWidth)).toBeGreaterThan(1800)
    const tag = page.getByRole('button', { name: /^Seleccionar T1/ })
    await tag.focus()
    await tag.press('Enter')
    await expect(tag).toHaveAttribute('aria-pressed', 'true')
    await expect(tag.locator('.tag-focus-ring')).toHaveCSS('visibility', 'visible')
    await expect.poll(() => page.locator('.map-stage').evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
    await page.clock.runFor(11000)
    await expect(tag).toHaveAttribute('aria-label', /Última posición/)
    await page.screenshot({ path: `tmp/design-detail-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Ajustar plano' }).click()
    await expect(page.locator('.map-stage')).toHaveAttribute('data-view', 'fit')
    expect(await page.locator('svg').evaluate(node => node.clientWidth)).toBeLessThan(width)
    await page.screenshot({ path: `tmp/design-fit-${width}.png`, fullPage: true })
  })
}

test('mobile filters precede the map in visual and keyboard order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  const sidebar = await page.getByRole('complementary').boundingBox()
  const main = await page.getByRole('main').boundingBox()
  expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(main!.y)
  const tag = page.getByRole('button', { name: /Luis/ })
  await tag.focus()
  await tag.press('Enter')
  await tag.press('Tab')
  await expect(page.getByRole('button', { name: 'Hoy', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Ayer', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '7 días', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Desde', { exact: true })).toBeFocused()
  await page.getByLabel('Desde', { exact: true }).fill('2026-09-12T09:00')
  await page.getByLabel('Hasta', { exact: true }).fill('2026-09-12T10:00')
  await page.route('**/positions/*', route => route.fulfill({ json: [0, 5].map(second => ({
    ts: new Date(Date.parse('2026-09-12T08:30:00Z') + second * 1000).toISOString(), x: 1, y: 2, quality: 0.1, n_anchors: 4,
  })) }))
  const load = page.getByRole('button', { name: 'Cargar jornada', exact: true })
  await load.focus()
  const request = page.waitForRequest('**/positions/T1?*')
  await load.press('Enter')
  await request
  await load.press('Tab')
  await expect(page.getByRole('checkbox')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Ver histórico', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Ajustar plano' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.locator('.filter-summary').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /Luis/ })).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Ver histórico', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Ajustar plano' })).toBeFocused()
})

for (const width of [320, 640]) {
  test(`controls and map reflow at ${width} CSS pixels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await openApp(page)
    await expect(page.getByLabel('Desde', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.locator('.filter-summary').click()
    await page.getByRole('button', { name: 'Ver detalle' }).click()
    const stage = page.getByRole('region', { name: 'Plano desplazable' })
    await stage.focus()
    await stage.press('ArrowRight')
    await page.clock.runFor(500)
    await expect.poll(() => stage.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `tmp/design-reflow-${width}.png`, fullPage: true })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
  })
}
