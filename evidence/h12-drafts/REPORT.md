# Estado actual · bienvenida opcional · 2026-10-26

Se añadieron bloques breves, panel de retorno, guardado/continuación/salida y kit
visual opcional con archivos privados. Omitir no obliga a guardar. Recibos actuales:
8 grupos proveedor y6navegador H1.2; regresión266 Node +23navegador general PASS.
Informe de coordinación: workspace padre evidence/h12-scope/OPTIONAL-WELCOME.md.
Contrato vigente ampliado en CONTRACT.md. Los 39 flujos siguen pendientes; sin
commit/push/merge/deploy. Lo que sigue conserva el informe histórico de la base
de guardado y sus cifras originales, no el inventario de pruebas del incremento.

# H1.2 · primer incremento aislado

## Actualización · selector aprobado integrado

Arturo aprobó el selector integrado sin barra y autorizó incorporarlo a H1.2.
JS/CSS, bloque HTML y regresión de apariencia se incorporaron desde el worktree
aprobado, preservando scripts H1.2, SQL, Auth, permisos y gates. Se adaptó
`h12-browser.cjs` al menú real y se amplió su cobertura de persistencia.

Nueva ejecución Node 24.19.0: **264 Node y 23 navegador**; proveedor real local
**6 grupos**, navegador conectado **7 grupos**. JSON y capturas de este directorio
corresponden al corte integrado. Selección/texto/etapa/scroll, guardado pendiente,
respuesta perdida con cambio de tema, recuperación en otra sesión y tacto emulado,
conflicto/logout/cuentas verificados. Cero solicitudes externas y errores de página.

Revisión independiente favorable del delta y recibos finales. Laboratorio cerrado,
despliegues main/H1.2 bloqueados, 39 flujos pendientes. H1.2 sin commit, push, merge
ni publicación. Informe/manifiesto en el padre `evidence/h12-scope/SELECTOR-INTEGRATED.md`.
Los apartados siguientes conservan el primer corte; sus cifras anteriores quedan
superadas por esta actualización.

Fecha: 2026-10-26 UTC / 2026-10-25 Ciudad de México. Estado: implementación local,
sin commit, push, PR nuevo, merge o despliegue. Arturo aprobó alcance H1.2 y
autorizó comenzar base técnica, permisos, guardado y recuperación en aislamiento.

## Fuente y cambios

Repositorio único: `donventas/dv-portal`, checkout de trabajo `portal-h12/`, rama
`codex/portal-h12-drafts`, base `542c70544ae908f3785d25397021df89a802f2b5`, verificada
mediante fetch de main antes de crear el worktree. Remoto:
`https://github.com/donventas/dv-portal.git`. El checkout original `portal/` sigue
en `codex/portal-h1-hardening`, `f63f51b`, sin modificaciones. Runtime y Landing
permanecen sin cambios por esta tarea.

- Contrato y UI: `app/draft-contract.js`, `app/drafts.js`, `app/draft-ui.js`.
  Reutilizan cuestionario y estilo H1.1 sin modificar tokens ni activos.
- Arranque y límites: `index.html`, `app/portal.js`, `app/release-config.js`,
  `app/store.js`, `app/supabase.js`, `app/write-guard.js`, `app/auth.js`.
- BD candidata: `supabase/proposals/h12-drafts.sql`. No se añadió a migrations.
- Laboratorio y pruebas: extensión acotada de `setup-identity-lab.cjs`, nuevos
  `h12-server.cjs`, `h12-provider.cjs`, `h12-browser.cjs`, `close-h12-lab.cjs` y
  `tests/h12-drafts.test.js`.
