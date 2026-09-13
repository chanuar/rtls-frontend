import { useEffect, useMemo, useRef, useState } from 'react'
import { TEST_LAYOUT } from '../config'
import { fetchHeatmap, fetchPositions } from '../lib/api'
import { demoHeatmap, demoTrajectory } from '../lib/demo'
import { analyzeTrajectory } from '../lib/trajectory'
import { useStore } from '../store'
import { InsightsPage } from './Insights'
import { PeriodPicker, todayPeriod, isValidPeriod, type Period } from './PeriodPicker'
import { ReplayStats } from './Stats'
import { TagList, SelectedLiveInfo, Overview, LiveMap, ReplayMap } from './TrackingView'
import type { Heatmap, Mode, Page, Sample } from '../types'

const EMPTY_SAMPLES: Sample[] = []

export function Workspace({ page }: { page: Page }) {
  const demo = useStore(s => s.status === 'demo')
  const tags = useStore(s => s.tags)
  const selectedTag = useStore(s => s.selectedTag)
  const [mode, setMode] = useState<Mode>('live')
  const [showHeat, setShowHeat] = useState(false)
  const [period, setPeriod] = useState<Period>(todayPeriod)

  const queryKey = JSON.stringify([selectedTag, period.start.getTime(), period.end.getTime(), demo])
  const [loaded, setLoaded] = useState<{ key: string; trajectory: Sample[] } | null>(null)
  const trajectory = loaded?.key === queryKey ? loaded.trajectory : EMPTY_SAMPLES
  const [heatResult, setHeatResult] = useState<{ source: typeof loaded; heat: Heatmap | null; error: string | null } | null>(null)
  const currentHeat = loaded?.key === queryKey && heatResult?.source === loaded ? heatResult : null
  const heat = currentHeat?.heat ?? null
  const heatError = currentHeat?.error ?? null
  const heatLoading = showHeat && loaded?.key === queryKey && !currentHeat
  useEffect(() => {
    if (!showHeat || !loaded || loaded.key !== queryKey || !selectedTag) return
    let cancelled = false
    setHeatResult(null)
    const pending = demo
      ? Promise.resolve({ cell: 0.5, bins: demoHeatmap(loaded.trajectory, 0.5) })
      : fetchHeatmap(period.start, period.end, 0.5, selectedTag)
    pending.then(
      heat => { if (!cancelled) setHeatResult({ source: loaded, heat, error: null }) },
      error => { if (!cancelled) setHeatResult({ source: loaded, heat: null, error: error instanceof Error ? error.message : 'Error al cargar el mapa de calor.' }) },
    )
    return () => { cancelled = true }
  }, [showHeat, loaded, queryKey, selectedTag, demo, period])
  const request = useRef(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    request.current = request.current + 1
    setLoading(false)
    setLoadError(null)
    return () => { request.current++ }
  }, [queryKey])

  const tagIds = useMemo(() => tags.map((t) => t.id), [tags])
  const stats = useMemo(() => (trajectory.length > 1 ? analyzeTrajectory(trajectory) : null), [trajectory])

  async function loadRange() {
    if (!selectedTag) return
    if (!isValidPeriod(period)) {
      setLoadError('El final debe ser posterior al inicio.')
      return
    }
    const id = ++request.current
    setLoading(true)
    setLoadError(null)
    setLoaded(null)
    try {
      if (demo) {
        const traj = demoTrajectory(selectedTag, period.start, period.end)
        setLoaded({ key: queryKey, trajectory: traj })
      } else {
        const traj = await fetchPositions(selectedTag, period.start, period.end)
        if (id !== request.current) return
        setLoaded({ key: queryKey, trajectory: traj })
        if (traj.length === 0) setLoadError('No hay posiciones en ese periodo. Prueba otro o arranca el simulador.')
      }
    } catch (err) {
      if (id === request.current) setLoadError(err instanceof Error ? err.message : 'Error al cargar los datos')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }

  return (
      <div className="workspace">
        <aside className="sidebar" aria-label="Filtros y detalle del tag">
          <div className="sidebar-heading"><span className="eyebrow">CONTROL DE SEGUIMIENTO</span><h2>Tu espacio, en detalle</h2></div>
          {page === 'plan' && (
            <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
              {(['live', 'replay'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded px-2 py-1.5 text-[12px] ${
                    mode === m ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
                  }`}
                >
                  {m === 'live' ? 'En vivo' : 'Reproducción'}
                </button>
              ))}
            </div>
          )}

          <TagList page={page} />

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">Periodo</p>
            <PeriodPicker value={period} onChange={setPeriod} />
            {page === 'plan' && (
              <>
                <button
                  onClick={() => void loadRange()}
                  disabled={loading || !selectedTag || !isValidPeriod(period)}
                  className="primary-button mt-3 w-full"
                >
                  {loading ? 'Cargando…' : 'Cargar jornada'}
                </button>
                {loadError && <p role="alert" className="mt-2 text-[12px] text-warn">{loadError}</p>}
              </>
            )}
          </section>

          {page === 'plan' && (
            <>
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
                {showHeat && heatError && <p role="alert" className="mt-1 text-[11px] text-warn">Mapa de calor: {heatError}</p>}
                {heatLoading && <p role="status" className="mt-1 text-[11px] text-muted">Cargando mapa de calor…</p>}
                {showHeat && !heat && !heatLoading && !heatError && (
                  <p className="mt-1 text-[11px] text-muted">Pulsa «Cargar jornada» para generarlo.</p>
                )}
              </section>

              <section className="detail-card">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
                  {mode === 'live' ? `Estado de ${selectedTag ?? '—'}` : 'Estadísticas de la jornada'}
                </p>
                {mode === 'live' ? <SelectedLiveInfo /> : <ReplayStats stats={stats} />}
              </section>
            </>
          )}

          <p className="sidebar-footnote">
            Las posiciones se muestran en metros. Una conexión activa no garantiza que haya medidas recientes.
          </p>
        </aside>

        <main className="main-content">
          {page === 'plan' ? (
            <>
              <div className="workspace-title">
                <div><p className="eyebrow">{mode === 'live' ? 'AHORA · VISTA GENERAL' : 'HISTÓRICO · RECORRIDOS'}</p>
                  <h2>{mode === 'live' ? 'Cada posición, a la vista.' : 'Vuelve a recorrer la jornada.'}</h2>
                  <p>{mode === 'live' ? 'Consulta los tags y su última posición válida.' : 'Selecciona un tag y carga el periodo que quieras explorar.'}</p>
                </div>
                <span className="layout-badge">{TEST_LAYOUT ? 'Área de prueba' : 'Planta principal'}</span>
              </div>
              <Overview mode={mode} sampleCount={trajectory.length} />
              {mode === 'live' && <LiveMap loading={loading} heat={showHeat ? heat : null} />}
            </>
          ) : (
            <InsightsPage key={JSON.stringify([period.start.getTime(), period.end.getTime(), demo, tagIds])}
              status={demo ? 'demo' : 'online'} tags={tags} tagIds={tagIds} period={period} />
          )}
          <ReplayMap active={page === 'plan' && mode === 'replay'} samples={trajectory}
            loading={loading} heat={showHeat ? heat : null} />
        </main>
      </div>
  )
}
