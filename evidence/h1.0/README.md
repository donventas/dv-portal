# H1.0 · recibo de implementación local · 2026-10-25

**Estado: frontend endurecido y candidato SQL preparado; H1.0 operativo NO cerrado.**
No construir H1.1 ni habilitar clientes reales con esta evidencia.

## Autoridad y baseline verificados

- Único repo editable: `portal`, `https://github.com/donventas/dv-portal.git`.
- Raíz: `C:/Users/artur/OneDrive/Documentos/GitHub/Don-Ventas-Workspace/portal`.
- Entrada: `main`, HEAD `3b0cd48b3dc6657881a40289f6fca8c477612b45`, árbol limpio.
- Rama creada: `codex/portal-h1-hardening`. La validación local se capturó antes del commit.
- Portal no tiene AGENTS.md/CLAUDE.md propios; rigen los del padre y el mandato H1.0.
- Runtime inicialmente inspeccionado solo lectura y limpio, HEAD `f01d471bc4aab1c6fdc9010d76d4ec188504919d`.
  `git diff 83cbc318ad1891789b07a9808c8be275ac26211e HEAD -- 14_PORTAL` sin diferencias.
  Fuentes: H1.0-paquete-tecnico, Auditoria-H0, Primer-alcance-H1, Environment Policy
  y Especificaciones-hibridas. Diagnóstico H0 leído, sin ejecutar ni modificar Runtime.
- AVOS adapter: fuente descubierta `~/.codex/avos-runtime/source/AVOS-main-integrity`;
  instrucciones/constitución/registry y mapa consultados. NO_ACTIVE_EXPERIMENT;
  sin claim, activación, instalación ni transferencia de evidencia a AVOS.
- Última observación Runtime: mismo HEAD/rama `codex/portal-h0-integration`, pero
  ahora hay cambios staged/untracked en documentos H0/H1, README, ESTADO y bitácora.
  Aparecieron durante esta tarea y no fueron producidos ni intervenidos por ella.
  Se conserva esa diferencia; no hacer reset/stash ni inferir que Runtime cerró limpio.
- Identidad visual preservada; no activos de marca ni CSS modificados.

## Resultado por hallazgo

| ID | Implementado | Nivel comprobado / pendiente |
|---|---|---|
| H0-01 | Bootstrap backend vacío, seed condicional DEMO y autoguarda; transición limpia datos. Taxonomía estática de capas separada de cuentas/fixtures. | PASS local en cuatro modos; LIVE es simulación, nunca backend real. |
| H0-02 | Cambio de rol demo-only; perfil backend sin autoedición local; propuesta SQL limita UPDATE a name, protege autoridad y restringe actores revocados. | Frontend PASS. Grants/herencia/RLS efectivos, SQL y negativos directos NOT_TESTED. No afirmar privilegios corregidos en BD. |
| H0-03 | Comandos con recurso, versión/revisión esperadas; respuesta nula/denegada/obsoleta no confirma UI; feedback como evento ligado a revisión. | Adapter+Store+acción UI PASS con dobles. Contrato backend preparado, sin habilitar. |
| H0-04 | Retiradas secuencias parciales del adaptador; RPC candidata con locks, recibo idempotente y auditoría en transacción; retry conserva clave en sesión. Activación canónica, sin fabricar IDs backend. | Pruebas frontend PASS. Atomicidad, concurrencia y persistencia Postgres NOT_TESTED. Pagos deshabilitados. |
| H0-05 | 49 mutaciones inventariadas; demo-only falla cerrado y controles deshabilitados; cachés backend efímeras; DEMO por usuario/tenant; logout/auth event limpia datos/borradores y tareas; identidad incluye generación. | Pruebas locales PASS. Cierre entre pestañas se ensaya con callback SDK sintético; revocación y dos sesiones reales pendientes. |
| H0-06 | Sin expansión del modelo híbrido ni H1.1. | Fuera de alcance; sigue abierto. |
| H0-07 | Runbook reescrito, clasificación de pruebas, SQL ejecutable preparado, CDN con versión exacta y rutas de QA acotadas. | Checks locales PASS. Compatibilidad/disponibilidad SDK real, paginación, escala, restore y revisión independiente pendientes. |

Los hallazgos H0 son condiciones reproducidas localmente y riesgos, no incidentes
confirmados en producción. La mitigación local no demuestra el estado desplegado.

## Pruebas y evidencia

- Node `v20.15.1`: **232 PASS, 0 fail, 0 skip**: los 209 tests del baseline (incluida
  actualización de una expectativa arquitectónica obsoleta) + 23 regresiones H1.0.
  Ejecución exacta y resultado: [tests.txt](tests.txt). Se usa código real del adapter,
  guard, Store y acciones Client, con SDK simulado y sin red/credenciales reales.
- Casos nuevos: cero filas, denegación, conflicto, revisión enviada, respuesta canónica,
  contrato no verificado, acciones demo-only, retiro de writes parciales, retry, timeout,
  cambio de identidad en vuelo, revocación/pendiente, signout de otra pestaña simulado,
  limpieza por ambiente, caché por tenant, UI sin éxito falso y feedback sin ronda ficticia.
- [browser.ndjson](browser.ndjson): Edge headless instalado + Playwright del runtime
  existente. BLOCKED/SANDBOX/LIVE simulado: seed no solicitado, cero cuentas.
  DEMO: seed solicitado, 8 cuentas sintéticas. Sin pageerror y sin overflow a
  320/390/768/1280 px; entrada DEMO autenticada y controles backend comprobados.
  Denegación de enlace deja formulario sin confirmar. Todas las requests externas
  abortadas, incluida Google Fonts; solo loopback permitido. LIVE modifica el controlador
  exclusivamente en el test, no habilita localhost→producción en código de producto.
