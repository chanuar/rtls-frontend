import { test, expect, type Page, type WebSocketRoute } from '@playwright/test'

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
  const sockets = new Set<WebSocketRoute>()
  await page.routeWebSocket('**/ws/positions', socket => {
    sockets.add(socket)
    socket.onClose(() => sockets.delete(socket))
  })
  await page.goto('/tests/browser/harness.html')
  await expect(page.getByRole('button', { name: 'T0 T0', exact: false })).toBeVisible()
  return sockets
}

test('analysis cancels abandoned periods and sibling requests after an error, then retries', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const signals: AbortSignal[] = [], original = window.fetch
    window.fetch = (input, init) => {
      if (String(input).includes('/positions/')) signals.push(init!.signal!)
      return original(input, init)
    }
    Object.assign(window, { analysisSignals: signals })
  })
  const pending: import('@playwright/test').Route[] = []
  await page.route('**/positions/*', route => { pending.push(route) })
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  for (const action of ['period', 'leave', 'error']) {
    await page.getByRole('button', { name: 'Analizar periodo' }).click()
    await expect.poll(() => pending.length).toBe(2)
    expect(await page.evaluate(() => (window as any).analysisSignals.slice(-2).every((s: AbortSignal) => !s.aborted))).toBe(true)
    if (action === 'period') await page.getByRole('button', { name: 'Ayer', exact: true }).click()
    else if (action === 'leave') {
      await page.getByRole('button', { name: 'Plano', exact: true }).click()
      await page.getByRole('button', { name: 'Análisis', exact: true }).click()
    } else {
      await pending.shift()!.fulfill({ status: 503 })
      await expect(page.getByRole('alert')).toContainText('503')
    }
    await expect.poll(() => page.evaluate(() => (window as any).analysisSignals.every((s: AbortSignal) => s.aborted))).toBe(true)
    for (const route of pending.splice(0)) await route.fulfill({ json: samples })
    await expect(page.getByRole('button', { name: 'Analizar periodo' })).toBeEnabled()
    await expect(page.getByRole('table')).toHaveCount(0)
    if (action !== 'error') await expect(page.getByRole('alert')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Hoy', exact: true }).click()
  await page.route('**/positions/*', route => route.fulfill({ json: samples }))
  await page.getByRole('button', { name: 'Analizar periodo' }).click()
  await expect(page.getByRole('table')).toContainText('10 s')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('analysis summaries distinguish empty, limited and sufficient observed data', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  if (process.env.TEST_LAYOUT === 'true') await expect(page.getByText(/Sin zonas configuradas/)).toBeVisible()
  for (const [count, step, message, duration, stops] of [
    [0, 1, 'Sin datos: no hay posiciones', '0 s', '—'],
    [1, 1, 'Datos insuficientes', '0 s', '—'],
    [61, 1, 'Datos insuficientes', '1 min', '1'],
    [361, 5, 'Sin hallazgos en las comprobaciones disponibles', '30 min', '1'],
  ] as const) {
    const data = Array.from({ length: count }, (_, i) => ({ ...samples[0],
      ts: new Date(today.getTime() - 3600000 + i * step * 1000).toISOString(), x: -1, y: -1,
    }))
    await page.route('**/positions/*', route => route.fulfill({ json: data }))
    await page.getByRole('button', { name: 'Analizar periodo' }).click()
    await expect(page.getByText(message, { exact: false })).toBeVisible()
    const cells = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^T0/ }) }).getByRole('cell')
    await expect(cells).toHaveText([String(count), duration, count > 1 ? '0.0 m' : '—', stops])
  }
})

test('real React loads history, changes identity and cleans up StrictMode resources', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const sockets = await setup(page)
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Posición temporal' })).toBeVisible()
  await page.getByRole('button', { name: 'T1 T1', exact: false }).click()
  await expect(page.getByRole('slider')).toHaveCount(0)
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Analizar periodo' })).toBeVisible()
  await expect.poll(() => sockets.size).toBe(1)
  expect(await page.evaluate(() => (window as any).activeIntervals.size)).toBeGreaterThan(0)
  await page.evaluate(() => (window as any).unmountApp())
  await expect.poll(() => page.evaluate(() => (window as any).activeIntervals.size)).toBe(0)
  await expect.poll(() => sockets.size).toBe(0)
  expect(errors).toEqual([])
})

