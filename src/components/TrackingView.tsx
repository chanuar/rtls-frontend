import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FLOOR, TEST_LAYOUT, isFresh, tagColor } from '../config'
import { useStore } from '../store'
import { FloorPlan } from './FloorPlan'
import { LiveInfo } from './Stats'
import { ReplayBar, useReplay } from './Replay'
import { fmtDuration } from '../lib/trajectory'
import { heatColor, maxHeatCount } from '../lib/heatmap'
import type { Period } from './PeriodPicker'
import type { TagInfo } from '../types'
import type { Heatmap, Mode, Page, Sample } from '../types'

const STATUS = {
  online: { label: 'EN VIVO', dot: 'bg-ok' },
  demo: { label: 'DEMO', dot: 'bg-warn' },
  connecting: { label: 'CONECTANDO…', dot: 'bg-muted' },
} as const

function useNow() {
  const [, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Date.now()
}

function useLivePositions() {
  const status = useStore(s => s.status)
  const live = useStore(s => s.live)
  const now = useNow()
  const freshLive = Object.fromEntries(Object.entries(live).filter(([, p]) =>
    (status === 'online' || status === 'demo') && isFresh(p, now)))
  return { status, live, freshLive, now }
}

export function ConnectionBadge() {
  const { status, freshLive } = useLivePositions()
  const st = status === 'online' && !Object.keys(freshLive).length
    ? { label: 'CONECTADO · SIN POSICIONES RECIENTES', dot: 'bg-warn' } : STATUS[status]
  return <div className="connection-badge" role="status">
    <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${status === 'online' ? 'animate-pulse' : ''}`} />
    <span className="text-[13px] font-medium tracking-wide">{st.label}</span>
  </div>
}

export function ConnectionError() {
  const error = useStore(s => [s.connectionError, s.anchorError, s.tagError, s.positionError].filter(Boolean).join(' '))
  return error && <p role="alert" className="px-5 py-2 text-[13px] text-warn">{error}</p>
}

export function TagList({ page }: { page: Page }) {
  const tags = useStore(s => s.tags)
  const selectedTag = useStore(s => s.selectedTag)
  const select = useStore(s => s.select)
  const { live, freshLive } = useLivePositions()
  const tagIds = useMemo(() => tags.map(t => t.id), [tags])
  return (
          <section>
            <p className="mb-2 text-[13px] uppercase tracking-widest text-muted">
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
                    className="tag-option flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left hover:bg-panel disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{t.employee ?? t.id}</span>
                      <span className="block font-mono text-[13px] text-muted">{t.id}</span>
                    </span>
                    <span className={`tag-status ${freshLive[t.id] ? 'text-ok' : 'text-muted'}`}>
                      {freshLive[t.id] ? 'En vivo' : live[t.id] ? 'Sin actualizar' : 'Sin datos'}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
  )
}

export function SelectedLiveInfo() {
  const pos = useStore(s => s.selectedTag ? s.live[s.selectedTag] ?? null : null)
  const status = useStore(s => s.status)
  const now = useNow()
  return <LiveInfo pos={pos} stale={!!pos && (status === 'connecting' || !isFresh(pos, now))} now={now} />
}

export function Overview() {
  const tagCount = useStore(s => s.tags.length)
  const anchorCount = useStore(s => s.anchors.length)
  const selectedTag = useStore(s => s.selectedTag)
  const { live, freshLive } = useLivePositions()
  const selectedLive = selectedTag ? live[selectedTag] : null
  return (
              <div className="overview" role="group" aria-label="Resumen del sistema">
                <div><span>Tags con posición reciente</span><strong>{Object.keys(freshLive).length}<small> / {tagCount}</small></strong></div>
                <div><span>Anchors configurados</span><strong>{anchorCount}<small> referencias</small></strong></div>
                <div><span>Tag seleccionado</span><strong>{selectedTag ?? '—'}<small>{selectedLive ? (freshLive[selectedLive.tag] ? ' · en vivo' : ' · sin actualizar') : ' · sin datos'}</small></strong></div>
              </div>
  )
}

export function HistoryOverview({ tag, period, sampleCount, durationS }: {
  tag: TagInfo | undefined; period: Period; sampleCount: number | null; durationS: number | null
}) {
  const employee = tag?.employee?.trim()
  return <div className="overview history-overview" role="group" aria-label="Resumen del histórico">
    <div><span>Empleado / tag</span><strong>{employee || tag?.id || 'Sin tag'}</strong>{employee && <small>{tag?.id}</small>}</div>
    <div><span>Periodo solicitado</span><strong className="period-summary">
      {[period.start, period.end].map((date, i) => <span key={i}>
        {i === 0 ? 'Desde ' : 'Hasta '}{Number.isFinite(date.getTime())
          ? <time dateTime={date.toISOString()}>{date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</time>
          : 'pendiente'}
      </span>)}
    </strong></div>
    <div><span>Tiempo observado</span><strong>{durationS === null ? '—' : fmtDuration(durationS)}</strong>
      <small>{sampleCount === null ? 'Sin histórico cargado' : `${sampleCount} ${sampleCount === 1 ? 'muestra' : 'muestras'}`}</small>
      <span>Excluye huecos y saltos descartados.</span>
    </div>
  </div>
}

function MapCard({ mode, loading, heat, children, emptyState }: {
  mode: Mode; loading: boolean; heat: Heatmap | null; children: ReactNode; emptyState?: ReactNode
}) {
  const [detail, setDetail] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const hint = useId()
  const maxHeat = useMemo(() => maxHeatCount(heat), [heat])
  const canCenter = useStore(s => mode === 'live' && !!(s.selectedTag && s.live[s.selectedTag]))
  function centerSelection() {
    stage.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  useLayoutEffect(() => { if (detail) centerSelection() }, [detail])
  return <div className="map-card" aria-busy={loading}>
    <div className="map-heading"><div><span className="map-indicator" /> <h3>{TEST_LAYOUT ? 'Plano de prueba' : 'Plano de la farmacia'}</h3></div>
      <span>{mode === 'live' ? 'Seguimiento en vivo' : 'Reproducción'}{heat ? ' · mapa de calor' : ''}</span>
    </div>
    <div className="map-toolbar" role="group" aria-label="Vista del plano">
      <button type="button" aria-pressed={!detail} onClick={() => setDetail(false)}>Ajustar plano</button>
      <button type="button" aria-pressed={detail} onClick={() => setDetail(true)}>Ver detalle</button>
      {mode === 'live' && <button type="button" disabled={!canCenter} onClick={centerSelection}>Centrar tag</button>}
    </div>
    <p id={hint} className="map-hint">{detail ? 'Detalle · desplázate por el plano con las barras o las flechas del teclado.' : 'Abre «Ver detalle» para leer las zonas.'}</p>
    <div ref={stage} className="map-stage" data-view={detail ? 'detail' : 'fit'} role="region" aria-label="Plano desplazable" aria-describedby={hint} tabIndex={0}>
      {children}
    </div>
    {!TEST_LAYOUT && <p className="map-dimensions">Entrada a la izquierda · {FLOOR.depth.toLocaleString('es-ES')} m de fondo × {FLOOR.width.toLocaleString('es-ES')} m de ancho</p>}
    {emptyState}
    <div className="map-legend"><span><i className="legend-anchor" /> Anchor fijo</span><span><i className="legend-tag" /> Tag móvil</span><span><i className="legend-stale" /> Sin actualizar</span><span className="legend-scale">Cuadrícula · 1 m</span>
      {mode === 'replay' && <><span><i className="legend-played" /> Reproducido</span><span><i className="legend-pending" /> Pendiente</span></>}
      {heat && <span className="heat-legend" role="group" aria-label="Escala del mapa de calor">
        {maxHeat > 0 ? <><span className="heat-zero"><i aria-hidden="true" />0</span>
          {maxHeat > 1 && '1'}<i className="heat-scale" aria-hidden="true" style={{ background: `linear-gradient(90deg in oklab, ${heatColor(1 / maxHeat)}, ${heatColor(1)})` }} />
          {maxHeat.toLocaleString('es-ES')} {maxHeat === 1 ? 'muestra' : 'muestras'}/celda · máximo del periodo</>
          : 'Sin muestras en el mapa de calor'}
      </span>}
    </div>
  </div>
}

export function LiveMap({ loading, heat }: { loading: boolean; heat: Heatmap | null }) {
  const anchors = useStore(s => s.anchors)
  const tags = useStore(s => s.tags)
  const trails = useStore(s => s.trails)
  const selectedTag = useStore(s => s.selectedTag)
  const select = useStore(s => s.select)
  const { status, live, freshLive, now } = useLivePositions()
  const tagIds = useMemo(() => tags.map(t => t.id), [tags])
  const freshTrails = Object.fromEntries(Object.entries(trails).filter(([tag]) => tag in freshLive))
  return <MapCard mode="live" loading={loading} heat={heat} emptyState={Object.keys(live).length === 0 && (
    <div className="map-message" role="status"><strong>{status === 'connecting' ? 'Conectando con el sistema' : 'Esperando posiciones válidas'}</strong>
      <span>{status === 'connecting' ? 'El plano se actualizará cuando el backend esté disponible.' : 'Los tags aparecerán aquí cuando lleguen nuevas medidas.'}</span></div>
  )}>
    <FloorPlan anchors={anchors} live={live} freshTags={Object.keys(freshLive)} now={now} trails={freshTrails}
      tagIds={tagIds} selectedTag={selectedTag} onSelect={select} mode="live" heat={heat} />
  </MapCard>
}

export function ReplayMap({ active, samples, loading, heat, emptyMessage }: {
  active: boolean; samples: Sample[]; loading: boolean; heat: Heatmap | null; emptyMessage: string | null
}) {
  const anchors = useStore(s => s.anchors)
  const replay = useReplay(samples, active)
  if (!active) return null
  return <>
    <MapCard mode="replay" loading={loading} heat={heat}>
      <FloorPlan anchors={anchors} live={{}} trails={{}} tagIds={[]} selectedTag={null} onSelect={() => {}}
        mode="replay" replayPath={samples} replayMarker={replay.marker} replayTime={replay.cursor} heat={heat} />
    </MapCard>
    {samples.length > 1 ? <ReplayBar replay={replay} /> : (
      <div role="status" className="border-t border-line px-5 py-3 text-[13px] text-muted">
        {emptyMessage}
      </div>
    )}
  </>
}
