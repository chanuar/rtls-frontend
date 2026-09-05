import { ZONES, zoneAt } from '../config'
import type { Sample } from '../types'

const MAX_GAP_S = 10 // huecos mayores no acumulan tiempo (tag dormido / sin cobertura)
// ponytail: walking heuristic; calibrate speed/noise limits for faster tracked objects.
const MAX_SPEED_M_S = 3

export function isContinuous(a: Sample, b: Sample): boolean {
  const dt = (Date.parse(b.ts) - Date.parse(a.ts)) / 1000
  return dt > 0 && dt <= MAX_GAP_S &&
    Math.hypot(b.x - a.x, b.y - a.y) <= MAX_SPEED_M_S * dt + 0.4
}

export interface TrajectoryStats {
  distanceM: number
  stops: number
  durationS: number
  perZoneS: { zone: string; name: string; seconds: number }[]
}

export function analyzeTrajectory(samples: Sample[]): TrajectoryStats {
  let distance = 0
  let stops = 0
  let duration = 0
  const perZone = new Map<string, number>()

  let stillSince: number | null = null
  let stillOrigin: Sample | null = null
  let stillCounted = false

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    const dt = (new Date(b.ts).getTime() - new Date(a.ts).getTime()) / 1000
    const d = Math.hypot(b.x - a.x, b.y - a.y)

    if (!isContinuous(a, b)) {
      stillSince = null
      stillOrigin = null
      stillCounted = false
      continue
    }
    duration += dt
    distance += d

    const zone = zoneAt(b.x, b.y)
    if (zone) perZone.set(zone.id, (perZone.get(zone.id) ?? 0) + dt)

    // Parada: permanecer a <0.4 m de un punto durante >=30 s
    if (!stillOrigin) {
      stillOrigin = a
      stillSince = new Date(a.ts).getTime()
    }
    if (Math.hypot(b.x - stillOrigin.x, b.y - stillOrigin.y) > 0.4) {
      stillOrigin = b
      stillSince = new Date(b.ts).getTime()
      stillCounted = false
    } else if (!stillCounted && (Date.parse(b.ts) - (stillSince ?? 0)) / 1000 >= 30) {
      stops++
      stillCounted = true
    }
  }

  return {
    distanceM: distance,
    stops,
    durationS: duration,
    perZoneS: ZONES.map((z) => ({ zone: z.id, name: z.name, seconds: perZone.get(z.id) ?? 0 }))
      .filter((z) => z.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds),
  }
}

/** Posición interpolada en el instante tMs (para replay suave). */
export function positionAt(samples: Sample[], tMs: number): { x: number; y: number; index: number } | null {
  if (!samples.length) return null
  const first = new Date(samples[0].ts).getTime()
  const last = new Date(samples[samples.length - 1].ts).getTime()
  if (tMs <= first) return { x: samples[0].x, y: samples[0].y, index: 0 }
  if (tMs >= last) {
    const s = samples[samples.length - 1]
    return { x: s.x, y: s.y, index: samples.length - 1 }
  }
  let lo = 0
  let hi = samples.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (new Date(samples[mid].ts).getTime() <= tMs) lo = mid
    else hi = mid
  }
  const ta = new Date(samples[lo].ts).getTime()
  const tb = new Date(samples[hi].ts).getTime()
  if (tMs !== ta && !isContinuous(samples[lo], samples[hi])) return null
  const f = tb === ta ? 0 : (tMs - ta) / (tb - ta)
  return {
    x: samples[lo].x + (samples[hi].x - samples[lo].x) * f,
    y: samples[lo].y + (samples[hi].y - samples[lo].y) * f,
    index: lo,
  }
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${Math.round(seconds)} s`
}
