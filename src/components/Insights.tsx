import { useState } from 'react'
import { tagColor, zoneName } from '../config'
import { fetchPositions } from '../lib/api'
import { demoTrajectory } from '../lib/demo'
import { generateInsights, type Insight } from '../lib/insights'
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

  async function analyze() {
    if (period.end <= period.start) {
      setError('El final debe ser posterior al inicio.')
      return
    }
    setLoading(true)
    setError(null)
    setInsights(null)
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
            <h2 className="text-[15px] font-semibold">Recomendaciones</h2>
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

        {insights === null && !loading && (
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-[12px] text-muted">
            Ajusta el periodo en la barra lateral y pulsa «Analizar periodo». Se revisarán los
            movimientos de todos los empleados en busca de patrones: permanencias largas en una zona,
            coincidencias entre empleados, pérdidas de señal y actividad anómala.
          </div>
        )}

        {insights?.length === 0 && (
          <div className="rounded-lg border border-line bg-panel p-6 text-center text-[12px] text-muted">
            Sin hallazgos en este periodo: los movimientos entran dentro de lo esperado. Prueba con un
            periodo más largo o con más datos acumulados.
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
          Estas recomendaciones se generan con reglas heurísticas sobre los datos de posición. En una
          fase posterior se conectarán a un modelo de IA en el backend para análisis en lenguaje
          natural y comparación contra el patrón habitual de cada empleado. Uso sujeto al RGPD:
          finalidad informada, acceso restringido y sin decisiones automatizadas sobre los empleados.
        </p>
      </div>
    </div>
  )
}
