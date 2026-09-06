import { useEffect, useMemo, useRef, useState } from 'react'
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
const EMPTY_SAMPLES: Sample[] = []

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

  const queryKey = JSON.stringify([selectedTag, period.start.getTime(), period.end.getTime(), status === 'demo'])
  const [loaded, setLoaded] = useState<{ key: string; trajectory: Sample[]; heat: Heatmap } | null>(null)
  const trajectory = loaded?.key === queryKey ? loaded.trajectory : EMPTY_SAMPLES
  const heat = loaded?.key === queryKey ? loaded.heat : null
  const request = useRef(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    setLoading(false)
    setLoadError(null)
    return () => { request.current++ }
  }, [queryKey])

  useEffect(() => {
    void init()
    return () => useStore.getState().stop()
  }, [init])

  const tagIds = useMemo(() => tags.map((t) => t.id), [tags])
  const replay = useReplay(trajectory)
  const stats = useMemo(() => (trajectory.length > 1 ? analyzeTrajectory(trajectory) : null), [trajectory])

  async function loadRange() {
    if (!selectedTag) return
    if (period.end <= period.start) {
      setLoadError('El final debe ser posterior al inicio.')
      return
    }
    const id = ++request.current
    setLoading(true)
    setLoadError(null)
    setLoaded(null)
    try {
      if (status === 'demo') {
        const traj = demoTrajectory(selectedTag, period.start, period.end)
        setLoaded({ key: queryKey, trajectory: traj, heat: { cell: 0.5, bins: demoHeatmap(traj, 0.5) } })
      } else {
        const [traj, hm] = await Promise.all([
          fetchPositions(selectedTag, period.start, period.end),
          fetchHeatmap(period.start, period.end, 0.5, selectedTag),
        ])
        if (id !== request.current) return
        setLoaded({ key: queryKey, trajectory: traj, heat: hm })
        if (traj.length === 0) setLoadError('No hay posiciones en ese periodo. Prueba otro o arranca el simulador.')
      }
    } catch (err) {
      if (id === request.current) setLoadError(err instanceof Error ? err.message : 'Error al cargar los datos')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }

  const st = status === 'online' && !Object.keys(freshLive).length
    ? { label: 'CONECTADO · SIN POSICIONES RECIENTES', dot: 'bg-warn' } : STATUS[status]
  const selectedLive = selectedTag ? (freshLive[selectedTag] ?? null) : null

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-navigation">
          <div className="flex items-center gap-3">
            <div className="brand-mark" aria-hidden="true">
              UWB
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight">
                RTLS · {TEST_LAYOUT ? 'Prueba UWB' : 'Farmacia'}
              </h1>
              <p className="mt-0.5 text-[11px] text-muted">
                Localización en interiores
              </p>
            </div>
          </div>
          <nav className="page-navigation" aria-label="Navegación principal">
            {(
              [
                ['plan', 'Plano'],
                ['insights', 'Análisis'],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-current={page === p ? 'page' : undefined}
                className={`rounded px-3 py-1 text-[12px] ${
                  page === p ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="connection-badge" role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${status === 'online' ? 'animate-pulse' : ''}`} />
          <span className="text-[11px] font-medium tracking-wide">{st.label}</span>
        </div>
      </header>

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

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
              {page === 'insights' ? 'Tags analizados' : 'Seleccionar tag'}
            </p>
            <div className="flex flex-col gap-1">
              {tags.length === 0 && (
                <p className="empty-note">Todavía no hay tags disponibles. Se mostrarán al recibir datos del sistema.</p>
              )}
              {tags.map((t) => {
                const color = tagColor(t.id, tagIds)
                const isSel = t.id === selectedTag && page === 'plan'
                return (
                  <button
                    key={t.id}
                    onClick={() => select(t.id)}
                    aria-pressed={isSel}
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
                    <span className={`tag-status ${freshLive[t.id] ? 'text-ok' : 'text-muted'}`}>
                      {freshLive[t.id] ? 'En vivo' : 'Sin datos'}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">Periodo</p>
            <PeriodPicker value={period} onChange={setPeriod} />
            {page === 'plan' && (
              <>
                <button
                  onClick={() => void loadRange()}
                  disabled={loading || !selectedTag}
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
                {showHeat && !heat && (
                  <p className="mt-1 text-[11px] text-muted">Pulsa «Cargar jornada» para generarlo.</p>
                )}
              </section>

              <section className="detail-card">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
                  {mode === 'live' ? `Estado de ${selectedTag ?? '—'}` : 'Estadísticas de la jornada'}
                </p>
                {mode === 'live' ? <LiveInfo pos={selectedLive} /> : <ReplayStats stats={stats} />}
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
              <div className="overview" aria-label="Resumen del sistema">
                <div><span>Tags con posición reciente</span><strong>{Object.keys(freshLive).length}<small> / {tags.length}</small></strong></div>
                <div><span>Anchors configurados</span><strong>{anchors.length}<small> referencias</small></strong></div>
                <div><span>{mode === 'live' ? 'Tag seleccionado' : 'Muestras del periodo'}</span><strong>{mode === 'live' ? (selectedTag ?? '—') : trajectory.length}<small>{mode === 'live' ? (selectedLive ? ' · en vivo' : ' · sin datos') : ' posiciones'}</small></strong></div>
              </div>
              <div className="map-card" aria-busy={loading}>
                <div className="map-heading"><div><span className="map-indicator" /> <h3>{TEST_LAYOUT ? 'Plano de prueba' : 'Plano de la farmacia'}</h3></div>
                  <span>{mode === 'live' ? 'Seguimiento en vivo' : 'Reproducción'}{showHeat && heat ? ' · mapa de calor' : ''}</span>
                </div>
                <div className="map-stage" role="region" aria-label="Plano desplazable" tabIndex={0}>
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
                    replayTime={replay.cursor}
                    heat={showHeat ? heat : null}
                  />
                </div>
                {mode === 'live' && Object.keys(freshLive).length === 0 && (
                  <div className="map-message" role="status"><strong>{status === 'connecting' ? 'Conectando con tu espacio' : 'Esperando posiciones válidas'}</strong>
                    <span>{status === 'connecting' ? 'El plano se actualizará cuando el backend esté disponible.' : 'Los tags aparecerán aquí cuando lleguen nuevas medidas.'}</span></div>
                )}
                <div className="map-legend"><span><i className="legend-anchor" /> Anchor fijo</span><span><i className="legend-tag" /> Tag móvil</span><span className="legend-scale">Cuadrícula · 1 m</span>
                  {showHeat && heat && <span>Menos <i className="heat-scale" /> Más muestras</span>}
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
            <InsightsPage key={JSON.stringify([period.start.getTime(), period.end.getTime(), status === 'demo', tagIds])}
              status={status} tags={tags} tagIds={tagIds} period={period} />
          )}
        </main>
      </div>
    </div>
  )
}
