import { useEffect, useRef, useState } from 'react'
import { ZONES, tagColor, zoneName } from '../config'
import { fetchPositions } from '../lib/api'
import { demoTrajectory } from '../lib/demo'
import { analyzePeriod, MIN_SAMPLES, MIN_PERIOD_S, LOW_ACTIVITY_MIN_HOURS, LOW_ACTIVITY_M_PER_H, type Insight } from '../lib/insights'
import { fmtDuration, MAX_GAP_S, STOP_DURATION_S, STOP_RADIUS_M } from '../lib/trajectory'
import type { ConnectionStatus, Sample, TagInfo } from '../types'
import { isValidPeriod, type Period } from './PeriodPicker'

interface Props {
  status: ConnectionStatus
  tags: TagInfo[]
  tagIds: string[]
  period: Period
}

export function InsightsPage({ status, tags, tagIds, period }: Props) {
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<ReturnType<typeof analyzePeriod>['summaries']>([])
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => {
    request.current?.abort()
    request.current = null
  }, [])

  async function analyze() {
    if (!isValidPeriod(period)) {
      setError('El final debe ser posterior al inicio.')
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    setInsights(null)
    setSummaries([])
    try {
      const data: Record<string, Sample[]> = {}
      if (status === 'demo') {
        for (const t of tags) data[t.id] = demoTrajectory(t.id, period.start, period.end)
      } else {
        const results = await Promise.all(
          tags.map(async (t) => [t.id, await fetchPositions(t.id, period.start, period.end, controller.signal)] as const),
        )
        for (const [id, samples] of results) data[id] = samples
      }
      if (controller.signal.aborted) return
      const result = analyzePeriod(data, tags)
      setInsights(result.insights)
      setSummaries(result.summaries)
    } catch (err) {
      if (controller.signal.aborted) return
      controller.abort()
      setError(err instanceof Error ? err.message : 'Error al analizar el periodo')
    } finally {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }

  return (
    <section className="analysis-content" aria-label="Análisis del periodo">
        <div className="workspace-title">
          <div>
            <p className="eyebrow">LOCALIZACIÓN · ANÁLISIS</p>
            <h2>Resumen del periodo</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Patrones detectados en los movimientos del periodo seleccionado:{' '}
              <span className="font-mono">
                {Number.isFinite(period.start.getTime()) ? period.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Inicio pendiente'}
                {' — '}
                {Number.isFinite(period.end.getTime()) ? period.end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Final pendiente'}
              </span>
            </p>
          </div>
          <button
            onClick={() => void analyze()}
            disabled={loading || tags.length === 0 || !isValidPeriod(period)}
            className="primary-button shrink-0"
          >
            {loading ? 'Analizando…' : 'Analizar periodo'}
          </button>
        </div>

        {error && <p role="alert" className="mb-3 text-[13px] text-warn">{error}</p>}
        <p role="status" className="sr-only">
          {loading ? 'Analizando el periodo…' : insights !== null
            ? `Análisis finalizado. ${summaries.length} tags, ${summaries.reduce((sum, item) => sum + item.count, 0)} muestras y ${insights.length} hallazgos.`
            : ''}
        </p>

        {ZONES.length === 0 && <p className="mb-3 text-[13px] text-muted">Sin zonas configuradas: permanencias y coincidencias por zona no se analizan. El resumen y la detección de poco movimiento siguen disponibles.</p>}

        {summaries.length > 0 && (
          <div className="mb-4 overflow-x-auto rounded border border-line bg-panel" role="region" aria-label="Resumen por tag" tabIndex={0}>
            <table className="w-full text-left text-[13px]">
              <caption className="p-3 text-left text-muted">Tiempo observado: suma de intervalos válidos de hasta {MAX_GAP_S} s; excluye huecos y saltos descartados.</caption>
              <thead className="bg-panel-2 text-muted"><tr>
                {['Tag', 'Muestras', 'Tiempo observado', 'Distancia estimada', 'Paradas'].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}
              </tr></thead>
              <tbody>{summaries.map(({ tag, count, stats }) => (
                <tr key={tag} className="border-t border-line">
                  <th scope="row" className="p-3 font-medium">{tags.find(t => t.id === tag)?.employee ?? tag}<span className="block text-[13px] font-normal text-muted">{count === 0 ? 'Sin datos' : count < MIN_SAMPLES || stats.durationS < MIN_PERIOD_S ? 'Datos limitados' : tag}</span></th>
                  <td className="p-3 font-mono">{count}</td>
                  <td className="p-3 font-mono">{fmtDuration(stats.durationS)}</td>
                  <td className="p-3 font-mono">{stats.durationS > 0 ? `${stats.distanceM.toFixed(1)} m` : '—'}</td>
                  <td className="p-3 font-mono">{stats.durationS > 0 ? stats.stops : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {insights === null && !loading && (
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-[13px] text-muted">
            Ajusta el periodo y pulsa «Analizar periodo» para ver las muestras, el tiempo observado,
            la distancia estimada y las paradas de cada tag.
          </div>
        )}

        {insights?.length === 0 && (
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-[13px] text-muted">
            {summaries.every(s => s.count === 0)
              ? 'Sin datos: no hay posiciones registradas en este periodo.'
              : summaries.every(s => s.count < MIN_SAMPLES || s.stats.durationS < MIN_PERIOD_S)
                ? 'Datos insuficientes para un análisis completo. El resumen muestra únicamente lo observado; amplía el periodo o registra más posiciones.'
                : 'Sin hallazgos en las comprobaciones disponibles. Esto no confirma un comportamiento normal ni una cobertura completa.'}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {insights?.map((ins) => (
            <article
              key={ins.id}
              className={`rounded-lg border bg-panel p-3.5 ${
                ins.severity === 'warn' ? 'border-warn/30' : 'border-line'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[13px] tracking-widest ${
                    ins.severity === 'warn' ? 'bg-warn/15 text-warn' : 'bg-accent/12 text-accent'
                  }`}
                >
                  {ins.severity === 'warn' ? 'AVISO' : 'PATRÓN'}
                </span>
                {ins.zone && (
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[13px] text-muted">
                    {zoneName(ins.zone)}
                  </span>
                )}
              </div>
              <h3 className="text-[13px] font-medium leading-snug">{ins.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{ins.detail}</p>
              <div className="mt-2 flex gap-1.5">
                {ins.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2 py-0.5 font-mono text-[13px]"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: tagColor(t, tagIds) }}
                    />
                    {tags.find((x) => x.id === t)?.employee ?? t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-muted">
          Las reglas requieren más de {MIN_SAMPLES - 1} muestras por tag. Permanencias: al menos {MIN_PERIOD_S / 60} min observados;
          poco movimiento: al menos {LOW_ACTIVITY_MIN_HOURS} h observadas y menos de {LOW_ACTIVITY_M_PER_H} m/h. Una parada requiere {STOP_DURATION_S} s en un
          radio de {STOP_RADIUS_M.toLocaleString('es-ES')} m. Son estimaciones de movimiento, no una evaluación del rendimiento laboral.
        </p>
    </section>
  )
}