- Node: `.nvmrc`, engines en package/lock fijan rama 24, ensayada con 24.19.0.
  Las dependencias no cambiaron. El [calendario oficial](https://nodejs.org/en/about/previous-releases)
  identifica Node 24 como LTS y Node 20 como EOL. No se cambió Node global ni la
  configuración Vercel; el workflow existente consume `.nvmrc`.
- `vercel.json` y su regresión bloquean también la nueva rama, además de main
  y la rama H1 anterior. `scripts/verify.mjs` admite las rutas exactas nuevas.
- Documentación y recibos en este directorio; el backlog conserva 39 pendientes.

## Resultado funcional

El propietario autenticado puede guardar un borrador incompleto, recuperar
selecciones, texto exacto, notas de opciones desmarcadas y etapa en otra sesión.
Se controla versión, actor/cuenta y reintento; un conflicto conserva texto local.
Historial paginado estable durante nuevos guardados. No hay campos de autoridad
aportados por cliente, autoasignación de rol ni acceso directo a las tablas.

El arranque acotado evita hydrate general; solo carga actor/cuenta autorizados.
La navegación del piloto muestra borrador/contexto y declara las demás etapas
pendientes. La DEMO H1.1 de cinco etapas permanece disponible en su modo propio.
El [contrato](CONTRACT.md) detalla permisos, límites, reproducción y experiencia.

## Pruebas y evidencia

- Node 24.19.0: **264 pruebas** (233 unitarias y 31 de integración).
- Regresión de navegador del Portal: **19 pruebas** con Edge headless.
- Verificadores de rutas, bundle y secretos; `git diff --check`.
- [Proveedor real local](provider-results.json): seis grupos con GoTrue,
  PostgREST y PostgreSQL sobre esquema restaurado y saneado; dos cuentas,
  propietario/miembro, grants, payload inválido, nuevo login, concurrencia,
  historial >20 versiones con escritura intercalada, revocación/restauración,
  JWT inválido/expirado y logout.
- [Navegador integrado](browser-results.json): cinco grupos con el Portal real,
  mismo proveedor local, dos pestañas y nuevo contexto de navegador. Incluye
  respuesta perdida después del commit, conflicto sin sobrescritura, historial,
  logout multipestaña, sesión nueva/otra cuenta y fallos Auth diferenciados.
- Claro/oscuro, 390 y 1280 píxeles, selector Sistema, teclado y reduced-motion
  conservan texto. Capturas `form-{light,dark}-{390,1280}.png`, inspeccionadas.
  Sin solicitudes externas ni errores de página en el recibo final.

Los logs completos de verify:all están en el workspace padre,
`evidence/h12-scope/verify-all.txt`. No se ejecutó CI remoto porque esta rama no
se publicó. No se atribuye CI del PR6 a los cambios actuales.

Después de esa regresión se añadió reconocimiento explícito de
`AuthSessionMissingError`/`session_not_found` (Auth puede devolverlos con 400).
Las siete pruebas H1.2 se repitieron con ese caso y pasaron. No cambió SQL ni
el recorrido: el recibo integrado de navegador corresponde a la ejecución
inmediatamente anterior a esa ampliación de la clasificación del error.

## Correcciones y revisión independiente

La primera prueba multipestaña detectó que SIGNED_IN redundante borraba el
borrador. Ahora se distingue usuario+session_id; refoco no borra, cambio real sí.
La revisión independiente confirmó ese fallo y añadió limpieza ante rechazo
Auth autoritativo. Se corrigió el rechazo 401/403, usuario ausente/distinto y el
retorno a acceso, manteniendo texto ante fallo de transporte/503. Regresiones
unitarias y del navegador acreditan ambos comportamientos.

Un intento de prueba extendida quedó esperando el diálogo de reautenticación al
pedir logout después de haber invalidado Store. Se detuvo únicamente su árbol
de proceso identificado; la limpieza del harness usa SDK directamente en ese
caso y cierra sus conexiones. El recibo final procede de una ejecución completa,
no de las ejecuciones fallidas o interrumpidas. También se corrigieron esperas
del harness para historial asíncrono y etapa recuperada.

Revisor independiente autorizado, solo lectura: ambos hallazgos cerrados, sin
nuevos bloqueantes confirmados; aceptación técnica limitada al ensayo aislado
y su regresión final. No accedió a credenciales, no repitió SQL y no certifica
admisión alojada ni producción.

## Límites y continuidad

Los 39 IDs siguen pendientes para operación alojada. Esto avanza ENG-01, DB-01,
IAM-03/AUTH-02, PROD-01 y DATA-01 en su alcance aislado, sin cerrar sus criterios
remotos. La hidratación general queda pendiente: no fue utilizada por este piloto.
No se certifican SMTP/OAuth alojados, aprovisionamiento real, recuperación
externa de secretos, operación financiera ni aceptación humana de H1.2.

Los RPC comparten el bloqueo corto del contrato de identidad: prioriza
consistencia en el piloto; debe evaluarse carga antes de una admisión alojada.
Guardar no envía ni solicita consentimiento operativo. Los cambios que no se
guardan se pierden al cerrar sesión/recargar; se muestra aviso. No se promete
recuperación automática de un intento ambiguo después de cerrar el navegador.

No se modificó producción ni se consultaron credenciales productivas. Se usó la
copia privada ya disponible; la restauración no expone datos heredados a APIs:
primero se sanea en la red interna. Correo local sin relay; credenciales nuevas
solo en directorio temporal privado. El cierre del laboratorio retira solo sus
cuatro contenedores/red y archivos privados temporales, conserva el respaldo
original y no toca contenedores ajenos. El recibo de cierre queda en el padre.

Rollback de producto: no hay integración o despliegue que revertir. Se conserva
el checkout anterior y la base; no eliminar trabajo sin autorización. Siguiente
decisión: revisión humana de guardado/recuperación; después implementar envío
versionado y revisión según alcance H1.2. Commit/push/PR y merge no se ejecutaron
por esta orden. Publicación y admisión alojada permanecen separadas.
