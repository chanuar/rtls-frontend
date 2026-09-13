import { HistoryOverview, SelectedLiveInfo } from './TrackingView'
import { ReplayStats } from './Stats'
import { isValidPeriod, type Period } from './PeriodPicker'
import type { Mode, TagInfo } from '../types'
import type { useHistory } from './useHistory'

export function TagProfile({ tag, period, history, onOpenMap, onOpenSignal }: {
  tag: TagInfo | undefined; period: Period; history: ReturnType<typeof useHistory>
  onOpenMap: (mode: Mode) => void; onOpenSignal: () => void
}) {
  const first = history.trajectory[0], last = history.trajectory[history.trajectory.length - 1]
  const coverage = history.historyLoaded && isValidPeriod(period)
    ? (history.stats?.durationS ?? 0) / ((period.end.getTime() - period.start.getTime()) / 1000) : null
  const coverageText = coverage === null ? 'Sin histórico cargado'
    : coverage > 0 && coverage < 0.0001 ? 'Menos del 0,01 %'
      : coverage.toLocaleString('es-ES', { style: 'percent', maximumFractionDigits: 2 })

  return <section className="analysis-content" aria-label="Ficha del tag">
    <div className="workspace-title">
      <div><p className="eyebrow">SEGUIMIENTO · TAG</p><h2 tabIndex={-1}>Ficha del tag</h2>
        <p>{tag?.employee?.trim() || tag?.id || 'Selecciona un tag para consultar su ficha.'}</p>
      </div>
      <button type="button" className="primary-button" disabled={!tag} onClick={() => onOpenMap('live')}>Ver en el plano</button>
    </div>
    {!tag ? <p className="empty-note" role="status">Todavía no hay un tag seleccionado. Elige uno de la lista cuando esté disponible.</p> : <>
      <div className="detail-grid">
        <section className="detail-card" aria-label="Identidad del tag">
          <h3 className="section-title">Identidad</h3>
          <dl className="signal-facts">
            <div><dt>Identificador</dt><dd>{tag.id}</dd></div>
            <div><dt>Nombre asignado</dt><dd>{tag.employee?.trim() || 'Sin nombre asignado'}</dd></div>
            <div><dt>Estado en el catálogo</dt><dd>{tag.active ? 'Activo' : 'Inactivo'}</dd></div>
          </dl>
          <p className="field-hint mt-4">El estado del catálogo es independiente de la recepción de posiciones recientes.</p>
        </section>
        <section className="detail-card" aria-label="Última posición del tag">
          <h3 className="section-title">Última posición</h3>
          <SelectedLiveInfo />
          <div className="page-actions"><button type="button" className="secondary-button" onClick={onOpenSignal}>Ver diagnóstico de señal</button></div>
        </section>
      </div>
      <div className="workspace-title">
        <h3 className="section-title">Resumen del periodo</h3>
        <button type="button" className="secondary-button" disabled={history.loading || !first}
          onClick={() => onOpenMap('replay')}>Ver recorrido en el plano</button>
      </div>
      <HistoryOverview tag={tag} period={period} sampleCount={history.historyLoaded ? history.trajectory.length : null}
        durationS={history.historyLoaded ? history.stats?.durationS ?? 0 : null} />
      {history.historyMessage && <p className="empty-note" role="status">{history.historyMessage}</p>}
      {history.historyLoaded && <div className="detail-grid">
        <section className="detail-card" aria-label="Cobertura del periodo">
          <h3 className="section-title">Cobertura observada</h3>
          <p className="coverage-value">{coverageText}</p>
          <p className="field-hint mb-4">Proporción del periodo con intervalos válidos. Excluye huecos y saltos descartados.</p>
          <dl className="signal-facts">
            <div><dt>Primera muestra</dt><dd>{first ? <time dateTime={first.ts}>{new Date(first.ts).toLocaleString('es-ES')}</time> : 'Sin muestras'}</dd></div>
            <div><dt>Última muestra</dt><dd>{last ? <time dateTime={last.ts}>{new Date(last.ts).toLocaleString('es-ES')}</time> : 'Sin muestras'}</dd></div>
          </dl>
        </section>
        {history.stats && <section className="detail-card" aria-label="Actividad del periodo">
          <h3 className="section-title">Actividad registrada</h3>
          <ReplayStats stats={history.stats} emptyMessage={history.historyMessage} />
        </section>}
      </div>}
    </>}
  </section>
}
