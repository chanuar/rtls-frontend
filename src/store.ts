import { create } from 'zustand'
import { fetchAnchors, fetchTags } from './lib/api'
import { isTimestamp } from './lib/time'
import { DEMO_ANCHORS, DEMO_TAGS, startDemoLive } from './lib/demo'
import { DEMO_MODE, WS_URL } from './config'
import type { Anchor, ConnectionStatus, LivePosition, Sample, TagInfo } from './types'

const TRAIL_LENGTH = 40

interface Store {
  status: ConnectionStatus
  connectionError: string | null
  anchorError: string | null
  tagError: string | null
  positionError: string | null
  anchors: Anchor[]
  tags: TagInfo[]
  live: Record<string, LivePosition>
  trails: Record<string, Sample[]>
  selectedTag: string | null
  init: () => Promise<void>
  stop: () => void
  select: (tag: string) => void
  _apply: (p: unknown) => string | null
}

let stopDemo: (() => void) | null = null
let ws: WebSocket | null = null
let reconnectTimer: number | null = null
let keepaliveTimer: number | null = null
let anchorTimer: number | null = null
let generation = 0

export const useStore = create<Store>((set, get) => ({
  status: 'connecting',
  connectionError: null,
  anchorError: null,
  tagError: null,
  positionError: null,
  anchors: [],
  tags: [],
  live: {},
  trails: {},
  selectedTag: null,

  init: async () => {
    get().stop()
    const current = generation
    set({ status: 'connecting', connectionError: null, anchorError: null, tagError: null, positionError: null })
    if (DEMO_MODE) {
      set({ status: 'demo', anchors: DEMO_ANCHORS, tags: DEMO_TAGS, selectedTag: DEMO_TAGS[0].id })
      stopDemo = startDemoLive((p) => get()._apply(p))
      return
    }
    try {
      const [anchors, tags] = await Promise.all([fetchAnchors(), fetchTags()])
      if (current !== generation) return
      set({
        anchors,
        tags,
        selectedTag: tags[0]?.id ?? null,
      })
      connectWs(get)
    } catch (error) {
      if (current !== generation) return
      set({ connectionError: error instanceof Error ? error.message : 'Error al cargar la configuración del sistema.' })
      reconnectTimer = window.setTimeout(() => void get().init(), 2000)
    }
  },

  stop: () => {
    generation++
    disconnectSocket()
    stopDemo?.()
    stopDemo = null
  },

  select: (tag) => set({ selectedTag: tag }),

  _apply: (p) => {
    if (!isLivePosition(p)) return 'Posición rechazada: revisa el tag, la fecha con zona horaria, las coordenadas, el RMS y el número de anchors.'
    if (Date.parse(p.ts) > Date.now()) return 'Posición rechazada: la fecha está en el futuro. Revisa los relojes del sistema.'
    set((s) => {
      if (s.live[p.tag] && Date.parse(p.ts) <= Date.parse(s.live[p.tag].ts)) return s
      const trail = [...(s.trails[p.tag] ?? []), { ts: p.ts, x: p.x, y: p.y, quality: p.quality, n_anchors: p.n_anchors }]
      if (trail.length > TRAIL_LENGTH) trail.splice(0, trail.length - TRAIL_LENGTH)
      const tags = s.tags.some((t) => t.id === p.tag)
        ? s.tags
        : [...s.tags, { id: p.tag, employee: null, active: true }]
      return {
        live: { ...s.live, [p.tag]: p },
        trails: { ...s.trails, [p.tag]: trail },
        tags,
        selectedTag: s.selectedTag ?? p.tag,
      }
    })
    return null
  },
}))

function isLivePosition(value: unknown): value is LivePosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return typeof p.tag === 'string' && !!p.tag.trim() && isTimestamp(p.ts) &&
    typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y) &&
    typeof p.quality === 'number' && Number.isFinite(p.quality) && p.quality >= 0 &&
    typeof p.n_anchors === 'number' && Number.isInteger(p.n_anchors) && p.n_anchors >= 3
}

function connectWs(get: () => Store) {
  disconnectSocket()
  const socket = new WebSocket(WS_URL)
  ws = socket

  ws.onopen = () => {
    useStore.setState({ status: 'online' })
    void refreshAnchors()
    void refreshTags()
  }
  let refreshingTags = false
  async function refreshTags() {
    if (refreshingTags) return
    refreshingTags = true
    try {
      const tags = await fetchTags()
      if (ws !== socket) return
      const selected = get().selectedTag
      useStore.setState({ tags, selectedTag: tags.some(t => t.id === selected) ? selected : tags[0]?.id ?? null, tagError: null })
    } catch (error) {
      if (ws !== socket) return
      useStore.setState({ tagError: error instanceof Error ? error.message : 'Error al actualizar los tags.' })
    } finally {
      refreshingTags = false
    }
  }
  let refreshing = false
  async function refreshAnchors() {
    if (refreshing) return
    refreshing = true
    try {
      const anchors = await fetchAnchors()
      if (ws !== socket) return
      const previous = get().anchors
      const changed = anchors.length !== previous.length || anchors.some(a =>
        !previous.some(b => a.id === b.id && a.x === b.x && a.y === b.y && a.z === b.z))
      if (changed) useStore.setState({ anchors, live: {}, trails: {}, anchorError: null })
      else if (anchors.some(a => !previous.some(b => a.id === b.id && a.description === b.description))) {
        useStore.setState({ anchors, anchorError: null })
      } else if (get().anchorError !== null) useStore.setState({ anchorError: null })
    } catch (error) {
      if (ws !== socket) return
      useStore.setState({ anchorError: error instanceof Error ? error.message : 'Error al actualizar los anchors.' })
      // Keep the last map during an API outage; retry at the next interval.
    } finally {
      refreshing = false
    }
  }
  anchorTimer = window.setInterval(() => {
    void refreshAnchors()
    if (get().tagError) void refreshTags()
  }, 5000)
  ws.onmessage = (ev) => {
    let p: unknown
    try {
      p = JSON.parse(ev.data as string)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      useStore.setState({ positionError: 'Mensaje de posición rechazado: JSON inválido. Revisa el emisor.' })
      return
    }
    const positionError = get()._apply(p)
    if (get().positionError !== positionError) useStore.setState({ positionError })
  }
  ws.onclose = () => {
    if (socket !== ws) return
    disconnectSocket()
    useStore.setState({ status: 'connecting' })
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => connectWs(get), 2000)
  }
  ws.onerror = () => socket.close()

  // keepalive para proxies intermedios
  keepaliveTimer = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send('ping')
  }, 30000)
}

function disconnectSocket() {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
  if (keepaliveTimer !== null) window.clearInterval(keepaliveTimer)
  if (anchorTimer !== null) window.clearInterval(anchorTimer)
  anchorTimer = null
  reconnectTimer = keepaliveTimer = null
  if (ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    ws.close()
    ws = null
  }
}
