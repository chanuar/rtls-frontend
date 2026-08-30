# RTLS UWB — Frontend

Interfaz web de visualización para el sistema de seguimiento de empleados. Conecta con el backend FastAPI (`rtls-backend`) por REST y WebSocket.

## Puesta en marcha

```bash
npm install
npm run dev          # http://localhost:5173
```

Por defecto apunta a `http://localhost:8000`. Para otro backend, copia `.env.example` a `.env` y ajusta `VITE_API_URL`.

**Modo demo:** si la API no responde al arrancar, la interfaz pasa automáticamente a modo DEMO (badge ámbar en la cabecera) y genera empleados simulados en el propio navegador — útil para enseñar el producto sin infraestructura. Con el backend y `tools/simulator.py` corriendo verás el badge verde EN VIVO con datos reales del pipeline completo.

## Funcionalidades

- **En vivo:** plano SVG con posiciones por WebSocket (reconexión automática), estelas de movimiento con desvanecimiento, anillo de calidad por tag (verde/ámbar/rojo según el residuo RMS de la trilateración), zona actual y últimas coordenadas del empleado seleccionado.
- **Reproducción:** carga la trayectoria de un empleado en un periodo, la reproduce con interpolación suave (×1, ×4, ×16, ×60), scrubber temporal, y calcula estadísticas: distancia recorrida, paradas (≥30 s quieto) y tiempo por zona.
- **Mapa de calor:** capa superpuesta generada desde el endpoint `/heatmap` (rejilla de 0,5 m), con escala cian → rojo.
- **Recomendaciones IA:** segunda página que analiza los movimientos de todos los empleados en un periodo y detecta patrones: permanencias largas en una zona, coincidencias prolongadas entre empleados, pérdidas de señal (≥15 min) y actividad anómalamente baja. Primera versión con reglas heurísticas (`src/lib/insights.ts`); la UI está desacoplada del origen, pensada para conectar en el futuro un endpoint `/insights` con LLM en el backend y baselines por empleado.
- **Selector de periodo:** calendario a medida (semana empezando en lunes, es-ES) con selección de rango de días, horas desde/hasta y presets (Hoy, Ayer, 7 días).
- **Plano real:** geometría del local de ~152,75 m² (planta alargada de ~28 × 5,6 m) con sus estancias reales: atención al público, rebotica, oficina, distribuidor, office, almacén, aseo y patio, más el muro perimetral y la entrada. Zonas definidas en metros en `src/config.ts` — afinar límites al medir con cinta métrica. Eje X = profundidad desde la fachada; eje Y = anchura.

## Estructura

```
src/
├── config.ts               URLs, zonas de la farmacia, colores, umbrales de calidad
├── types.ts                Tipos compartidos (espejo de la API)
├── store.ts                Zustand: estado en vivo, WebSocket con reconexión, fallback demo
├── lib/
│   ├── api.ts              Cliente REST
│   ├── trajectory.ts       Análisis: distancia, paradas, tiempo por zona, interpolación
│   └── demo.ts             Simulador cliente para el modo demo
└── components/
    ├── FloorPlan.tsx       Plano SVG: rejilla, zonas, anchors, tags, estelas, heatmap, replay
    ├── Replay.tsx          Hook de reproducción + barra de transporte
    └── Stats.tsx           Panel en vivo y estadísticas de jornada
```

## Decisiones técnicas

- **SVG, no Leaflet ni canvas:** coordenadas locales en metros directamente de la trilateración; con ≤50 tags el SVG rinde de sobra y simplifica hover, tooltips y accesibilidad.
- **Escala:** 64 px/m; los límites del plano se calculan automáticamente desde los anchors que devuelve `/anchors`, así que al cambiar la planta solo hay que actualizar la BD y las zonas.
- **Heatmap como rects SVG:** los bins de 0,5 m llegan ya agregados del backend; para plantas pequeñas son <500 rectángulos, más simple que un canvas y con el mismo sistema de coordenadas.
- **Sin librería de mapas ni de gráficas:** cero dependencias pesadas; solo React, Zustand y Tailwind 4.

## Pendiente / ideas

- Autenticación y roles (imprescindible antes de producción — RGPD).
- Plano real de la farmacia como SVG de fondo (exportado de un CAD o dibujado sobre foto).
- Comparativa entre empleados y agregados diarios/semanales (Recharts).
- Alertas configurables (p. ej. zona restringida, tag sin señal).
