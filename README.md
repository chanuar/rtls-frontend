# RTLS UWB — Frontend

Interfaz web de visualización para el sistema de seguimiento de empleados. Conecta con el backend FastAPI (`rtls-backend`) por REST y WebSocket.

## Puesta en marcha

Requisitos: **Node 24.21.0 LTS** y **npm 11.19.0**.

```bash
npm ci
npm run dev          # http://localhost:5173
```

Por defecto apunta a `http://localhost:8000`. Para otro backend, copia `.env.example` a `.env` y ajusta `VITE_API_URL`.

**Modo demo:** solo se activa con `VITE_DEMO=true` en `.env` (reiniciar Vite después de cambiarlo). Muestra el badge ámbar DEMO y empleados simulados. Por defecto se conecta al backend y reintenta si no está disponible; un fallo de conexión nunca activa datos simulados.

## Funcionalidades

Tras 10 segundos sin medidas válidas o al desconectarse, el tag permanece en
su última posición conocida, gris y con anillo discontinuo, sin pulsación y con
la antigüedad visible. No se inventa movimiento ni se cuenta como posición
reciente; al recibir una medida válida vuelve a actualizarse. Los anchors se actualizan cada 5 segundos y al reconectar; un cambio de
coordenadas borra las posiciones y estelas del sistema anterior.

Los resultados históricos pertenecen al tag y periodo solicitados. Cambiar la
selección oculta esos resultados y descarta respuestas pendientes anteriores.
El replay deja huecos cuando hay más de 10 segundos sin medidas, en lugar de
inventar el recorrido. Distancia, replay y coincidencias excluyen saltos por
encima de 3 m/s más 0,4 m de tolerancia; es una heurística para personas andando.
Las coincidencias usan intervalos solapados con medidas próximas en la misma
zona, y no afirman comparar contra un patrón habitual del empleado.

Comprobaciones locales (sin backend ni nuevas dependencias):

```bash
npm test
npm run build
```

- **En vivo:** plano SVG con posiciones por WebSocket (reconexión automática), estelas de movimiento con desvanecimiento, anillo de calidad por tag (verde/ámbar/rojo según el residuo RMS de la trilateración), zona actual y últimas coordenadas del empleado seleccionado.
- **Reproducción:** carga la trayectoria de un empleado en un periodo, la reproduce con interpolación suave (×1, ×4, ×16, ×60), scrubber temporal, y calcula estadísticas: distancia recorrida, paradas (≥30 s quieto) y tiempo por zona.
- **Mapa de calor:** capa superpuesta generada desde el endpoint `/heatmap` (rejilla de 0,5 m), con escala cian → rojo.
- **Análisis:** resume las muestras y el tiempo observado de cada tag y aplica reglas locales para señalar permanencias largas, coincidencias entre empleados, pérdidas de señal (≥15 min) y poco movimiento registrado. Las reglas requieren más de 10 muestras por tag; permanencias, al menos 30 min observados, y poco movimiento, al menos 2 h. No utiliza IA ni un endpoint `/insights`, no compara con un historial habitual y no evalúa el rendimiento laboral.
- **Diagnóstico de señal:** selecciona un tag para consultar su última posición y frecuencia reciente. «Cargar jornada» muestra el RMS medio/máximo, anchors utilizados, frecuencia media y huecos mayores de 10 s entre muestras del periodo. La frecuencia incluye esos huecos; los datos ausentes se indican como «Sin datos». El RMS describe el ajuste, no la precisión física, y el número de anchors no indica la salud individual de las placas.
- **Ficha del tag:** reúne identidad, estado del catálogo, última posición, actividad y cobertura observada del periodo. Comparte el tag, periodo e histórico cargado con Plano y Diagnóstico; permite abrir el recorrido existente o volver al plano en vivo. Es una vista de consulta: no edita el catálogo. La cobertura es el tiempo de intervalos válidos dividido por el periodo solicitado, sin contar huecos ni saltos descartados.
- **Selector de periodo:** controles nativos de fecha y hora local, desde/hasta, con presets (Hoy, Ayer, 7 días). Las consultas se envían en UTC; los periodos incompletos o invertidos no se pueden cargar.
- **Plano de la farmacia:** planta aproximada de 28 × 5,86 m con las zonas configuradas: atención al público, rebotica, oficina y almacén, más el perímetro y la entrada. Zonas definidas en metros en `src/config.ts` — afinar límites al medir con cinta métrica. Eje X = profundidad desde la fachada; eje Y = anchura.

## Estructura principal

```
src/
├── App.tsx                 Composición, navegación y conexión
├── config.ts               URLs, zonas de la farmacia, colores, umbrales de calidad
├── types.ts                Tipos compartidos (espejo de la API)
├── store.ts                Zustand: estado en vivo, WebSocket con reconexión, demo explícita
├── lib/
│   ├── api.ts              Cliente REST
│   ├── trajectory.ts       Análisis: distancia, paradas, tiempo por zona, interpolación
│   ├── insights.ts         Reglas locales de análisis
│   └── demo.ts             Simulador cliente para el modo demo
└── components/
    ├── Workspace.tsx       Seguimiento, filtros y carga del histórico/mapa de calor
    ├── TrackingView.tsx    Estado en vivo, selección y vistas del plano
    ├── FloorPlan.tsx       Plano SVG: rejilla, zonas, anchors, tags, estelas, heatmap, replay
    ├── Replay.tsx          Hook de reproducción + barra de transporte
    ├── Stats.tsx           Detalle en vivo y estadísticas del histórico
    └── Insights.tsx        Consulta y presentación del análisis
```

## Decisiones técnicas

- **SVG:** representa las coordenadas locales en metros y permite seleccionar tags con ratón o teclado. El rendimiento depende de la cantidad y frecuencia de las muestras y debe medirse con el histórico y dispositivo utilizados.
- **Escala:** «Ajustar plano» muestra el conjunto; «Ver detalle» usa 64 px/m y permite desplazarse con barras o flechas del teclado. Las etiquetas y la selección mantienen un tamaño legible. La farmacia usa la geometría de `src/config.ts`; el área de prueba calcula sus límites desde `/anchors`.
- **Heatmap como rectángulos SVG:** las celdas de 0,5 m llegan agregadas del backend y usan las mismas coordenadas que el plano. Cuentan muestras, no tiempo de ocupación; la intensidad se normaliza al máximo de cada respuesta.
- **Sin librería de mapas ni de gráficas:** cero dependencias pesadas; solo React, Zustand y Tailwind 4.

## Pendiente / ideas

- Autenticación y roles (imprescindible antes de producción — RGPD).
- Plano real de la farmacia como SVG de fondo (exportado de un CAD o dibujado sobre foto).
- Comparativa entre empleados y agregados diarios/semanales (Recharts).
- Alertas configurables (p. ej. zona restringida, tag sin señal).
