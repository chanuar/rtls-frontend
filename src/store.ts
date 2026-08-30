import { create } from 'zustand'
import { fetchAnchors, fetchTags } from './lib/api'
import { DEMO_ANCHORS, DEMO_TAGS, startDemoLive } from './lib/demo'
import { WS_URL } from './config'
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
  select: (tag: string) => void
  _apply: (p: LivePosition) => void
}

let stopDemo: (() => void) | null = null
let ws: WebSocket | null = null
let reconnectTimer: number | null = null

export const useStore = create<Store>((set, get) => ({
  status: 'connecting',
  anchors: [],
  tags: [],
  live: {},
  trails: {},
  selectedTag: null,

  init: async () => {
    try {
      const [anchors, tags] = await Promise.all([fetchAnchors(), fetchTags()])
      set({
        anchors,
        tags: tags.length ? tags : inferTagsLater(),
        selectedTag: tags[0]?.id ?? null,
      })
      connectWs(get)
    } catch {
      // API no disponible → modo demo con datos simulados en el cliente
      set({ status: 'demo', anchors: DEMO_ANCHORS, tags: DEMO_TAGS, selectedTag: DEMO_TAGS[0].id })
      stopDemo?.()
      stopDemo = startDemoLive((p) => get()._apply(p))
    }
  },

  select: (tag) => set({ selectedTag: tag }),

  _apply: (p) => {
    set((s) => {
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

/** La tabla tags puede estar vacía al principio; los tags aparecen al emitir. */
function inferTagsLater(): TagInfo[] {
  return []
}

function connectWs(get: () => Store) {
  ws?.close()
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    useStore.setState({ status: 'online' })
  }
  ws.onmessage = (ev) => {
    try {
      const p = JSON.parse(ev.data as string) as LivePosition
      if (p && typeof p.x === 'number' && typeof p.y === 'number') get()._apply(p)
    } catch {
      /* mensaje no JSON — ignorar */
    }
  }
  ws.onclose = () => {
    useStore.setState({ status: 'connecting' })
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => connectWs(get), 2000)
  }
  ws.onerror = () => ws?.close()

  // keepalive para proxies intermedios
  window.setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
  }, 30000)
}
