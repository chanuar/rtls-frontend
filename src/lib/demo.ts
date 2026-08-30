/**
 * Modo demo: cuando la API no responde, el frontend genera datos simulados
 * con la misma lógica que tools/simulator.py del backend, adaptada a la
 * planta real. Cada empleado demo tiene una zona "habitual" donde pasa la
 * mayor parte del tiempo, para que las recomendaciones de IA tengan material.
 */
import { DEMO_HOME_ZONES, FLOOR, ZONES } from '../config'
import type { Anchor, HeatBin, LivePosition, Sample, TagInfo } from '../types'
import type { Zone } from '../types'

export const DEMO_ANCHORS: Anchor[] = [
  { id: 'A1', x: 0.5, y: 0.5, z: 3, description: 'Fachada, izq.' },
  { id: 'A2', x: 0.5, y: 5.1, z: 3, description: 'Fachada, dcha.' },
  { id: 'A3', x: 14, y: 0.5, z: 3, description: 'Centro, izq.' },
  { id: 'A4', x: 14, y: 5.1, z: 3, description: 'Centro, dcha.' },
  { id: 'A5', x: 27.5, y: 0.5, z: 3, description: 'Fondo, izq.' },
  { id: 'A6', x: 27.5, y: 5.1, z: 3, description: 'Fondo, dcha.' },
]

export const DEMO_TAGS: TagInfo[] = [
  { id: 'T1', employee: 'Lucía M.', active: true },
  { id: 'T2', employee: 'Carlos R.', active: true },
  { id: 'T3', employee: 'Ana P.', active: true },
]

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

function randIn(zone: Zone | undefined): { x: number; y: number } {
  if (!zone) return { x: rand(0.8, FLOOR.depth - 0.8), y: rand(0.6, FLOOR.width - 0.6) }
  return { x: rand(zone.x + 0.3, zone.x + zone.w - 0.3), y: rand(zone.y + 0.3, zone.y + zone.h - 0.3) }
}

interface Walker {
  x: number
  y: number
  tx: number
  ty: number
  speed: number
  home?: Zone
  stickiness: number
}

function makeWalker(tagId: string): Walker {
  const home = ZONES.find((z) => z.id === DEMO_HOME_ZONES[tagId])
  const p = randIn(home)
  const t = randIn(home)
  return { x: p.x, y: p.y, tx: t.x, ty: t.y, speed: rand(0.6, 1.1), home, stickiness: 0.7 }
}

function newTarget(w: Walker): void {
  const useHome = w.home && Math.random() < w.stickiness
  const t = randIn(useHome ? w.home : undefined)
  w.tx = t.x
  w.ty = t.y
}

function stepWalker(w: Walker, dt: number): void {
  const dx = w.tx - w.x
  const dy = w.ty - w.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.25) {
    if (Math.random() < 0.2) newTarget(w)
    return
  }
  const step = Math.min(w.speed * dt, dist)
  w.x += (dx / dist) * step
  w.y += (dy / dist) * step
}

/** Arranca la simulación en vivo. Devuelve una función para pararla. */
export function startDemoLive(onPosition: (p: LivePosition) => void): () => void {
  const walkers = new Map(DEMO_TAGS.map((t) => [t.id, makeWalker(t.id)]))
  const id = window.setInterval(() => {
    for (const [tag, w] of walkers) {
      stepWalker(w, 1)
      onPosition({
        tag,
        ts: new Date().toISOString(),
        x: +(w.x + rand(-0.04, 0.04)).toFixed(3),
        y: +(w.y + rand(-0.04, 0.04)).toFixed(3),
        quality: +rand(0.03, 0.35).toFixed(3),
        n_anchors: Math.random() < 0.85 ? 6 : 4,
      })
    }
  }, 1000)
  return () => window.clearInterval(id)
}

/**
 * Trayectoria histórica sintética para replay e insights en modo demo.
 * T3 (Ana) incluye un hueco de ~20 min a mitad del periodo para que el
 * detector de pérdidas de señal tenga algo que encontrar.
 */
export function demoTrajectory(tagId: string, start: Date, end: Date): Sample[] {
  const w = makeWalker(tagId)
  const out: Sample[] = []
  const stepS = 5
  const t0 = start.getTime()
  const t1 = end.getTime()
  const gapStart = t0 + (t1 - t0) * 0.45
  const gapEnd = gapStart + 20 * 60 * 1000
  for (let t = t0; t <= t1; t += stepS * 1000) {
    stepWalker(w, stepS)
    if (tagId === 'T3' && t >= gapStart && t <= gapEnd) continue
    out.push({
      ts: new Date(t).toISOString(),
      x: +(w.x + rand(-0.05, 0.05)).toFixed(3),
      y: +(w.y + rand(-0.05, 0.05)).toFixed(3),
      quality: +rand(0.03, 0.4).toFixed(3),
      n_anchors: 6,
    })
  }
  return out
}

export function demoHeatmap(samples: Sample[], cell: number): HeatBin[] {
  const bins = new Map<string, HeatBin>()
  for (const s of samples) {
    const cx = Math.floor(s.x / cell)
    const cy = Math.floor(s.y / cell)
    const key = `${cx},${cy}`
    const bin = bins.get(key)
    if (bin) bin.count += 1
    else bins.set(key, { cx, cy, count: 1 })
  }
  return [...bins.values()]
}
