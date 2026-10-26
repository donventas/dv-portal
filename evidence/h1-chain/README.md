# H1 · cierre técnico local y DEMO para aceptación

Actualización posterior: [respaldo real y restauración aislada](../hosted-restore-20261025/REPORT.md)
completados; candidato adaptado al esquema alojado y recuperación 66/66 tablas
verificada. Este documento conserva el corte sintético anterior. LIVE sigue NO_GO.

Fecha: 2026-10-25. Único repositorio editable: donventas/dv-portal, rama
codex/portal-h1-hardening, mismo PR de desarrollo #6. Punto de partida de esta
continuación: 279555432e28a62fe9fc917c87b17ce463a03143. Baseline de producto:
3b0cd48b3dc6657881a40289f6fca8c477612b45. Este recibo actualiza el alcance de
evidence/h1.0 sin reescribir aquel corte histórico.

## Estado de los cuatro puntos

1. **BD y seguridad: verificación local completada.** Contrato SQL candidato,
   grants/RLS, revocación y alcance, funciones con search_path explícito, hook sin
   adopción de autoridad por correo, entradas nulas y XSS corregidos. Postgres real,
   concurrencia de dos sesiones, Auth/JWT/PostgREST/SDK reales en entorno sintético
   y restauración probados. No equivalen a verificar la BD alojada.
2. **Diseño funcional preparado.** Cinco etapas, selección múltiple con contexto
   propio, profundización opcional con origen/base declarada y trabajo sin IA inicial.
   Referencias Augment adaptadas como conceptos; transcripciones no distribuidas.
3. **DEMO H1.1 implementada y comprobada.** Versionado, consentimiento, alcance,
   entregas, errores y borradores. Marca vigente aplicada al formulario y shell.
   Responsividad revisada a 320, 390, 640, 768, 805, 890, 980, 981, 1024 y 1280 px.
   Aceptación anterior del recorrido condicionada a cambios: aceptación final de
   Arturo pendiente, no inferida de pruebas automáticas.
4. **Paquete de preparación de despliegue disponible.** Runbook, límites,
   recuperación y gates. Decisión actual: NO_GO para LIVE. Sin merge, migración
   alojada, cambio de permisos remoto ni despliegue manual.

## Evidencia verificable

- tests.txt: 215 pruebas unitarias y 31 de integración (246) satisfactorias.
- browser.txt: suite final de navegador; recorrido, marca, responsive, XSS,
  consentimiento, fallo y preservación de texto. Capturas PNG de este directorio.
- sql-negative.txt y sql-security.txt: SQL sobre Postgres 17.11 real y datos sintéticos.
- sql-concurrency.json: recibo de dos sesiones y semántica de replay.
- provider-results.json: diez comprobaciones reales GoTrue/JWT/PostgREST/SDK locales.
- restore-results.json: restauración posterior y recuperación del baseline anterior
  al candidato en bases desechables separadas, huellas coincidentes.
- modes.ndjson: BLOCKED, DEMO, SANDBOX y LIVE simulado; fixtures solo en DEMO.
- npm-audit.json: cero vulnerabilidades reportadas en dependencias inspeccionadas.
- security-review.md: revisión independiente, alcance y límites.
- asset-receipt.json: igualdad de bytes de activos/fonts respecto a fuentes fijadas.
- manifest.json: hashes del candidato, cambios y evidencia de este corte.

## Declaraciones, hipótesis y pendientes

Mandato humano: cadena de cuatro puntos, commit/push/PR de desarrollo; marca Don
Ventas vigente; revisor de seguridad independiente. Diseño del cuestionario y
distribución de tarjetas son hipótesis de producto pendientes de aceptación.
Las respuestas del cliente se etiquetan como declaraciones, nunca como hechos
validados. La DEMO simula actores; no autoriza acceso de especialistas reales.

La nueva variante clara fue canalizada por instrucción de Arturo a «DV · Marca y
metodología» (01a0e046-c047-7862-9298-57ddb7ee38a2). Debe resolverse en Runtime y
volver como paquete de consumo; no se improvisan tokens claros en Portal. Después
se canaliza a «DV · Sitio web y conversión» (01a0e3a5-89f9-7ed2-a646-85577507f784),
incluyendo páginas, blogs y políticas, y a este chat. Esa dependencia no bloquea
la comprobación de H1 oscuro.

Fuentes de solo lectura: Runtime f01d471bc4aab1c6fdc9010d76d4ec188504919d;
alcance 14_PORTAL aprobado 83cbc318ad1891789b07a9808c8be275ac26211e;
Landing c487c25184ec05feed526e36572d274acb9d4eb0. No se editan esas fuentes.

La revisión usa BSB snapshot 60ed1ec1914bb3b5c636f1142d853a1a70aa91fc, integridad
verificada; actualidad frente al AVOS live no verificada. No se devuelve evidencia
de proyecto a AVOS ni se declara nuevo canon.

## Revisión y recuperación

DEMO: `npm run demo:local`, http://127.0.0.1:8011. Solo loopback y datos sintéticos.
El servidor no expone SQL, evidencia, node_modules ni secretos. Borradores sin
confirmar se pierden al recargar; contextos confirmados viven en almacenamiento
local hasta cerrar sesión. Mantener datos de clientes reales fuera de esta DEMO.

Rollback de código: revertir el commit del incremento mediante cambio revisado,
sin reset/clean ni descarte de trabajo ajeno. SQL sigue en proposals, fuera de
migrations; no hay rollback remoto que ejecutar. Procedimiento futuro y
condiciones de recuperación en release-runbook.md.

Aceptación visual/funcional H1.1 registrada en
[acta](../h11-appearance/ACCEPTANCE.md). Próximas decisiones humanas: integración
del PR y alcance de H1.2; cualquier habilitación alojada requiere gates y
autorización separados.
