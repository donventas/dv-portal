# Aprovisionamiento seguro y Auth — ensayo aislado, 2026-10-25

## Resultado y autoridad

Candidato probado sobre el esquema restaurado real, con datos sintéticos y
servicios Auth/PostgREST reales. **NO_GO para LIVE**. Cero conexiones a producción
en este corte, sin cambios de credenciales alojadas ni correos externos.

Repositorio editable: `donventas/dv-portal`, rama `codex/portal-h1-hardening`,
base inspeccionada `886087f58c35576f6c0389d1f337f28eb5c8dbaf`, PR de desarrollo
[#6](https://github.com/donventas/dv-portal/pull/6). Checkout limpio al inicio.
Mandato de Arturo: aprovisionamiento seguro e integración de Auth en entorno
aislado, manteniendo producción intacta; commit/push/PR de desarrollo y revisor
independiente previamente autorizados. Runtime y Landing no fueron editados.

## Implementación

- Candidato `supabase/proposals/h10-identity-contract.sql`, posterior a H1.0:
  identidad confirmada, sesión Auth existente, no bloqueada/eliminada/anónima,
  versión de acceso y fecha de corte. Aplicado como `postgres NOSUPERUSER`.
- Un admin existente con JWT **y sesión real aal2** puede provisionar un UUID
  confirmado como owner, miembro o analista. No adopta autoridad por correo o
  metadata, no crea admins ni permite autoedición o transferencias de tenant.
- Una operación versionada e idempotente modifica autoridad y auditoría en la
  misma transacción. Revalida al administrador antes de responder a un replay.
  Los conflictos de estado usan HTTP409 (`PT409`); no usan `40001`, reservado
  a serialización y que causó reintentos de PostgREST durante el primer ensayo.
- Revoke suspende acceso inmediatamente. Restore conserva rol/cuenta anteriores,
  requiere la revocación auditada correspondiente y revalida cupos. Máximo cinco
  accesos activos, incluido el owner, y un owner activo por cuenta.
- Grant y restore exigen un nuevo inicio de sesión. Comprobar `auth.sessions.created_at`
  impide que un JWT o refresh anterior recupere acceso. El RPC de negocio H1.0
  también exige ese estado activo antes de mutar o devolver recibos.
- Adaptador del Portal: PKCE, no alta implícita al solicitar enlace, callbacks sin
  query/fragmento y texto que pide abrir el enlace en el mismo navegador.

## Aislamiento y datos

Se reutilizó el respaldo ya autorizado, SHA-256
`4861b9665818e19bcdce122b9bbe567c0dddc2c09720075b49a8b4789f0dfabc`.
El original permanece privado fuera de Git/OneDrive; no se volvió a consultar
producción. Antes de iniciar Auth, REST o SMTP se truncaron todas las tablas
ordinarias y raíces particionadas no sistema, excepto cuatro ledgers de migración
del proveedor. Se verificó cada tabla vacía, incluidos usuarios, sesiones, Vault,
cron y datos de negocio. Inventario: 68 relaciones ordinarias, una particionada,
cero materializadas/foráneas; el preparador rechaza estas dos últimas si aparecen.

Red Podman interna, cron sin ejecutar trabajos, worker pg_net desactivado, DB
sin puerto publicado. APIs accesibles solo en loopback. Las claves y contraseñas
del ensayo son nuevas y temporales; Mailpit no tiene relay externo. Nunca se
incluyen tokens, enlaces, contraseñas, datos originales o dumps en los recibos.
El único bootstrap SQL de admin crea una identidad **sintética**, como fixture.

Versiones verificadas: PostgreSQL17.6, GoTrue2.197.0, PostgREST14.18,
Mailpit1.32.0 y SDK2.118.0. El SDK del ensayo coincide con el SHA-384/SRI del Portal.
Digests observados de las imágenes:

| Servicio | SHA-256 |
|---|---|
| PostgreSQL | `5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b` |
| GoTrue | `1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b` |
| PostgREST | `c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf` |
| Mailpit | `0790692be935ea4420d085694f7985b1f692ca6a8771ab0e0bd8ba75ac180498` |

## Pruebas y revisión

- [provider-results.json](provider-results.json): once grupos satisfactorios de
  invitación real/correo de un uso/MFA TOTP, aislamiento, metadata maliciosa,
  permisos, concurrencia de owners, cupos al restaurar, atomicidad, links/JWT
  expirados, JWT alterados, ban, logout y sesión administrativa degradada/borrada.
  El JWT expirado se prueba fuera de la tolerancia de reloj de PostgREST.
- [browser-results.json](browser-results.json): cinco grupos con adaptador, guard,
  Store y SDK reales. GET del magiclink produce un callback **válido**: no inicia
  sesión en otro contexto sin verifier, sí en el contexto original. Hidrata solo
  su tenant, limpia el callback, renueva sesión y cierra/borra datos en dos páginas.
  Correo desconocido falla sin enviar enlace. Cero peticiones externas.
- Harness de navegador: admisión de entorno y confirmación SANDBOX son fixtures
  explícitos; no equivale a recorrido completo de UI ni a configuración alojada.
- `npm test`: 219 unitarias +31 integración; `test:browser`:10 satisfactorias.
  Verificadores paths/bundle/secrets y `git diff --check`: satisfactorios.
- Revisor independiente, solo lectura: aprobación técnica acotada al ensayo.
  Su observación sobre probar un callback válido quedó corregida y revisada.
  No accedió a BD, respaldo o credenciales; no autoriza producción.

## Operación propuesta y pendientes

1. Invitar identidad desde un servicio administrativo confiable y verificar su
   correo. Hasta entonces el perfil permanece pendiente, sin cuenta ni permisos.
2. Admin existente con MFA asigna UUID, cuenta/rol permitido, versión esperada,
   clave de intención y motivo mediante `portal_identity_command_v1`.
3. Usuario inicia sesión nuevamente; la BD determina alcance. Revocar/restaurar
   usa la misma operación auditada, sin cambios directos del cliente.

No se habilitó una UI de invitación ni se expuso service_role. Falta implementar
el despacho administrativo de invitaciones/gestión en UI con su propio contrato
de efectos externos, aprovisionar/reconciliar los usuarios reales y MFA del admin
de forma controlada, y validar SMTP/redirects/OAuth alojados según alcance.
También permanecen paginación, persistencia H1.2, runtime Node soportado,
aceptación funcional/visual y preparación operativa del despliegue. El ensayo no
certifica recuperación de claves externas/Vault ni una política de backups remota.

## Reproducción y rollback

Scripts explícitos, nunca desde CI: `setup-identity-lab.cjs`, `identity-provider.cjs`
y `identity-browser.cjs`, todos con `--authorized-local-identity`. Requieren la
copia privada autorizada, Podman local y SDK verificado; no descubren credenciales
ni destinos hospedados. `--reset-owned-lab` valida etiquetas antes de reconstruir
exclusivamente este laboratorio. El setup conserva los registros privados de
intentos previos; su eliminación se controla al cerrar el ensayo.

Rollback del ensayo: retirar exclusivamente los cuatro contenedores y red con
etiqueta `dv.rehearsal=identity-20261025`, eliminar credenciales temporales y detener
la máquina propia cuando no haya otros contenedores activos. El respaldo original
se conserva. Las propuestas no son idempotentes: aplicar una sola vez a una copia
limpia. No hay SQL de rollback alojado autorizado; cualquier despliegue futuro
requiere un plan propio que preserve operaciones posteriores.

Cierre ejecutado y verificado: cuatro contenedores y su red retirados, diez
archivos temporales de credenciales eliminados entre los tres intentos privados,
cero contenedores activos y máquina `dv-portal-h1` detenida. Se preservaron el
respaldo original y los contenedores previos ajenos a este ensayo.

Fuentes técnicas primarias: [Supabase invite](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
[MFA](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify),
[sesiones GoTrue2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/models/sessions.go),
[PostgREST errores](https://docs.postgrest.org/en/stable/references/errors.html),
[Mailpit API](https://mailpit.axllent.org/docs/api-v1/).
