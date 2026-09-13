import type { LivePosition, Zone } from './types'

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/positions'

export const TEST_LAYOUT = import.meta.env.VITE_TEST_LAYOUT === 'true'
export const DEMO_MODE = import.meta.env.VITE_DEMO === 'true'

export function isFresh(position: LivePosition, now: number): boolean {
  const age = now - Date.parse(position.ts)
  return age >= 0 && age <= 10000
}

/**
 * Geometría del local real (~152,75 m², planta alargada).
 * Eje X = profundidad desde la fachada (0 = entrada, ~28 = patio).
 * Eje Y = anchura del local (0–5,6 m).
 * Las superficies vienen del plano de obra; los límites exactos de cada
 * estancia son aproximados — afinar al medir con cinta métrica.
 */
export const FLOOR = { depth: 28.0, width: 5.86 }

export const ENTRANCE = { y0: 1.7, y1: 3.9 }

const PHARMACY_ZONES: Zone[] = [
  { id: 'atencion', name: 'Atención al público', x: 0.15, y: 0, w: 13.95, h: FLOOR.width },
  { id: 'rebotica', name: 'Rebotica', x: 14.1, y: 0, w: 5.1, h: FLOOR.width },
  { id: 'oficina', name: 'Oficina', x: 19.2, y: 0, w: 3.0, h: FLOOR.width },
  { id: 'almacen', name: 'Almacén', x: 22.2, y: 0, w: 5.65, h: FLOOR.width },
]
// const PHARMACY_ZONES: Zone[] = [
//   { id: 'atencion', name: 'Atención al público', x: 0.15, y: 0.15, w: 13.95, h: 5.3 },
//   { id: 'rebotica', name: 'Rebotica', x: 14.1, y: 0.15, w: 5.1, h: 5.3 },
//   { id: 'oficina', name: 'Oficina', x: 19.2, y: 0.15, w: 3.0, h: 2.95 },
//   { id: 'distribuidor', name: 'Distribuidor', x: 19.2, y: 3.1, w: 1.45, h: 2.35 },
//   { id: 'office', name: 'Office', x: 20.65, y: 3.1, w: 1.55, h: 2.35 },
//   { id: 'almacen', name: 'Almacén', x: 22.2, y: 0.15, w: 5.65, h: 3.4 },
//   { id: 'aseo', name: 'Aseo', x: 22.2, y: 3.55, w: 1.75, h: 1.9 },
//   { id: 'patio', name: 'Patio', x: 23.95, y: 3.55, w: 3.9, h: 1.9 },
// ]

export const ZONES: Zone[] = TEST_LAYOUT ? [] : PHARMACY_ZONES

export const DEMO_HOME_ZONES: Record<string, string> = {
  T1: 'atencion',
  T2: 'almacen',
  T3: 'rebotica',
}

export const TAG_COLORS = ['var(--tag-1)', 'var(--tag-2)', 'var(--tag-3)', 'var(--tag-4)', 'var(--tag-5)', 'var(--tag-6)']

export function tagColor(tagId: string, tagIds: string[]): string {
  const i = Math.max(0, tagIds.indexOf(tagId))
  return TAG_COLORS[i % TAG_COLORS.length]
}

export function zoneAt(x: number, y: number): Zone | null {
  return ZONES.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null
}

export function zoneName(id: string): string {
  return ZONES.find((z) => z.id === id)?.name ?? id
}

/** Umbrales de calidad (residuo RMS de la trilateración, en metros). */
export function qualityLevel(rms: number | null): 'ok' | 'warn' | 'bad' {
  if (rms == null) return 'ok'
  if (rms < 0.25) return 'ok'
  if (rms < 0.5) return 'warn'
  return 'bad'
}
