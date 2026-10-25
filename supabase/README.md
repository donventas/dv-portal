# Portal · backend y H1.0 (candidato local, no activado)

La presencia de URL y clave pública **no habilita LIVE**. Gobierna Runtime
`14_PORTAL/Portal Environment Policy and Safety Contract.md`, fijado al merge
`83cbc318ad1891789b07a9808c8be275ac26211e`. La resolución combina origen,
configuración versionada, vigencia e identidad allowlisted del backend.
Configuración ausente/parcial/obsoleta queda BLOCKED. No hay fallback a DEMO.

## Estado de este corte

Producto base `3b0cd48b3dc6657881a40289f6fca8c477612b45`; rama local
`codex/portal-h1-hardening`. Ninguna migración aplicada ni servicio configurado.
H1.0 frontend probado localmente; RLS/transacciones reales **NOT_TESTED**.
H1.1 y publicación no forman parte de este cambio.

`migrations/01`–`06` son historia versionada, no una receta para ejecutar en bloque.
`03_seed.sql` y `data/seed.js` nunca se ejecutan contra producción. El loader solo
solicita fixtures en DEMO; SANDBOX/LIVE arrancan vacíos y solo hidratan datos
permitidos por backend. BLOCKED no carga la aplicación. DEMO no debe abrir pagos.
Los nombres y correos visibles del fixture se identifican como sintéticos.

## Contrato preparado

`proposals/h10-command-contract.sql` es una propuesta revisable, fuera del directorio
de migraciones. NO se aplica por CI ni por los tests de Node. Incluye:

- perfil propio: solo `name`; no autoedición de `role`, `account_id`, `member_role`,
  `pending`, email o id, incluso para admin autenticado;
- política restrictiva para actores pendientes/revocados, independiente de JWT;
- versión en cuenta/bloque y comando `portal_command_v1`;
- owner del tenant aprueba/comenta revisión exacta; miembro no acepta; analista
  asignado o admin registra ronda; solo admin activa cuentas en waitlist;
- feedback como evento inmutable por contrato (sin grants de mutación del cliente),
  no una actualización amplia ni una ronda ficticia;
- bloqueo por recurso y clave, recibo persistente ligado al actor y payload,
  replay con la misma clave, conflicto con otro payload o versión;
- auditoría en la misma transacción y revocación de activación heredada/direct writes;
- ningún efecto externo, pago, correo ni dispatcher. Añadirlos requiere outbox y gate propio.

El frontend falla cerrado salvo `features.h10Commands === 'verified-v1'`. El mapper
de release actual NO emite ese valor: no editarlo para saltar este gate. Una futura
admisión debe versionar el contrato y demostrar la BD primero. El flag frontend
no acredita permisos; la función SQL revalida actor, pertenencia, estado y revisión.
Los demás adaptadores heredados rechazan la operación; no hay fallback multifila.

## Pruebas disponibles

- `npm test`: lógica/contratos y adapter+Store+acciones UI con SDK sintético;
  **no** certifica RLS, Postgres ni servicios desplegados.
- `tests/h10-browser.cjs`: navegador instalado, servidor efímero loopback y toda
  red externa abortada. Configurar `H10_PLAYWRIGHT_PATH` y `H10_BROWSER_PATH` con
  instalaciones existentes. LIVE solo simulado, sin endpoint productivo.
- `tests/h10-negative.sql` (en esta carpeta): SQL directo con fixtures de dos tenants,
  roles y revocación; rollback, replay, conflictos y activación. **Sin ejecutar**.
- `tests/run-h10-local.cjs --authorized-local-disposable`: futura ejecución mediante
  `psql` existente; solo loopback y base `portal_h10_disposable`, sin parámetros de
  conexión adicionales. Requiere `H10_DISPOSABLE_DATABASE_URL` en entorno seguro;
  nunca guardar esa variable en Git. No crea bases ni aplica propuestas.
- Añadir `--concurrency` ensaya dos conexiones reales sobre la misma intención.
  Requiere una base desechable fresca; conserva fixtures sintéticos para inspección.
  No ejecutarlo repetidamente sobre una base con los mismos IDs.

Antes de ensayar SQL: autorización expresa del entorno desechable, identidad y
propietario verificados, inventario de schema/grants/herencia/policies/funciones
realmente existentes, revisión independiente del candidato y restore probado.
No usar credenciales, usuarios, copias ni sesiones productivas. No levantar servicios
facturables ni instalar dependencias por implicación. El runner exige un nombre
local; esa comprobación por sí sola no demuestra la autorización del operador.

## Límites y siguiente gate

Auth backend conserva su canal existente, pero el cliente no simula cuentas
freemium persistentes ni muestra éxito para acciones demo-only. Cachés backend
son efímeras; logout/cambio de identidad invalida datos, borradores y operaciones.
Los comandos exigen fila canónica versionada antes de confirmar UI. Timeout no
prueba que el servidor no haya confirmado: retry conserva la misma clave.
SDK CDN fijado a `2.49.8`, sin instalación ni descarga en esta tarea; compatibilidad
y disponibilidad del artefacto con backend real pendientes. Hydrate global sin
paginación sigue como deuda antes de escalar.

Siguiente gate: revisar diff y autorizar por separado commit/push/PR de desarrollo;
después autorizar una BD desechable y revisión de seguridad. No merge a main,
deploy, migración real ni H1.1 por superar estas pruebas. Evidencia detallada en
`../evidence/h1.0/README.md` y su inventario de mutaciones.
