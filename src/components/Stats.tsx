import { qualityLevel, zoneAt } from '../config'
import { fmtDuration, type TrajectoryStats } from '../lib/trajectory'
import type { LivePosition } from '../types'

const Q_LABEL = { ok: 'Buena', warn: 'Regular', bad: 'Mala' } as const
const Q_CLASS = { ok: 'text-ok', warn: 'text-warn', bad: 'text-danger' } as const

export function LiveInfo({ pos }: { pos: LivePosition | null }) {
  if (!pos) {
    return <p className="text-muted">Sin posición reciente. Esperando una medida válida; las posiciones caducan a los 10 segundos.</p>
  }
  const q = qualityLevel(pos.quality)
  const zone = zoneAt(pos.x, pos.y)
  return (
    <div className="flex flex-col gap-3 font-mono text-[12px]">
      <Row k="Posición" v={`(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) m`} />
      <Row k="Zona" v={zone?.name ?? 'Fuera de zona'} />
      <Row k="Ajuste RMS" v={<span className={Q_CLASS[q]}>{Q_LABEL[q]} · {pos.quality.toFixed(2)} m</span>} />
      <Row k="Anchors" v={String(pos.n_anchors)} />
      <Row k="Última" v={new Date(pos.ts).toLocaleTimeString('es-ES')} />
    </div>
  )
}

export function ReplayStats({ stats }: { stats: TrajectoryStats | null }) {
  if (!stats) return <p className="text-muted">Carga una jornada para ver sus estadísticas.</p>
  const maxZone = Math.max(1, ...stats.perZoneS.map((z) => z.seconds))
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Distancia" value={`${stats.distanceM.toFixed(0)} m`} />
        <Stat label="Paradas" value={String(stats.stops)} />
        <Stat label="Tiempo" value={fmtDuration(stats.durationS)} />
      </div>
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted">Tiempo por zona</p>
        <div className="flex flex-col gap-1.5">
          {stats.perZoneS.map((z) => (
            <div key={z.zone}>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span>{z.name}</span>
                <span className="font-mono text-muted">{fmtDuration(z.seconds)}</span>
              </div>
              <div className="h-1 rounded bg-panel-2">
                <div
                  className="h-1 rounded bg-accent/70"
                  style={{ width: `${(z.seconds / maxZone) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {stats.perZoneS.length === 0 && (
            <p className="text-[11px] text-muted">Ninguna posición cae dentro de las zonas definidas.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-2 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  )
}
