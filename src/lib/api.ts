import { API_URL } from '../config'
import type { Anchor, Heatmap, Sample, TagInfo } from '../types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const nullableText = (value: unknown) => value === null || typeof value === 'string'
const timestamp = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10)

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
  return Array.isArray(value) && value.every((s, i) => record(s) && timestamp(s.ts) &&
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

async function get<T>(path: string, valid: (value: unknown) => value is T): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} en ${path}`)
  const value: unknown = await res.json()
  if (!valid(value)) throw new Error(`Respuesta inválida de ${path.split('?')[0]}: revisa el formato, los valores y el orden temporal.`)
  return value
}

export const fetchAnchors = () => get('/anchors', anchors)
export const fetchTags = () => get('/tags', tags)

function periodQuery(start: Date, end: Date): string {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error('El periodo debe contener fechas válidas y el final debe ser posterior al inicio.')
  }
  return `start=${start.toISOString()}&end=${end.toISOString()}`
}

export const fetchPositions = (tagId: string, start: Date, end: Date) =>
  get(
    `/positions/${encodeURIComponent(tagId)}?${periodQuery(start, end)}`,
    (value): value is Sample[] => samples(value) && value.every(s =>
      Date.parse(s.ts) >= start.getTime() && Date.parse(s.ts) <= end.getTime()),
  )

export const fetchHeatmap = (start: Date, end: Date, cell: number, tagId?: string) =>
  get(
    `/heatmap?${periodQuery(start, end)}&cell=${cell}` +
      (tagId ? `&tag_id=${encodeURIComponent(tagId)}` : ''),
    (value): value is Heatmap => heatmap(value) && value.cell === cell,
  )