for (const resource of ['anchors', 'tags']) {
  test(`startup ${resource} error stays visible during retries until the backend recovers`, async ({ page }) => {
    await page.clock.install({ time: today })
    await page.clock.pauseAt(today)
    let hold = false
    const pending: import('@playwright/test').Route[] = []
    const tags = [{ id: 'T0', employee: 'Ana', active: true }]
    await page.route('http://127.0.0.1:8000/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === `/${resource}`) {
        if (hold) { pending.push(route); return }
        return route.abort('connectionrefused')
      }
      return route.fulfill({ json: path === '/tags' ? tags : [] })
    })
    const sockets = new Set<WebSocketRoute>()
    await page.routeWebSocket('**/ws/positions', socket => { sockets.add(socket) })
    await page.goto('/tests/browser/harness.html')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Comprueba la conexión con el backend')
    const message = await alert.textContent()
    const bounds = await page.getByRole('region', { name: 'Plano desplazable' }).boundingBox()
    hold = true
    for (let i = 0; i < 3; i++) {
      await page.clock.runFor(2000)
      await expect.poll(() => pending.length).toBe(1)
      await expect(alert).toHaveText(message!)
      expect(await page.getByRole('region', { name: 'Plano desplazable' }).boundingBox()).toEqual(bounds)
      expect(sockets.size).toBe(0)
      const response = page.waitForEvent(i < 2 ? 'requestfailed' : 'requestfinished',
        request => new URL(request.url()).pathname === `/${resource}`)
      const route = pending.shift()!
      if (i < 2) await route.abort('connectionrefused')
      else await route.fulfill({ json: resource === 'tags' ? tags : [] })
      await response
      if (i < 2) await expect(alert).toHaveText(message!)
    }
    await expect(page.getByRole('button', { name: /Ana/ })).toBeVisible()
    await expect(alert).toHaveCount(0)
    await expect.poll(() => sockets.size).toBe(1)
  })
}

