import { useMemo, useState } from 'react'
import { ENTRANCE, FLOOR, TEST_LAYOUT, ZONES, qualityLevel, tagColor } from '../config'
import type { Anchor, HeatBin, LivePosition, Sample } from '../types'
import { isContinuous } from '../lib/trajectory'

const SCALE = 64 // px por metro
const MARGIN = 0.7 // metros de margen alrededor de los anchors

interface Props {
  anchors: Anchor[]
  live: Record<string, LivePosition>
  trails: Record<string, Sample[]>
  tagIds: string[]
  selectedTag: string | null
  onSelect: (tag: string) => void
  mode: 'live' | 'replay'
  replayPath?: Sample[]
  replayMarker?: { x: number; y: number } | null
  replayTime?: number
  heat?: { cell: number; bins: HeatBin[] } | null
}

const QUALITY_COLOR = { ok: '#34d399', warn: '#fbbf24', bad: '#f87171' } as const

function heatColor(t: number): string {
  // cian → verde → ámbar → rojo
  const hue = 195 * (1 - t)
  return `hsl(${hue} 90% 55%)`
}

export function FloorPlan(p: Props) {
  const [hoverZone, setHoverZone] = useState<string | null>(null)

  const bounds = useMemo(() => {
    const xs = p.anchors.map((a) => a.x)
    const ys = p.anchors.map((a) => a.y)
    const areaMinX = TEST_LAYOUT && xs.length ? Math.min(...xs) : 0
    const areaMinY = TEST_LAYOUT && ys.length ? Math.min(...ys) : 0
    const areaMaxX = TEST_LAYOUT && xs.length ? Math.max(...xs) : FLOOR.depth
    const areaMaxY = TEST_LAYOUT && ys.length ? Math.max(...ys) : FLOOR.width
    const minX = areaMinX - MARGIN
    const minY = areaMinY - MARGIN
    const maxX = areaMaxX + MARGIN
    const maxY = areaMaxY + MARGIN
    return { minX, minY, w: maxX - minX, h: maxY - minY, areaMinX, areaMinY, areaMaxX, areaMaxY }
  }, [p.anchors])

  const X = (x: number) => (x - bounds.minX) * SCALE
  const Y = (y: number) => (y - bounds.minY) * SCALE
  const W = bounds.w * SCALE
  const H = bounds.h * SCALE

  const gridLines = useMemo(() => {
    const v: number[] = []
    const h: number[] = []
    for (let x = Math.ceil(bounds.minX); x <= bounds.minX + bounds.w; x++) v.push(x)
    for (let y = Math.ceil(bounds.minY); y <= bounds.minY + bounds.h; y++) h.push(y)
    return { v, h }
  }, [bounds])

  const maxHeat = useMemo(
    () => Math.max(1, ...(p.heat?.bins.map((b) => b.count) ?? [1])),
    [p.heat],
  )

  const trailsToDraw = p.mode === 'live' ? p.trails : {}
  const pathData = (samples: Sample[]) => samples.map((s, i) =>
    `${i && isContinuous(samples[i - 1], s) ? 'L' : 'M'} ${X(s.x)} ${Y(s.y)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      role="img"
      aria-label={TEST_LAYOUT ? 'Área de prueba con posiciones UWB' : 'Plano de la farmacia con posiciones de empleados'}
      style={{ maxHeight: '100%' }}
    >
      {/* Rejilla de 1 m */}
      {gridLines.v.map((x) => (
        <line key={`v${x}`} x1={X(x)} y1={0} x2={X(x)} y2={H} stroke="rgba(148,163,184,0.06)" />
      ))}
      {gridLines.h.map((y) => (
        <line key={`h${y}`} x1={0} y1={Y(y)} x2={W} y2={Y(y)} stroke="rgba(148,163,184,0.06)" />
      ))}

      {TEST_LAYOUT ? (
        <rect
          x={X(bounds.areaMinX)}
          y={Y(bounds.areaMinY)}
          width={(bounds.areaMaxX - bounds.areaMinX) * SCALE}
          height={(bounds.areaMaxY - bounds.areaMinY) * SCALE}
          fill="rgba(0,212,255,0.025)"
          stroke="rgba(0,212,255,0.35)"
          strokeWidth={2}
          strokeDasharray="7 5"
        />
      ) : (
        <>
          {/* Contorno del local (muro perimetral con hueco de entrada en la fachada) */}
          <path
            d={`M ${X(0)} ${Y(ENTRANCE.y0)} L ${X(0)} ${Y(0)} L ${X(FLOOR.depth)} ${Y(0)} L ${X(FLOOR.depth)} ${Y(FLOOR.width)} L ${X(0)} ${Y(FLOOR.width)} L ${X(0)} ${Y(ENTRANCE.y1)}`}
            fill="none"
            stroke="rgba(148,163,184,0.55)"
            strokeWidth={3}
            strokeLinejoin="miter"
          />
          <text
            x={X(-0.35)}
            y={Y((ENTRANCE.y0 + ENTRANCE.y1) / 2)}
            fill="#5d6b7e"
            fontSize={10}
            textAnchor="middle"
            transform={`rotate(-90 ${X(-0.35)} ${Y((ENTRANCE.y0 + ENTRANCE.y1) / 2)})`}
            style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
          >
            Entrada
          </text>
        </>
      )}

      {/* Zonas */}
      {ZONES.map((z) => (
        <g
          key={z.id}
          onMouseEnter={() => setHoverZone(z.id)}
          onMouseLeave={() => setHoverZone(null)}
        >
          <rect
            x={X(z.x)}
            y={Y(z.y)}
            width={z.w * SCALE}
            height={z.h * SCALE}
            rx={6}
            fill={hoverZone === z.id ? 'rgba(0,212,255,0.06)' : 'rgba(148,163,184,0.03)'}
            stroke={hoverZone === z.id ? 'rgba(0,212,255,0.35)' : 'rgba(148,163,184,0.18)'}
            strokeDasharray="5 4"
          />
          {z.w * SCALE >= 90 && (
            <text
              x={X(z.x) + 7}
              y={Y(z.y) + 15}
              fill={hoverZone === z.id ? '#00d4ff' : '#5d6b7e'}
              fontSize={10}
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {z.name}
            </text>
          )}
          <title>{`${z.name} · ${(z.w * z.h).toFixed(1)} m²`}</title>
        </g>
      ))}

      {/* Heatmap */}
      {p.heat?.bins.map((b) => {
        const t = b.count / maxHeat
        return (
          <rect
            key={`${b.cx},${b.cy}`}
            x={X(b.cx * p.heat!.cell)}
            y={Y(b.cy * p.heat!.cell)}
            width={p.heat!.cell * SCALE}
            height={p.heat!.cell * SCALE}
            fill={heatColor(t)}
            opacity={0.12 + 0.5 * t}
            rx={2}
          />
        )
      })}

      {/* Trayectoria del replay */}
      {p.mode === 'replay' && p.replayPath && p.replayPath.length > 1 && (
        <>
          <path
            d={pathData(p.replayPath)}
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth={1.5}
          />
          <path
            d={pathData(p.replayPath.filter(s => Date.parse(s.ts) <= (p.replayTime ?? 0)))}
            fill="none"
            stroke="#00d4ff"
            strokeWidth={2}
            strokeOpacity={0.8}
            strokeLinejoin="round"
          />
        </>
      )}

      {/* Anchors */}
      {p.anchors.map((a) => (
        <g key={a.id}>
          <rect
            x={X(a.x) - 5}
            y={Y(a.y) - 5}
            width={10}
            height={10}
            transform={`rotate(45 ${X(a.x)} ${Y(a.y)})`}
            fill="#101a28"
            stroke="rgba(0,212,255,0.5)"
            strokeWidth={1.2}
          />
          <text x={X(a.x) + 10} y={Y(a.y) + 4} fill="#5d6b7e" fontSize={10} fontFamily="var(--font-mono)">
            {a.id}
          </text>
          <title>{`${a.id} · (${a.x}, ${a.y}, ${a.z} m)${a.description ? ' · ' + a.description : ''}`}</title>
        </g>
      ))}

      {/* Estelas en vivo */}
      {Object.entries(trailsToDraw).map(([tag, trail]) => {
        const color = tagColor(tag, p.tagIds)
        return trail.slice(1).map((s, i) => isContinuous(trail[i], s) && (
          <line
            key={`${tag}-${i}`}
            x1={X(trail[i].x)}
            y1={Y(trail[i].y)}
            x2={X(s.x)}
            y2={Y(s.y)}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={((i + 1) / trail.length) * 0.45}
          />
        ))
      })}

      {/* Tags en vivo */}
      {p.mode === 'live' &&
        Object.values(p.live).map((pos) => {
          const color = tagColor(pos.tag, p.tagIds)
          const selected = pos.tag === p.selectedTag
          const q = QUALITY_COLOR[qualityLevel(pos.quality)]
          return (
            <g
              key={pos.tag}
              onClick={() => p.onSelect(pos.tag)}
              style={{ cursor: 'pointer', transition: 'transform 0.9s linear' }}
              transform={`translate(${X(pos.x)} ${Y(pos.y)})`}
            >
              {selected && <circle className="tag-pulse" r={9} fill="none" stroke={color} strokeWidth={1.5} />}
              <circle r={selected ? 8 : 6.5} fill={color} stroke="#060a10" strokeWidth={2} />
              <circle r={selected ? 11.5 : 10} fill="none" stroke={q} strokeWidth={1.5} opacity={0.9} />
              <text x={14} y={4} fill={color} fontSize={11} fontWeight={600} fontFamily="var(--font-mono)">
                {pos.tag}
              </text>
              <title>{`${pos.tag} · (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) m · rms ${pos.quality.toFixed(2)} m · ${pos.n_anchors} anchors`}</title>
            </g>
          )
        })}

      {/* Marcador del replay */}
      {p.mode === 'replay' && p.replayMarker && (
        <g transform={`translate(${X(p.replayMarker.x)} ${Y(p.replayMarker.y)})`}>
          <circle className="tag-pulse" r={9} fill="none" stroke="#00d4ff" strokeWidth={1.5} />
          <circle r={8} fill="#00d4ff" stroke="#060a10" strokeWidth={2} />
        </g>
      )}
    </svg>
  )
}
