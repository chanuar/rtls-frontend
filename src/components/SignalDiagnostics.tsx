import { useMemo } from 'react'
import { useStore } from '../store'
import { analyzeSignal } from '../lib/signal'
import { fmtDuration, MAX_GAP_S } from '../lib/trajectory'
import { HistoryOverview, SelectedLiveInfo } from './TrackingView'
import type { Sample, TagInfo } from '../types'
import type { Period } from './PeriodPicker'
import type { useHistory } from './useHistory'

const EMPTY_SAMPLES: Sample[] = []
const TABLE_LIMIT = 20
const metric = (value: number | null, unit: string) => value === null
  ? 'Sin datos' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${unit}`

function RecentSignal() {
  const samples = useStore(s => s.selectedTag ? s.trails[s.selectedTag] ?? EMPTY_SAMPLES : EMPTY_SAMPLES)
  const signal = useMemo(() => analyzeSignal(samples), [samples])
  return <section className="detail-card" aria-label="Señal actual">
    <h3 className="section-title">Última posición recibida</h3>
    <SelectedLiveInfo />
    <dl className="signal-facts mt-4">
      <div><dt>Frecuencia reciente</dt><dd>{metric(signal.cadenceHz, 'Hz')}</dd></div>
      <div><dt>Muestras recientes</dt><dd>{samples.length}</dd></div>
    </dl>
    <p className="field-hint mt-3">Frecuencia media entre la primera y la última muestra reciente; incluye las interrupciones entre ellas.</p>
  </section>
}

export function SignalDiagnostics({ tag, period, history }: {
  tag: TagInfo | undefined; period: Period; history: ReturnType<typeof useHistory>
}) {
  const signal = useMemo(() => analyzeSignal(history.trajectory), [history.trajectory])
  const recent = useMemo(() => history.trajectory.slice(-TABLE_LIMIT).reverse(), [history.trajectory])
  const gaps = useMemo(() => signal.gaps.slice(-TABLE_LIMIT).reverse(), [signal])
  return <section className="analysis-content" aria-label="Diagnóstico de señal">
    <div className="workspace-title"><div>
      <p className="eyebrow">INSTRUMENTACIÓN · SEÑAL</p>
      <h2 tabIndex={-1}>Diagnóstico de señal</h2>
      <p>Estado y calidad de las posiciones de {tag?.employee?.trim() || tag?.id || 'tu tag seleccionado'}.</p>
    </div></div>
    <div className="detail-grid">
      <RecentSignal />
      <section className="detail-card" aria-label="Cómo interpretar la señal">
        <h3 className="section-title">Cómo leer las medidas</h3>
        <p>El RMS indica el residuo del ajuste de distancias, en metros. Un valor menor significa un mejor ajuste; no mide el error respecto a la posición real.</p>
        <p className="mt-3">«Anchors» cuenta las referencias utilizadas en esa posición. No confirma el estado individual de cada anchor.</p>
        <p className="field-hint mt-3">Se muestran posiciones aceptadas. Un hueco indica ausencia de muestras; por sí solo no identifica su causa.</p>
      </section>
    </div>
    <h3 className="section-title">Señal del periodo</h3>
    <HistoryOverview tag={tag} period={period} sampleCount={history.historyLoaded ? history.trajectory.length : null}
      durationS={history.historyLoaded ? history.stats?.durationS ?? 0 : null} />
    {!history.historyLoaded || history.trajectory.length === 0 ? <p role="status" className="empty-note">{history.historyMessage}</p> : <>
      <dl className="signal-metrics" aria-label="Calidad del histórico">
        <div><dt>RMS medio</dt><dd>{metric(signal.meanRms, 'm')}<small>{signal.qualitySamples} muestras con RMS</small></dd></div>
        <div><dt>RMS máximo</dt><dd>{metric(signal.maxRms, 'm')}<small>Entre las posiciones aceptadas</small></dd></div>
        <div><dt>Anchors utilizados</dt><dd>{signal.minAnchors === null ? 'Sin datos' : `${signal.minAnchors}–${signal.maxAnchors}`}<small>{signal.anchorSamples} muestras con este dato</small></dd></div>
        <div><dt>Frecuencia media</dt><dd>{metric(signal.cadenceHz, 'Hz')}<small>Entre primera y última muestra, incluidos huecos</small></dd></div>
      </dl>
      <details className="detail-card">
        <summary className="filter-summary">Interrupciones entre muestras · {signal.gaps.length}</summary>
        <p className="field-hint mb-3">Intervalos mayores de {MAX_GAP_S} s. No se incluyen los extremos del periodo sin muestras.</p>
        {gaps.length === 0 ? <p>No hay interrupciones mayores de {MAX_GAP_S} s entre las muestras recibidas.</p> :
          <div className="data-table-wrap" role="region" aria-label="Interrupciones del periodo" tabIndex={0}>
            <table className="data-table">
              <caption>Últimas {gaps.length} de {signal.gaps.length} interrupciones · hora local</caption>
              <thead><tr><th scope="col">Desde</th><th scope="col">Hasta</th><th scope="col">Duración</th></tr></thead>
              <tbody>{gaps.map(gap => <tr key={gap.start}>
                <td><time dateTime={gap.start}>{new Date(gap.start).toLocaleString('es-ES')}</time></td>
                <td><time dateTime={gap.end}>{new Date(gap.end).toLocaleString('es-ES')}</time></td>
                <td>{fmtDuration(gap.seconds)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </details>
      <div className="data-table-wrap" role="region" aria-label="Muestras del periodo" tabIndex={0}>
        <table className="data-table">
          <caption>Últimas {recent.length} de {history.trajectory.length} muestras del periodo · hora local</caption>
          <thead><tr><th scope="col">Fecha y hora</th><th scope="col">RMS</th><th scope="col">Anchors</th></tr></thead>
          <tbody>{recent.map(sample => <tr key={sample.ts}>
            <th scope="row"><time dateTime={sample.ts}>{new Date(sample.ts).toLocaleString('es-ES')}</time></th>
            <td>{metric(sample.quality, 'm')}</td><td>{sample.n_anchors ?? 'Sin datos'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>
}
