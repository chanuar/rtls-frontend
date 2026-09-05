import { useEffect, useMemo, useState } from 'react'
import { TEST_LAYOUT, isFresh, tagColor } from './config'
import { fetchHeatmap, fetchPositions } from './lib/api'
import { demoHeatmap, demoTrajectory } from './lib/demo'
import { analyzeTrajectory } from './lib/trajectory'
import { useStore } from './store'
import { FloorPlan } from './components/FloorPlan'
import { InsightsPage } from './components/Insights'
import { PeriodPicker, type Period } from './components/PeriodPicker'
import { ReplayBar, useReplay } from './components/Replay'
import { LiveInfo, ReplayStats } from './components/Stats'
import type { Heatmap, Mode, Sample } from './types'

const STATUS = {
  online: { label: 'EN VIVO', dot: 'bg-ok' },
  demo: { label: 'DEMO', dot: 'bg-warn' },
  connecting: { label: 'CONECTANDO…', dot: 'bg-muted' },
} as const

type Page = 'plan' | 'insights'

export default function App() {
  const { status, anchors, tags, live, trails, selectedTag, init, select } = useStore()
  const [page, setPage] = useState<Page>('plan')
  const [mode, setMode] = useState<Mode>('live')
  const [showHeat, setShowHeat] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const freshLive = Object.fromEntries(Object.entries(live).filter(([, p]) =>
    (status === 'online' || status === 'demo') && isFresh(p, now)))
  const freshTrails = Object.fromEntries(Object.entries(trails).filter(([tag]) => tag in freshLive))

  const [period, setPeriod] = useState<Period>(() => {
    const start = new Date()
    start.setHours(8, 0, 0, 0)
    return { start, end: new Date() }
  })

  const [trajectory, setTrajectory] = useState<Sample[]>([])
  const [heat, setHeat] = useState<Heatmap | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void init()
    return () => useStore.getState().stop()
  }, [init])

  const tagIds = useMemo(() => tags.map((t) => t.id), [tags])
  const replay = useReplay(trajectory)
  const stats = useMemo(() => (trajectory.length > 1 ? analyzeTrajectory(trajectory) : null), [trajectory])

  async function loadRange() {
    if (!selectedTag) return
    setLoading(true)
    setLoadError(null)
    try {
      if (status === 'demo') {
        const traj = demoTrajectory(selectedTag, period.start, period.end)
        setTrajectory(traj)
        setHeat({ cell: 0.5, bins: demoHeatmap(traj, 0.5) })
      } else {
        const [traj, hm] = await Promise.all([
          fetchPositions(selectedTag, period.start, period.end),
          fetchHeatmap(period.start, period.end, 0.5, selectedTag),
        ])
        setTrajectory(traj)
        setHeat(hm)
        if (traj.length === 0) setLoadError('No hay posiciones en ese periodo. Prueba otro o arranca el simulador.')
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const st = status === 'online' && !Object.keys(freshLive).length
    ? { label: 'CONECTADO · SIN POSICIONES RECIENTES', dot: 'bg-warn' } : STATUS[status]
  const selectedLive = selectedTag ? (freshLive[selectedTag] ?? null) : null

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera */}
      <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-2.5">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/40 bg-accent/10 font-mono text-[10px] font-bold text-accent">
              UWB
            </div>
            <div>
              <h1 className="text-[13px] font-semibold leading-tight">
                RTLS · {TEST_LAYOUT ? 'Prueba UWB' : 'Farmacia'}
              </h1>
              <p className="text-[10px] leading-tight text-muted">
                {TEST_LAYOUT ? 'Área definida por A0–A3' : 'Local comercial · 152,75 m²'}
              </p>
            </div>
          </div>
          <nav className="flex gap-0.5 rounded-md border border-line bg-panel p-0.5">
            {(
              [
                ['plan', 'Plano'],
                ['insights', 'Recomendaciones IA'],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`rounded px-3 py-1 text-[12px] ${
                  page === p ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${status === 'online' ? 'animate-pulse' : ''}`} />
          <span className="font-mono text-[10px] tracking-widest text-muted">{st.label}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Barra lateral */}
        <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line p-4">
          {page === 'plan' && (
            <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
              {(['live', 'replay'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded px-2 py-1.5 text-[12px] ${
                    mode === m ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
                  }`}
                >
                  {m === 'live' ? 'En vivo' : 'Reproducción'}
                </button>
              ))}
            </div>
          )}

          {/* Empleados */}
          <section>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
              {page === 'insights' ? 'Empleados analizados' : 'Empleado'}
            </p>
            <div className="flex flex-col gap-1">
              {tags.length === 0 && (
                <p className="text-[11px] text-muted">Aún no hay tags. Aparecerán al recibir la primera posición.</p>
              )}
              {tags.map((t) => {
                const color = tagColor(t.id, tagIds)
                const isSel = t.id === selectedTag && page === 'plan'
                return (
                  <button
                    key={t.id}
                    onClick={() => select(t.id)}
                    disabled={page === 'insights'}
                    className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left ${
                      isSel ? 'border-accent/40 bg-accent/8' : 'border-transparent hover:bg-panel'
                    } disabled:cursor-default disabled:hover:bg-transparent`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px]">{t.employee ?? t.id}</span>
                      <span className="block font-mono text-[10px] text-muted">{t.id}</span>
                    </span>
                    {freshLive[t.id] && <span className="h-1.5 w-1.5 rounded-full bg-ok" />}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Periodo */}
          <section>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">Periodo</p>
            <PeriodPicker value={period} onChange={setPeriod} />
            {page === 'plan' && (
              <>
                <button
                  onClick={() => void loadRange()}
                  disabled={loading || !selectedTag}
                  className="mt-2 w-full rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-[12px] text-accent hover:bg-accent/20 disabled:opacity-40"
                >
                  {loading ? 'Cargando…' : 'Cargar jornada'}
                </button>
                {loadError && <p className="mt-1 text-[11px] text-warn">{loadError}</p>}
              </>
            )}
          </section>

          {page === 'plan' && (
            <>
              {/* Capas */}
              <section>
                <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">Capas</p>
                <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={showHeat}
                    onChange={(e) => setShowHeat(e.target.checked)}
                    className="accent-[#00d4ff]"
                  />
                  Mapa de calor del periodo
                </label>
                {showHeat && !heat && (
                  <p className="mt-1 text-[11px] text-muted">Pulsa «Cargar jornada» para generarlo.</p>
                )}
              </section>

              {/* Panel de datos */}
              <section className="rounded-md border border-line bg-panel p-3">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
                  {mode === 'live' ? `Estado de ${selectedTag ?? '—'}` : 'Estadísticas de la jornada'}
                </p>
                {mode === 'live' ? <LiveInfo pos={selectedLive} /> : <ReplayStats stats={stats} />}
              </section>
            </>
          )}

          <p className="mt-auto text-[10px] leading-relaxed text-muted">
            Datos de localización tratados conforme al RGPD: solo horario laboral, acceso restringido y
            retención limitada.
          </p>
        </aside>

        {/* Contenido */}
        <main className="flex min-w-0 flex-1 flex-col">
          {page === 'plan' ? (
            <>
              <div className="min-h-0 flex-1 p-4">
                <div className="flex h-full items-center rounded-lg border border-line bg-panel p-2">
                  <FloorPlan
                    anchors={anchors}
                    live={freshLive}
                    trails={freshTrails}
                    tagIds={tagIds}
                    selectedTag={selectedTag}
                    onSelect={select}
                    mode={mode}
                    replayPath={mode === 'replay' ? trajectory : undefined}
                    replayMarker={mode === 'replay' ? replay.marker : null}
                    replayProgressIndex={replay.marker?.index}
                    heat={showHeat ? heat : null}
                  />
                </div>
              </div>
              {mode === 'replay' && trajectory.length > 1 && <ReplayBar replay={replay} />}
              {mode === 'replay' && trajectory.length <= 1 && (
                <div className="border-t border-line px-5 py-3 text-[12px] text-muted">
                  Selecciona un empleado y un periodo, y pulsa «Cargar jornada» para reproducir sus movimientos.
                </div>
              )}
            </>
          ) : (
            <InsightsPage status={status} tags={tags} tagIds={tagIds} period={period} />
          )}
        </main>
      </div>
    </div>
  )
}
