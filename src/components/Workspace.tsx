import { useMemo, useRef, useState } from 'react'
import { TEST_LAYOUT } from '../config'
import { useStore } from '../store'
import { InsightsPage } from './Insights'
import { PeriodPicker, todayPeriod, isValidPeriod, type Period } from './PeriodPicker'
import { ReplayStats } from './Stats'
import { TagList, SelectedLiveInfo, Overview, LiveMap, ReplayMap } from './TrackingView'
import type { Mode, Page } from '../types'
import { useHistory } from './useHistory'

export function Workspace({ page }: { page: Page }) {
  const demo = useStore(s => s.status === 'demo')
  const tags = useStore(s => s.tags)
  const selectedTag = useStore(s => s.selectedTag)
  const [mode, setMode] = useState<Mode>('live')
  const [showHeat, setShowHeat] = useState(false)
  const [period, setPeriod] = useState<Period>(todayPeriod)
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia('(min-width: 801px)').matches)
  const title = useRef<HTMLHeadingElement>(null)

  const { historyLoaded, trajectory, heat, heatError, heatLoading, loading, loadError, historyMessage, stats, loadRange } = useHistory({ selectedTag, period, demo, showHeat })
  const tagIds = useMemo(() => tags.map((t) => t.id), [tags])

  return (
      <div className="workspace">
        <aside className="sidebar" aria-label="Filtros y detalle del tag">
          <details open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
          <summary className="filter-summary">Filtros y estado <span>{selectedTag ?? 'Sin tag'}</span></summary>
          <div className="sidebar-content">
          {page === 'plan' && (
            <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
              {(['live', 'replay'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded px-2 py-1.5 text-[13px] ${
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
            <p className="mb-2 text-[13px] uppercase tracking-widest text-muted">Periodo</p>
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
                {loadError && <p role="alert" className="mt-2 text-[13px] text-warn">{loadError}</p>}
              </>
            )}
          </section>

          {page === 'plan' && (
            <>
              <section>
                <p className="mb-2 text-[13px] uppercase tracking-widest text-muted">Capas</p>
                <label className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={showHeat}
                    onChange={(e) => setShowHeat(e.target.checked)}
                    className="accent-accent"
                  />
                  Mapa de calor del periodo
                </label>
                {showHeat && heatError && <p role="alert" className="mt-1 text-[13px] text-warn">Mapa de calor: {heatError}</p>}
                {heatLoading && <p role="status" className="mt-1 text-[13px] text-muted">Cargando mapa de calor…</p>}
                {showHeat && !heat && !heatLoading && !heatError && (
                  <p className="mt-1 text-[13px] text-muted">Pulsa «Cargar jornada» para generarlo.</p>
                )}
              </section>

              <section className="detail-card">
                <p className="mb-2 text-[13px] uppercase tracking-widest text-muted">
                  {mode === 'live' ? `Estado de ${selectedTag ?? '—'}` : 'Estadísticas de la jornada'}
                </p>
                {mode === 'live' ? <SelectedLiveInfo /> : <ReplayStats stats={stats} emptyMessage={historyMessage} />}
              </section>
            </>
          )}

          <p className="sidebar-footnote">
            Las posiciones se muestran en metros. Una conexión activa no garantiza que haya medidas recientes.
          </p>
          </div>
          </details>
        </aside>

        <main className="main-content">
          {page === 'plan' ? (
            <>
              <div className="workspace-title">
                <div><p className="eyebrow">{mode === 'live' ? 'LOCALIZACIÓN · EN VIVO' : 'LOCALIZACIÓN · HISTÓRICO'}</p>
                  <h2 ref={title} tabIndex={-1}>{mode === 'live' ? 'Posiciones actuales' : 'Recorrido del periodo'}</h2>
                  <p>{mode === 'live' ? 'Consulta los tags y su última posición válida.' : 'Selecciona un tag y carga el periodo que quieras explorar.'}</p>
                </div>
                <span className="layout-badge">{TEST_LAYOUT ? 'Área de prueba' : 'Planta principal'}</span>
              </div>
              <Overview mode={mode} sampleCount={trajectory.length} />
              {mode === 'live' && <div role="status" className={loading || historyLoaded ? 'flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel p-3 text-[13px]' : 'sr-only'}>
                {loading ? 'Cargando jornada…' : historyLoaded && <>
                  <p>{trajectory.length === 0 ? historyMessage : `Histórico cargado de ${selectedTag}: ${trajectory.length} ${trajectory.length === 1 ? 'muestra' : 'muestras'}.`}</p>
                  {trajectory.length > 0 && <button type="button" className="primary-button" onClick={() => {
                    setMode('replay')
                    title.current?.focus()
                  }}>Ver histórico</button>}
                </>}
              </div>}
              {mode === 'live' && <LiveMap loading={loading} heat={showHeat ? heat : null} />}
            </>
          ) : (
            <InsightsPage key={JSON.stringify([period.start.getTime(), period.end.getTime(), demo, tagIds])}
              status={demo ? 'demo' : 'online'} tags={tags} tagIds={tagIds} period={period} />
          )}
          <ReplayMap active={page === 'plan' && mode === 'replay'} samples={trajectory}
            loading={loading} heat={showHeat ? heat : null} emptyMessage={historyMessage} />
        </main>
      </div>
  )
}