- Edge falló inicialmente creando perfil temporal dentro del sandbox; repetición
  aprobada fuera del sandbox con perfil efímero completó. Sin perfil/sesión de usuario.
- Sintaxis JS/CJS, verify paths/bundle/secrets y diff --check: ver [validation.txt](validation.txt).
  Scanner de secretos limitado al diff desde la base fija del verificador; no auditoría integral.
- El primer ciclo local tuvo fallos en expectativas estáticas y en el tratamiento STALE;
  se corrigió el código, sin eliminar casos negativos. [tests-first.txt](tests-first.txt)
  conserva la corrida intermedia; no es el resultado final.
- Runner SQL sin autorización explícita: rechazo antes de conectar, verificado localmente.
  No se hallaron `psql`/Docker en PATH ni una BD desechable autorizada. No se ejecutó SQL.

No ejecutado: suite original `npm run test:browser` con la dependencia fijada del
producto (sin instalación local), proveedor Auth real, RLS/grants, comando Postgres,
dos sesiones reales, pagos, email, uploads, restauración, QA independiente W3,
rendimiento de campo ni accesibilidad completa. El smoke complementario usa el
runtime ya instalado y no sustituye esas pruebas. No se declara AC-01–32 aprobado.

## Manifiesto, riesgos y decisiones

[manifest.json](manifest.json) fija archivos y hashes del diff local; excluye su
propio hash y la coordinación del padre. [mutation-inventory.md](mutation-inventory.md)
explica la superficie soportada. Propuestas SQL fuera de `migrations/`, sin autoapply.
Las migraciones históricas, configuración de servicios, activos, Landing y Runtime
no se modificaron. RETOMAR.md del padre recibe únicamente coordinación.

Riesgos y límites materiales:

1. `h10Commands` permanece deshabilitado por el mapper actual. No cambiar el flag
   para simular un gate aprobado. Una futura admisión requiere contrato verificado,
   configuración versionada y autorización servidor independiente del frontend.
2. Se reduce intencionalmente la superficie backend: invitaciones, pagos, edición
   de leads, perfiles freemium y funciones operativas locales ya no aparentan persistir.
   Revisar esta reducción antes de cualquier release; no confundirlo con un backend completo.
3. SQL candidato no compilado ni ejecutado: revisar esquema/grants efectivos,
   propietarios/SECURITY DEFINER, políticas restrictivas, compatibilidad y rollback.
   Runner de concurrencia deja fixtures en una base desechable fresca para inspección.
4. Retry conserva clave en una sesión; el servidor propuesto deduplica entre sesiones
   si reciben la misma clave. Persistir una intención tras recarga requeriría un contrato
   adicional. Versiones/estado protegen contra efectos repetidos con claves distintas;
   esa propiedad de BD sigue sin verificar.
5. SDK candidato CDN `2.49.8` no se descargó ni validó; no es una recomendación de
   seguridad ni una dependencia aprobada. Hydrate global sigue sin paginación.
6. Ningún efecto externo nuevo. La auditoría candidata está en la transacción;
   añadir correos/pagos/publicaciones exigirá outbox, idempotencia de proveedor y gate propio.

Rollback local: revisar el diff y revertir selectivamente estos archivos mediante
edición inversa, preservando trabajo posterior; no usar reset/stash/clean. Si se
autoriza commit, revertir selectivamente ese commit. SQL sin aplicar no necesita
rollback de BD; una futura migración necesita recuperación probada por separado.

## Entrega de desarrollo y propuesta de cierre

Arturo autorizó commit, push y PR de desarrollo el 2026-10-25. Esta autorización
no incluye merge, despliegue, instalación ni ejecución de migraciones. El PR se
abre en borrador; su estado Git posterior queda en GitHub y en RETOMAR.md del padre.
El manifiesto representa el snapshot previo al commit y excluye su propio hash.

Propuesta para cerrar BD y seguridad, en este orden:

1. Revisar independientemente el contrato SQL y las dependencias. Contrastar con
   el esquema, políticas y grants efectivos; comprobar propietarios, search_path,
   SECURITY DEFINER, permisos heredados, autoedición de autoridad y revocación.
   Validar una versión soportada del SDK; la versión candidata no está aprobada.
2. Identificar y autorizar una instancia local desechable de Postgres/Supabase,
   base `portal_h10_disposable`, con versiones registradas y datos sintéticos.
   Confirmar herramientas disponibles antes de solicitar instalaciones. Preparar
   esquema base y aplicar el candidato solo en esa instancia autorizada.
3. Ejecutar negativos de rol/tenant, acceso directo, actor revocado con sesión
   vigente, versiones obsoletas, replay con payload distinto y rollback de fallos.
   Probar dos sesiones concurrentes y activación repetida; verificar una sola
   mutación canónica y coherencia de recibos y auditoría. Conservar resultados reales.
4. Ensayar respaldo/restauración y recuperación de la migración en la instancia
   desechable. Completar Auth real de prueba, cierre entre pestañas y smoke del
   producto con dependencias fijadas. Revisar paginación/carga antes de admitir usuarios.
5. Cerrar hallazgos críticos/altos y obtener revisión independiente con evidencia.
   Admitir el contrato mediante configuración versionada únicamente al aprobar
   estos controles. Cualquier despliegue requiere una decisión posterior expresa.

**Siguiente decisión:** aprobar el entorno desechable identificado y el alcance
de su preparación/ejecución. H1.0 operativo y H1.1 continúan pendientes.
