# H1.2 — cinco puntos, corte aislado

2026-10-26. Implementación candidata local; no admisión alojada ni cierre de H1.2.

## Resultado

| Punto | Evidencia local | Límite |
|---|---|---|
| 1. Enviar para revisión | Instantánea de la última versión guardada, consentimiento, selección de archivos, folio y recibo idempotente. Notas desmarcadas excluidas. | No cambia el borrador; no obliga a completar la bienvenida. |
| 2. Bandeja DV | Acceso por concesión explícita de cuenta, responsable, estado y revisión esperada. | Equipo en harness Auth separado; integración de su shell completo pendiente. |
| 3. Mensajes y avisos | Conversaciones cliente/DV, interna y de encargo; avisos leídos por usuario; correo capturado en Mailpit. | Sin correo real. Incertidumbre de entrega retenida sin reenvío automático. |
| 4. Análisis AVOS/MCP | Adaptador stdio real, cola durable, lease, referencias de fuente, fallo/reintento y devolución con aprobación independiente. | Análisis SIMULADO; proveedor/modelo/identidad de servicio e instalación pendientes. |
| 5. Colaboradores | Suscriptor sin acceso, invitación, aceptación/rechazo, contexto mínimo, revocación, reemplazo y vencimiento. Referencia con autorización específica del cliente. | Solo fixtures sintéticos; no onboarding, términos, pagos ni operación externa. |

## Fuentes y cambios

Repositorio editable: `donventas/dv-portal`, checkout `portal-h12`, rama
`codex/portal-h12-drafts`, HEAD `542c70544ae908f3785d25397021df89a802f2b5`.
Se conservaron todos los cambios previos de H1.2. Sin switch/reset/stash/commit.
Runtime es referencia de solo lectura en `cbd68d81fe70da9d3d1e6125c67d25d77ad9b454`,
con su ampliación documental local ya aprobada en `runtime-h12-collaboration`.

- `supabase/proposals/h12-workflow.sql`: tablas privadas con RLS, acceso mediante
  RPC, permisos por cuenta, instantáneas, mensajes, asignaciones, auditoría y avisos.
- `supabase/proposals/h12-worker.sql`: alcance del trabajador, leases, validación
  de fuentes, recuperación y reserva durable de correo. Propuestas fuera de migrations.
- `server/review-mcp.cjs`, `review-simulator.cjs`, `review-mail-capture.cjs`:
  transporte stdio, simulador identificado y captura local sin relay.
- `app/workflow-ui.js`, `workflow.css`: superficie operativa que consume tokens
  existentes; integración en paso 5 mediante `draft-ui.js` e `index.html`.
  `drafts.js` limpia caché al cambiar identidad; `write-guard.js` admite la nueva
  escritura exclusivamente en SANDBOX LOCAL autenticado.
- `supabase/tests/h12-workflow-*.cjs`, `h12-worker-integration.cjs`,
  `tests/workflow-harness.*`, `tests/h12-review-mcp.test.js`: fixtures, contratos
  negativos, navegador real y ensayo de transporte. `package.json` incorpora
  pruebas sin red en CI y `scripts/verify.mjs` mantiene allowlist exacta.
- `tests/browser/don-scenes.spec.js`: expectativa del paso 5 actualizada; conserva
  la comprobación de escenas, toque, navegación libre y ausencia de overflow.
- `evidence/operational-backlog.md`: avance enlazado, sin cerrar IDs.

## Validación ejecutada

- `npm run verify:all`: rutas/bundle/secretos, 238 unitarias, 31 integración y
  38 pruebas de navegador aprobadas. Después se añadió la prueba de aislamiento
  de `workflow.command`: 74 pruebas enfocadas de guard/drafts/MCP aprobadas.
- [Proveedor real local](provider-results.json): Auth y PostgreSQL; separación
  de cuentas, archivo seleccionado, sesión nueva, concurrencia, replay, notas
  privadas, publicación, revocación, referencias y leases vencidos. Conservación
  exacta de todos los borradores preexistentes, no solo su número.
- [MCP y correo](worker-results.json): inicialización/descubrimiento/ejecución
  stdio; un fallo de transporte queda uncertain y no se duplica. Solo destinatarios
  sintéticos; se comprobó ausencia de relay/forward de Mailpit antes de capturar.
- [Navegador](browser-results.json): cliente, equipo y colaborador en Edge;
  claro/oscuro, 1280/390 px, texto como texto (no HTML), aprobación explícita,
  borrado de pantalla al cerrar sesión y conservación de mensaje al cambiar tema.
  Paso 5 nativo: respuesta perdida después de commit, reintento sin duplicado,
  guard central y borrador recuperado sin cambios.
- Revisión visual de capturas: se corrigieron el wordmark oscuro del harness y
  un botón `hidden` que CSS hacía visible. No se modificaron activos maestros.
- `git diff --check`; `vercel.json` mantiene `main` y `codex/portal-h12-drafts`
  deshabilitados; workflow CI sin cambios y sin despliegue. No se ejecutó CI remoto.

Las primeras iteraciones detectaron restricciones de fixture de analista y
ambigüedades SQL, corregidas y reensayadas. Los recibos JSON enlazados describen
las últimas ejecuciones. No constituyen una revisión independiente de seguridad.

## Límites, riesgos y siguiente decisión

No se consultó ni modificó producción. No hubo conexión a modelo, envíos reales,
credenciales nuevas, instalación de MCP, merge o despliegue. El servidor de revisión
55464 continúa activo; el harness 55474 se abre/cierra durante sus pruebas.
No se dejó un trabajador continuo ni una automatización en ejecución.

El laboratorio usa transporte administrativo local para preparar fixtures y
ejercitar funciones privadas. Su admisión alojada exige identidad de servicio
propia, revisión técnica independiente, límites/cuotas, paginación a escala,
observabilidad y runbooks. No se realizaron pruebas de carga, dispositivos físicos,
entregabilidad real ni evaluación de calidad de un modelo.

AVOS: composición de proyecto, fuentes gobernadas consultadas en su repositorio
de integridad, sin copiar expedientes allí. Router: NO_ACTIVE_EXPERIMENT. Esta
ejecución no se contabilizó como experimento ni certifica paquetes adicionales.

Siguiente decisión humana: revisión del corte funcional y configuración concreta
del piloto de análisis real según [ACTIVATION.md](ACTIVATION.md). Los 39 flujos
siguen pendientes para operación alojada.

Reversión: dejar de cargar la UI operativa y apagar exclusivamente el harness o
trabajador local si se hubiera iniciado. Conservar tablas, recibos y evidencia;
no borrar el laboratorio ni usar reset/stash sobre el WIP. Una reversión Git
posterior debe seleccionar solo los archivos de este corte.
