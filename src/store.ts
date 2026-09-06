import { create } from 'zustand'
import { fetchAnchors, fetchTags } from './lib/api'
import { DEMO_ANCHORS, DEMO_TAGS, startDemoLive } from './lib/demo'
import { DEMO_MODE, WS_URL } from './config'
import type { Anchor, ConnectionStatus, LivePosition, Sample, TagInfo } from './types'

const TRAIL_LENGTH = 40

interface Store {
  status: ConnectionStatus
  anchors: Anchor[]
  tags: TagInfo[]
  live: Record<string, LivePosition>
  trails: Record<string, Sample[]>
  selectedTag: string | null
  init: () => Promise<void>
  stop: () => void
  select: (tag: string) => void
  _apply: (p: LivePosition) => void
}

let stopDemo: (() => void) | null = null
let ws: WebSocket | null = null
let reconnectTimer: number | null = null
let keepaliveTimer: number | null = null
let anchorTimer: number | null = null
let generation = 0

export const useStore = create<Store>((set, get) => ({
  status: 'connecting',
  anchors: [],
  tags: [],
  live: {},
  trails: {},
  selectedTag: null,

  init: async () => {
    get().stop()
    const current = generation
    set({ status: 'connecting' })
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
        tags: tags.length ? tags : inferTagsLater(),
        selectedTag: tags[0]?.id ?? null,
      })
      connectWs(get)
    } catch {
      if (current !== generation) return
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
    if (!p || typeof p.tag !== 'string' || !p.tag.trim() ||
        typeof p.ts !== 'string' || !Number.isFinite(Date.parse(p.ts)) ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        !Number.isFinite(p.quality) || p.quality < 0 ||
        !Number.isInteger(p.n_anchors) || p.n_anchors < 3) return
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
  },
}))

function inferTagsLater(): TagInfo[] {
  return []
}

function connectWs(get: () => Store) {
  disconnectSocket()
  const socket = new WebSocket(WS_URL)
  ws = socket

  ws.onopen = () => {
    useStore.setState({ status: 'online' })
    void refreshAnchors()
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
      useStore.setState(changed ? { anchors, live: {}, trails: {} } : { anchors })
    } catch {
      // Keep the last map during an API outage; retry at the next interval.
    } finally {
      refreshing = false
    }
  }
  anchorTimer = window.setInterval(() => void refreshAnchors(), 5000)
  ws.onmessage = (ev) => {
    try {
      const p = JSON.parse(ev.data as string) as LivePosition
      get()._apply(p)
    } catch {
      /* mensaje no JSON — ignorar */
    }
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