test('catalogue error remains visible through anchor refreshes until tags recover', async ({ page }) => {
  const sockets = await setup(page)
  let fail = true, requests = 0
  await page.route('**/tags', route => {
    requests++
    return fail ? route.fulfill({ status: 503 })
      : route.fulfill({ json: [{ id: 'T0', employee: 'Ana', active: true }] })
  })
  sockets.values().next().value!.close()
  await page.clock.runFor(2100)
  await expect(page.getByRole('alert')).toContainText('503')
  const failedRequests = requests
  await page.clock.runFor(5000)
  await expect.poll(() => requests).toBeGreaterThan(failedRequests)
  await expect(page.getByRole('alert')).toContainText('503')
  fail = false
  await page.clock.runFor(5000)
  await expect(page.getByRole('button', { name: /Ana/ })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('invalid live messages explain rejection and cannot block the next valid position', async ({ page }) => {
  const sockets = await setup(page)
  await expect.poll(() => sockets.size).toBe(1)
  const send = (ts: string) => sockets.values().next().value!.send(JSON.stringify({ tag: 'T0', ts, x: 1, y: 2, quality: 0.1, n_anchors: 4 }))
  sockets.values().next().value!.send('not json')
  await expect(page.getByRole('alert')).toContainText('JSON inválido')
  send('2026-02-30T12:00:00Z')
  await expect(page.getByRole('alert')).toContainText('fecha con zona horaria')
  send('2026-09-13T12:00:00')
  await expect(page.getByRole('alert')).toContainText('fecha con zona horaria')
  send('2026-09-14T12:00:00Z')
  await expect(page.getByRole('alert')).toContainText('futuro')
  await expect(page.getByRole('button', { name: 'Seleccionar T0', exact: true })).toHaveCount(0)
  send('2026-09-13T12:00:00Z')
  await expect(page.getByRole('button', { name: 'Seleccionar T0', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('history distinguishes idle, loading, empty, single-sample, ready and error states', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Selecciona un tag' })).toBeVisible()
  let count = 0, release = () => {}
  await page.route('**/positions/*', async route => {
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: samples.slice(0, count) })
  })
  for (const [size, message] of [[0, 'No hay posiciones'], [1, 'Solo hay una muestra']] as const) {
    count = size
    await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Cargando jornada' })).toBeVisible()
    release()
    await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible()
    await expect(page.getByRole('slider')).toHaveCount(0)
    await expect(page.getByRole('complementary')).not.toContainText('0 m')
  }
  await page.screenshot({ path: 'tmp/fix-single-sample.png', fullPage: true })
  count = 2
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cargando jornada' })).toBeVisible()
  release()
  await expect(page.getByRole('slider')).toBeVisible()
  await page.route('**/positions/*', route => route.fulfill({ status: 503 }))
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('slider')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Selecciona un tag' })).toHaveCount(0)
})

test('loading history from live announces success and opens the existing result with keyboard focus', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  const confirmation = page.getByRole('status').filter({ hasText: 'Histórico cargado de T0: 3 muestras.' })
  await expect(confirmation).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Posiciones actuales' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Mapa de calor del periodo' }).check()
  await expect(page.getByRole('group', { name: 'Escala del mapa de calor' })).toContainText('Sin muestras')
  await expect(confirmation).toBeVisible()
  const open = page.getByRole('button', { name: 'Ver histórico', exact: true })
  await open.focus()
  await open.press('Enter')
  await expect(page.getByRole('heading', { name: 'Recorrido del periodo' })).toBeFocused()
  await expect(page.getByRole('slider')).toBeVisible()
  await page.getByRole('button', { name: 'En vivo', exact: true }).click()
  await page.getByRole('button', { name: 'T1 T1', exact: false }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(open).toHaveCount(0)
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

test('replay pauses when switching to live or analysis and stays paused on return', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await page.getByRole('button', { name: '×1', exact: true }).click()
  for (const destination of ['En vivo', 'Análisis']) {
    await page.getByRole('button', { name: 'Reproducir jornada' }).click()
    await page.clock.runFor(150)
    await page.getByRole('button', { name: destination, exact: true }).click()
    await page.clock.runFor(1000)
    await page.getByRole('button', { name: 'Plano', exact: true }).click()
    await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pausar reproducción' })).toHaveCount(0)
    const slider = page.getByRole('slider')
    if (await slider.count()) {
      const cursor = await slider.inputValue()
      await page.clock.runFor(1000)
      await expect(slider).toHaveValue(cursor)
    }
  }
})

test('replay can finish and play again in StrictMode without impure updater warnings', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await setup(page)
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  const slider = page.getByRole('slider')
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Reproducir jornada' }).click()
    await expect(page.getByRole('button', { name: 'Pausar reproducción' })).toBeVisible()
    await expect(slider).toHaveValue(String(Date.parse(samples[0].ts)))
    await page.clock.runFor(1000)
    await expect(page.getByRole('button', { name: 'Reproducir jornada' })).toBeVisible()
    await expect(slider).toHaveValue(String(Date.parse(samples.at(-1)!.ts)))
  }
  expect(errors).toEqual([])
})

test('freshness, recovery and label placement work in the real SVG', async ({ page }) => {
  await page.addInitScript(() => {
    const measure = SVGTextElement.prototype.getComputedTextLength
    Object.assign(window, { labelMeasurements: 0 })
    SVGTextElement.prototype.getComputedTextLength = function () {
      ;(window as any).labelMeasurements++
      return measure.call(this)
    }
  })
  const sockets = await setup(page)
  const send = async (x: number) => {
    const ts = await page.evaluate(() => new Date().toISOString())
    sockets.values().next().value!.send(JSON.stringify({ tag: 'T0', ts, x, y: 2, quality: 0.1, n_anchors: 4 }))
  }
  await page.clock.runFor(200)
  await send(27.5)
  const marker = page.locator('svg [role="button"]').first()
  await expect(marker).toHaveAttribute('aria-label', 'Seleccionar T0')
  await expect(marker.locator('.tag-pulse')).toHaveCount(1)
  const original = await marker.getAttribute('transform')
  const measurements = await page.evaluate(() => (window as any).labelMeasurements)
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => (window as any).labelMeasurements)).toBe(measurements)
  await page.clock.runFor(11000)
  await expect(marker).toHaveAttribute('aria-label', /Última posición/)
  await expect(marker).toHaveAttribute('transform', original!)
  await expect(marker.locator('.tag-pulse')).toHaveCount(0)
  const labelFits = await marker.locator('text').evaluate(node => {
    const text = node as SVGTextElement, svg = text.ownerSVGElement!
    const box = text.getBBox(), matrix = text.parentElement!.getAttribute('transform')!.match(/translate\(([^ ]+)/)!
    return Number(matrix[1]) + box.x >= 0 && Number(matrix[1]) + box.x + box.width <= svg.viewBox.baseVal.width
  })
  expect(labelFits).toBe(true)
  await send(2)
  await expect(marker).toHaveAttribute('aria-label', 'Seleccionar T0')
  sockets.values().next().value!.close()
  await expect(marker).toHaveAttribute('aria-label', /Última posición/)
  await expect(marker).toHaveCount(1)
})

test('changing the period while history loads discards the previous response', async ({ page }) => {
  await setup(page)
  let release: () => void = () => {}, requested = false
  await page.route('**/positions/T0?*', async route => {
    requested = true
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: samples })
  })
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Ayer', exact: true }).click()
  const response = page.waitForResponse('**/positions/T0?*')
  release()
  await response
  await expect(page.getByRole('slider')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cargar jornada', exact: true })).toBeEnabled()
})

