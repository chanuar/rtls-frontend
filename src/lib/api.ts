import { API_URL } from '../config'
import type { Anchor, Heatmap, Sample, TagInfo } from '../types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} en ${path}`)
  return res.json() as Promise<T>
}

export const fetchAnchors = () => get<Anchor[]>('/anchors')
export const fetchTags = () => get<TagInfo[]>('/tags')

export const fetchPositions = (tagId: string, start: Date, end: Date) =>
  get<Sample[]>(
    `/positions/${encodeURIComponent(tagId)}?start=${start.toISOString()}&end=${end.toISOString()}`,
  )

export const fetchHeatmap = (start: Date, end: Date, cell: number, tagId?: string) =>
  get<Heatmap>(
    `/heatmap?start=${start.toISOString()}&end=${end.toISOString()}&cell=${cell}` +
      (tagId ? `&tag_id=${encodeURIComponent(tagId)}` : ''),
  )
