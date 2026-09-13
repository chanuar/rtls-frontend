import { qualityLevel, zoneAt } from '../config'
import { fmtDuration, type TrajectoryStats } from '../lib/trajectory'
import type { LivePosition } from '../types'

const Q_LABEL = { ok: 'Buena', warn: 'Regular', bad: 'Mala' } as const
const Q_CLASS = { ok: 'text-ok', warn: 'text-warn', bad: 'text-danger' } as const

export function LiveInfo({ pos, stale = false, now = Date.now() }: { pos: LivePosition | null; stale?: boolean; now?: number }) {
  if (!pos) {
    return <p className="text-muted">Esperando la primera posición válida.</p>
  }
  const q = qualityLevel(pos.quality)
  const zone = zoneAt(pos.x, pos.y)
  return (
    <div className="flex flex-col gap-3 font-mono text-[13px]">
      {stale && <p className="text-warn">Última posición conocida · hace {Math.max(0, Math.floor((now - Date.parse(pos.ts)) / 1000))} s. Ubicación actual sin confirmar.</p>}
      <Row k="Posición" v={`(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) m`} />
      <Row k={stale ? "Última zona" : "Zona"} v={zone?.name ?? 'Fuera de zona'} />
      <Row k={stale ? "Último ajuste RMS" : "Ajuste RMS"} v={<span className={Q_CLASS[q]}>{Q_LABEL[q]} · {pos.quality.toFixed(2)} m</span>} />
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
        <p className="mb-1.5 text-[13px] uppercase tracking-widest text-muted">Tiempo por zona</p>
        <div className="flex flex-col gap-1.5">
          {stats.perZoneS.map((z) => (
            <div key={z.zone}>
              <div className="mb-0.5 flex justify-between text-[13px]">
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
            <p className="text-[13px] text-muted">Ninguna posición cae dentro de las zonas definidas.</p>
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
    <div className="min-w-0">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  )
}
