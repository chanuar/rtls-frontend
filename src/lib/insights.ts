/**
 * Motor de recomendaciones.
 *
 * Primera versión: reglas heurísticas sobre las trayectorias del periodo.
 * Diseñado para que en el futuro un endpoint del backend (p. ej. POST /insights
 * con un LLM) pueda sustituir o ampliar estas reglas: la UI solo consume
 * la lista de Insight, sea cual sea su origen.
 *
 * Con más histórico en la BD, las reglas de "más de lo habitual" deberían
 * comparar contra la media de ese empleado (baseline por persona y franja),
 * no contra umbrales fijos.
 */
import { zoneName } from '../config'
import { analyzeTrajectory, fmtDuration } from './trajectory'
import { zoneAt } from '../config'
import type { Sample, TagInfo } from '../types'

export interface Insight {
  id: string
  severity: 'warn' | 'info'
  title: string
  detail: string
  tags: string[]
  zone?: string
}

const MIN_PERIOD_S = 30 * 60 // no analizar periodos menores de 30 min
const DWELL_INFO = 0.45 // >45 % del tiempo en una zona → info
const DWELL_WARN = 0.65 // >65 % → aviso
const GAP_MIN_S = 15 * 60 // hueco de señal mínimo a reportar
const COPRESENCE_MIN_S = 45 * 60 // coincidencia mínima a reportar
const COPRESENCE_SHARE = 0.35 // ...o >35 % del tiempo común
const LOW_ACTIVITY_M_PER_H = 60 // menos de 60 m/h caminados → actividad baja

export function generateInsights(
  data: Record<string, Sample[]>,
  tags: TagInfo[],
): Insight[] {
  const out: Insight[] = []
  const name = (id: string) => tags.find((t) => t.id === id)?.employee ?? id

  const entries = Object.entries(data).filter(([, s]) => s.length > 10)

  // 1 · Concentración en una zona
  for (const [tag, samples] of entries) {
    const stats = analyzeTrajectory(samples)
    if (stats.durationS < MIN_PERIOD_S || stats.perZoneS.length === 0) continue
    const top = stats.perZoneS[0]
    const share = top.seconds / stats.durationS
    if (share >= DWELL_INFO) {
      out.push({
        id: `dwell-${tag}`,
        severity: share >= DWELL_WARN ? 'warn' : 'info',
        title: `${name(tag)} ha pasado mucho tiempo en ${top.name}`,
        detail: `${fmtDuration(top.seconds)} en el periodo analizado — el ${Math.round(share * 100)} % de su tiempo con señal.`,
        tags: [tag],
        zone: top.zone,
      })
    }

    // 2 · Actividad baja
    const hours = stats.durationS / 3600
    if (hours >= 2 && stats.distanceM / hours < LOW_ACTIVITY_M_PER_H) {
      out.push({
        id: `low-${tag}`,
        severity: 'info',
        title: `Actividad baja de ${name(tag)}`,
        detail: `Solo ${stats.distanceM.toFixed(0)} m recorridos en ${fmtDuration(stats.durationS)} (${(stats.distanceM / hours).toFixed(0)} m/h).`,
        tags: [tag],
      })
    }
  }

  // 3 · Huecos de señal
  for (const [tag, samples] of entries) {
    for (let i = 1; i < samples.length; i++) {
      const a = new Date(samples[i - 1].ts).getTime()
      const b = new Date(samples[i].ts).getTime()
      const gap = (b - a) / 1000
      if (gap >= GAP_MIN_S) {
        const fmt = (t: number) =>
          new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        out.push({
          id: `gap-${tag}-${i}`,
          severity: 'warn',
          title: `Sin señal de ${name(tag)} durante ${fmtDuration(gap)}`,
          detail: `Entre las ${fmt(a)} y las ${fmt(b)}. Posible batería agotada, tag fuera de cobertura o salida de las instalaciones.`,
          tags: [tag],
        })
      }
    }
  }

  // 4 · Coincidencias entre empleados (misma zona, mismo minuto)
  const timelines = new Map<string, Map<number, string>>()
  for (const [tag, samples] of entries) {
    const tl = new Map<number, string>()
    for (const s of samples) {
      const z = zoneAt(s.x, s.y)
      if (z) tl.set(Math.floor(new Date(s.ts).getTime() / 60000), z.id)
    }
    timelines.set(tag, tl)
  }
  const tagList = [...timelines.keys()]
  for (let i = 0; i < tagList.length; i++) {
    for (let j = i + 1; j < tagList.length; j++) {
      const a = timelines.get(tagList[i])!
      const b = timelines.get(tagList[j])!
      let together = 0
      let common = 0
      const byZone = new Map<string, number>()
      for (const [minute, za] of a) {
        const zb = b.get(minute)
        if (zb === undefined) continue
        common++
        if (za === zb) {
          together++
          byZone.set(za, (byZone.get(za) ?? 0) + 1)
        }
      }
      const togetherS = together * 60
      if (
        common > 0 &&
        (togetherS >= COPRESENCE_MIN_S || together / common >= COPRESENCE_SHARE) &&
        togetherS >= 20 * 60
      ) {
        const topZone = [...byZone.entries()].sort((x, y) => y[1] - x[1])[0]
        out.push({
          id: `co-${tagList[i]}-${tagList[j]}`,
          severity: 'info',
          title: `${name(tagList[i])} y ${name(tagList[j])} han coincidido más de lo habitual`,
          detail: `${fmtDuration(togetherS)} en la misma zona (sobre todo en ${zoneName(topZone[0])}) — el ${Math.round((together / common) * 100)} % del tiempo en que ambos tenían señal.`,
          tags: [tagList[i], tagList[j]],
          zone: topZone[0],
        })
      }
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
}
