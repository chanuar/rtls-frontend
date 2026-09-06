import { useState } from 'react'
import { ZONES, tagColor, zoneName } from '../config'
import { fetchPositions } from '../lib/api'
import { demoTrajectory } from '../lib/demo'
import { generateInsights, type Insight } from '../lib/insights'
import { analyzeTrajectory, fmtDuration } from '../lib/trajectory'
import type { ConnectionStatus, Sample, TagInfo } from '../types'
import type { Period } from './PeriodPicker'

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
  const [summaries, setSummaries] = useState<{ tag: string; count: number; stats: ReturnType<typeof analyzeTrajectory> }[]>([])

  async function analyze() {
    if (period.end <= period.start) {
      setError('El final debe ser posterior al inicio.')
      return
    }
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
          tags.map(async (t) => [t.id, await fetchPositions(t.id, period.start, period.end)] as const),
        )
        for (const [id, samples] of results) data[id] = samples
      }
      setInsights(generateInsights(data, tags))
      setSummaries(Object.entries(data).map(([tag, samples]) => ({ tag, count: samples.length, stats: analyzeTrajectory(samples) })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar el periodo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold">Resumen del periodo</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              Patrones detectados en los movimientos del periodo seleccionado:{' '}
              <span className="font-mono">
                {period.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                {' — '}
                {period.end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            </p>
          </div>
          <button
            onClick={() => void analyze()}
            disabled={loading || tags.length === 0}
            className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[12px] text-accent hover:bg-accent/20 disabled:opacity-40"
          >
            {loading ? 'Analizando…' : 'Analizar periodo'}
          </button>
        </div>

        {error && <p className="mb-3 text-[12px] text-warn">{error}</p>}

        {ZONES.length === 0 && <p className="mb-3 text-[12px] text-muted">Sin zonas configuradas: permanencias y coincidencias por zona no se analizan. El resumen y la detección de poco movimiento siguen disponibles.</p>}

        {summaries.length > 0 && (
          <div className="mb-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-[12px]">
              <caption className="p-3 text-left text-muted">Tiempo observado: suma de intervalos válidos de hasta 10 s; excluye huecos y saltos descartados.</caption>
              <thead className="bg-panel-2 text-muted"><tr>
                {['Tag', 'Muestras', 'Tiempo observado', 'Distancia estimada', 'Paradas'].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}
              </tr></thead>
              <tbody>{summaries.map(({ tag, count, stats }) => (
                <tr key={tag} className="border-t border-line">
                  <th scope="row" className="p-3 font-medium">{tags.find(t => t.id === tag)?.employee ?? tag}<span className="block text-[10px] font-normal text-muted">{count === 0 ? 'Sin datos' : count <= 10 || stats.durationS < 1800 ? 'Datos limitados' : tag}</span></th>
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
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-[12px] text-muted">
            Ajusta el periodo y pulsa «Analizar periodo» para ver las muestras, el tiempo observado,
            la distancia estimada y las paradas de cada tag.
          </div>
        )}

        {insights?.length === 0 && (
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-[12px] text-muted">
            {summaries.every(s => s.count === 0)
              ? 'Sin datos: no hay posiciones registradas en este periodo.'
              : summaries.every(s => s.count <= 10 || s.stats.durationS < 1800)
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
                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] tracking-widest ${
                    ins.severity === 'warn' ? 'bg-warn/15 text-warn' : 'bg-accent/12 text-accent'
                  }`}
                >
                  {ins.severity === 'warn' ? 'AVISO' : 'PATRÓN'}
                </span>
                {ins.zone && (
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">
                    {zoneName(ins.zone)}
                  </span>
                )}
              </div>
              <h3 className="text-[13px] font-medium leading-snug">{ins.title}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{ins.detail}</p>
              <div className="mt-2 flex gap-1.5">
                {ins.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2 py-0.5 font-mono text-[10px]"
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

        <p className="mt-6 text-[10px] leading-relaxed text-muted">
          Las reglas requieren más de 10 muestras por tag. Permanencias: al menos 30 min observados;
          poco movimiento: al menos 2 h observadas y menos de 60 m/h. Una parada requiere 30 s en un
          radio de 0,4 m. Son estimaciones de movimiento, no una evaluación del rendimiento laboral.
        </p>
      </div>
    </div>
  )
}
