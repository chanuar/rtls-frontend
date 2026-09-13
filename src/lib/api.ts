import { API_URL } from '../config'
import { isTimestamp } from './time'
import type { Anchor, Heatmap, Sample, TagInfo } from '../types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const nullableText = (value: unknown) => value === null || typeof value === 'string'

function anchors(value: unknown): value is Anchor[] {
  return Array.isArray(value) && value.every(a => record(a) && id(a.id) &&
    finite(a.x) && finite(a.y) && finite(a.z) && nullableText(a.description)) &&
    new Set(value.map(a => a.id)).size === value.length
}

function tags(value: unknown): value is TagInfo[] {
  return Array.isArray(value) && value.every(t => record(t) && id(t.id) &&
    nullableText(t.employee) && typeof t.active === 'boolean') &&
    new Set(value.map(t => t.id)).size === value.length
}

function samples(value: unknown): value is Sample[] {
  return Array.isArray(value) && value.every((s, i) => record(s) && isTimestamp(s.ts) &&
    finite(s.x) && finite(s.y) && (s.quality === null || (finite(s.quality) && s.quality >= 0)) &&
    (s.n_anchors === null || (finite(s.n_anchors) && Number.isInteger(s.n_anchors) && s.n_anchors >= 3)) &&
    (i === 0 || Date.parse(s.ts) > Date.parse(value[i - 1].ts)))
}

function heatmap(value: unknown): value is Heatmap {
  return record(value) && finite(value.cell) && value.cell > 0.05 && value.cell <= 5 &&
    Array.isArray(value.bins) && value.bins.every(b => record(b) &&
      Number.isSafeInteger(b.cx) && Number.isSafeInteger(b.cy) &&
      finite(b.count) && Number.isSafeInteger(b.count) && b.count > 0)
}

async function get<T>(path: string, resource: string, valid: (value: unknown) => value is T, signal?: AbortSignal): Promise<T> {
  let value: unknown
  try {
    const timeout = AbortSignal.timeout(15000)
    const res = await fetch(`${API_URL}${path}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    if (!res.ok) throw new Error(`No se ha podido cargar ${resource} (HTTP ${res.status}). Inténtalo de nuevo.`)
    value = await res.json()
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`No se ha podido cargar ${resource}. Comprueba la conexión con el backend e inténtalo de nuevo.`)
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(`El servidor ha tardado demasiado en responder al cargar ${resource}. Inténtalo de nuevo.`)
    }
    if (error instanceof SyntaxError) throw new Error(`Respuesta inválida al cargar ${resource}: JSON inválido. Revisa el backend.`)
    throw error
  }
  if (!valid(value)) throw new Error(`Respuesta inválida de ${path.split('?')[0]}: revisa el formato, los valores y el orden temporal.`)
  return value
}

export const fetchAnchors = () => get('/anchors', 'los anchors', anchors)
export const fetchTags = () => get('/tags', 'el catálogo de tags', tags)

function periodQuery(start: Date, end: Date): string {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error('El periodo debe contener fechas válidas y el final debe ser posterior al inicio.')
  }
  return `start=${start.toISOString()}&end=${end.toISOString()}`
}

export const fetchPositions = (tagId: string, start: Date, end: Date, signal?: AbortSignal) =>
  get(
    `/positions/${encodeURIComponent(tagId)}?${periodQuery(start, end)}`,
    'el histórico',
    (value): value is Sample[] => samples(value) && value.every(s =>
      Date.parse(s.ts) >= start.getTime() && Date.parse(s.ts) <= end.getTime()),
    signal,
  )

export const fetchHeatmap = (start: Date, end: Date, cell: number, tagId?: string) =>
  get(
    `/heatmap?${periodQuery(start, end)}&cell=${cell}` +
      (tagId ? `&tag_id=${encodeURIComponent(tagId)}` : ''),
    'el mapa de calor',
    (value): value is Heatmap => heatmap(value) && value.cell === cell,
  )
