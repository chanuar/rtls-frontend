import type { Zone } from './types'

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/positions'

export const TEST_LAYOUT = import.meta.env.VITE_TEST_LAYOUT === 'true'
export const DEMO_MODE = import.meta.env.VITE_DEMO === 'true'

/**
 * Geometría del local real (~152,75 m², planta alargada).
 * Eje X = profundidad desde la fachada (0 = entrada, ~28 = patio).
 * Eje Y = anchura del local (0–5,6 m).
 * Las superficies vienen del plano de obra; los límites exactos de cada
 * estancia son aproximados — afinar al medir con cinta métrica.
 */
export const FLOOR = { depth: 28.0, width: 5.6 }

/** Hueco de la puerta de entrada en la fachada (coordenada Y, metros). */
export const ENTRANCE = { y0: 1.7, y1: 3.9 }

const PHARMACY_ZONES: Zone[] = [
  { id: 'atencion', name: 'Atención al público', x: 0.15, y: 0.15, w: 13.95, h: 5.3 }, // 79,00 m²
  { id: 'rebotica', name: 'Rebotica', x: 14.1, y: 0.15, w: 5.1, h: 5.3 }, // 28,40 m²
  { id: 'oficina', name: 'Oficina', x: 19.2, y: 0.15, w: 3.0, h: 2.95 }, // 8,75 m²
  { id: 'distribuidor', name: 'Distribuidor', x: 19.2, y: 3.1, w: 1.45, h: 2.35 }, // 2,85 m²
  { id: 'office', name: 'Office', x: 20.65, y: 3.1, w: 1.55, h: 2.35 }, // 3,75 m²
  { id: 'almacen', name: 'Almacén', x: 22.2, y: 0.15, w: 5.65, h: 3.4 }, // 25,90 m²
  { id: 'aseo', name: 'Aseo', x: 22.2, y: 3.55, w: 1.75, h: 1.9 }, // 4,10 m²
  { id: 'patio', name: 'Patio', x: 23.95, y: 3.55, w: 3.9, h: 1.9 },
]

export const ZONES: Zone[] = TEST_LAYOUT ? [] : PHARMACY_ZONES

/** Zona "habitual" de cada empleado en el modo demo. */
export const DEMO_HOME_ZONES: Record<string, string> = {
  T1: 'atencion',
  T2: 'almacen',
  T3: 'rebotica',
}

export const TAG_COLORS = ['#00d4ff', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#38bdf8']

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