test('live positions and replay ticks do not rerender the shell, period picker or analysis', async ({ page }) => {
  await page.addInitScript(() => {
    const renders: Record<string, number> = {}, latest: Record<string, number> = {}
    Object.assign(window, {
      componentRenders: renders,
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        supportsFiber: true, renderers: new Map(), inject() { return 1 },
        onCommitFiberRoot(_id: number, root: any) {
          const visit = (fiber: any) => {
            if (!fiber) return
            const name = fiber.type?.name
            // React's development Profiler records start times; bit 1 marks performed work.
            if (name && (fiber.flags & 1) && fiber.actualStartTime > (latest[name] ?? -1)) {
              renders[name] = (renders[name] ?? 0) + 1
              latest[name] = fiber.actualStartTime
            }
            visit(fiber.child); visit(fiber.sibling)
          }
          visit(root.current)
        },
      },
    })
  })
  const sockets = await setup(page)
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  const before = await page.evaluate(() => ({ ...(window as any).componentRenders }))
  expect(before.InsightsPage).toBeGreaterThan(0)
  for (let i = 0; i < 5; i++) {
    await page.clock.runFor(200)
    sockets.values().next().value!.send(JSON.stringify({ tag: 'T0', ts: await page.evaluate(() => new Date().toISOString()), x: i, y: 2, quality: 0.1, n_anchors: 4 }))
    await expect(page.locator('.tag-status').first()).toHaveText('En vivo')
  }
  const after = await page.evaluate(() => ({ ...(window as any).componentRenders }))
  for (const name of ['App', 'Workspace', 'InsightsPage', 'PeriodPicker']) expect(after[name], name).toBe(before[name])
  expect(after.TagList).toBeGreaterThan(before.TagList)
  await page.getByRole('button', { name: 'Plano', exact: true }).click()
  await page.getByRole('button', { name: 'Reproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Cargar jornada', exact: true }).click()
  await page.getByRole('button', { name: '×1', exact: true }).click()
  await page.getByRole('button', { name: 'Reproducir jornada' }).click()
  const playing = await page.evaluate(() => ({ ...(window as any).componentRenders }))
  await page.clock.runFor(500)
  const played = await page.evaluate(() => ({ ...(window as any).componentRenders }))
  for (const name of ['App', 'Workspace', 'PeriodPicker']) expect(played[name], name).toBe(playing[name])
  expect(played.ReplayMap).toBeGreaterThan(playing.ReplayMap)
})
