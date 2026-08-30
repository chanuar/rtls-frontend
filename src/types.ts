export interface Anchor {
  id: string
  x: number
  y: number
  z: number
  description: string | null
}

export interface TagInfo {
  id: string
  employee: string | null
  active: boolean
}

/** Posición en vivo tal y como la emite el motor por WebSocket. */
export interface LivePosition {
  tag: string
  ts: string
  x: number
  y: number
  quality: number
  n_anchors: number
}

/** Muestra histórica de la tabla positions. */
export interface Sample {
  ts: string
  x: number
  y: number
  quality: number | null
  n_anchors: number | null
}

export interface HeatBin {
  cx: number
  cy: number
  count: number
}

export interface Heatmap {
  cell: number
  bins: HeatBin[]
}

export interface Zone {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

export type ConnectionStatus = 'connecting' | 'online' | 'demo'

export type Mode = 'live' | 'replay'
