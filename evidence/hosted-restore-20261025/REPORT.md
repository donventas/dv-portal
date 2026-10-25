# H1.0 · respaldo real, restauración aislada y adaptación del candidato

Fecha: 2026-10-25. Resultado: **PASS para compatibilidad SQL y recuperación del
respaldo en aislamiento; NO_GO para LIVE**. Producción no recibió DDL, DML,
reseteo de credenciales ni cambios de permisos. Su contrato candidato sigue ausente.

## Autoridad y entradas

- Autorización de Arturo: respaldar y restaurar en aislamiento, adaptar y probar
  la migración sin modificar producción; commit/push y mismo PR de desarrollo.
- Único repositorio editable: `donventas/dv-portal`, rama
  `codex/portal-h1-hardening`, PR #6; HEAD inicial
  `1b63698d24fc746282e819e77b0eb899277fa282`, checkout inicialmente limpio.
- Runtime y Landing permanecen referencias de solo lectura. Commits fijados en
  esta continuación: `f01d471bc4aab1c6fdc9010d76d4ec188504919d` y
  `c487c25184ec05feed526e36572d274acb9d4eb0`, respectivamente.
- Origen verificado: proyecto Supabase `don-ventas`, ref
  `hlabhmegjnrjygsywnqa`, PostgreSQL 17.6, session pooler IPv4 puerto 5432.
- Se usó la contraseña existente indicada por Arturo. No se almacena en Git,
  informes, URI de conexión ni archivos de contraseña. Exportación de roles con
  `--no-role-passwords`. No se conservó el contenido de la hoja en evidencia.

## Respaldo e integridad verificados

`pg_dump` 17.11 produjo un archivo custom de la base completa: 937766 bytes,
895 entradas TOC y 66 entradas TABLE DATA. SHA-256:
`4861B9665818E19BCDCE122B9BBE567C0DDDC2C09720075B49A8B4789F0DFABC`.
Salida 0; original conservado sin modificaciones y marcado solo lectura.

Ubicación privada local permanente, fuera de Git y OneDrive:
`%LOCALAPPDATA%/DonVentas/Backups/portal-20261025-132427/`.
ACL explícita para Arturo y SYSTEM, sin herencia. Incluye el dump original,
roles sin contraseñas, TOC, esquemas antes/después, huellas privadas y logs.
No es una copia externa ni un servicio automático de backups.

La comparación posterior contra origen se ejecutó en una transacción
REPEATABLE READ READ ONLY. Conteos y hashes de filas ordenadas coincidieron en
65/66 tablas. `cron.job_run_details` pasó de 23058 filas del respaldo a 23064
en origen; el origen siguió operando. No se atribuye ese cambio a la migración.
La recuperación repetida desde **el mismo archivo original** coincidió en
66/66 tablas con la primera restauración, incluido ese historial de cron.

Storage tenía cero buckets y cero objetos. Había dos jobs cron activos y dos
secretos Vault. Los secretos se conservaron cifrados; **no se descifraron ni se
verificó la recuperación de su clave raíz en otra instalación**. El dump no
incluye configuración del panel, SMTP/OAuth, Edge Functions ni claves externas.
Restaurar la BD no demuestra recuperación completa del servicio Supabase.

## Laboratorio y procedimiento ejecutado

Se reutilizó la máquina Podman `dv-portal-h1`; `avos-nl1-p1` no se modificó.
Un único contenedor desechable utilizó la imagen oficial
`supabase/postgres:17.6.1.136`, digest
`sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b`.

Antes de importar: `--network none`, sin puertos publicados, conexión SQL
interna a 127.0.0.1, `cron.launch_active_jobs=off`, y `pg_net.database_name`
apuntando a una base inexistente. No se iniciaron Auth, SMTP, REST ni OAuth.
Las ocho extensiones coincidieron en versión: pg_cron 1.6.4, pg_net 0.20.3,
pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1,
unaccent 1.1 y uuid-ossp 1.1.

1. Inicialización limpia con `initdb`, superusuario local `supabase_admin`;
   roles exportados sin contraseñas. Solo se omite el CREATE de ese rol ya creado.
2. Base local `portal_h10_disposable`, propietario postgres, template0.
   `pg_restore --exit-on-error --single-transaction` conserva propietarios,
   ACL, esquemas, datos, triggers y políticas del archivo original.
3. Dos incompatibilidades del entorno local se resolvieron antes del PASS:
   cargar pg_net en shared_preload_libraries y elevar temporalmente **solo el
   rol postgres local** para asignarle propiedad de event triggers. Tras importar
   se restableció NOSUPERUSER. Cada intento fallido revirtió su transacción.
4. Se aplicó el candidato como postgres **NOSUPERUSER**, sin crear el RPC legacy
   ausente. Aplicación y suites `h10-negative.sql`/`h10-security.sql`: salida 0.
5. Recuperación: se eliminó exclusivamente esa BD desechable, se restauró otra
   vez desde el original y se verificaron 66/66 huellas y ausencia del candidato.
6. Se introdujo CREATE en auth_dv para authenticated únicamente como fixture
   adversarial local. El candidato final lo revocó, concedió solo USAGE y volvió
   a pasar ambas suites, incluido rollback de activación antes de receipt/audit.
7. Tras las pruebas, 66/66 huellas originales intactas y cero recibos/audit
   persistentes. Los fixtures se revierten. Cero nombres heredados incompatibles
   con portal_display_name; el constraint sigue NOT VALID por diseño del candidato.
8. El contenedor con datos reales fue detenido y eliminado. Máquina dedicada
   apagada tras comprobar que no tenía otros contenedores ejecutándose.

## Cambios revisables

- Activación autosuficiente dentro de `portal_command_v1`: conserva bloqueo,
  versión, árbol, paquete, asignación, kickoff, idempotencia y auditoría. Retira
  permisos del RPC legacy si existe, sin exigir crearlo si falta. Activar **no
  provisiona un usuario owner**; ese flujo sigue pendiente.
- USAGE de auth_dv se concede en la misma transacción que el endurecimiento;
  se retira CREATE previo de PUBLIC, anon y authenticated.
- Pruebas: unicidad de todos los efectos de activación, fallo antes del receipt
  con rollback integral, permisos efectivos del esquema; el harness deja de
  corregir USAGE por fuera del candidato.
- CI: se agregan a la lista de rutas autorizadas únicamente este informe y
  results.json. El primer CI detectó su omisión; no se amplía la admisión a
  dumps, logs privados ni directorios completos.
- Comparación de bloques del esquema antes/después: solo cambios esperados en
  objetos Portal public/auth_dv. Se preservaron dv_comments, funciones
  dv_article_*/dv_newsletter_*, cron, Vault, Storage, Auth y webhook de lead.

Validación adicional: 215 pruebas unitarias + 31 de integración, paths, bundle
y secrets: PASS. No se repitieron navegador, concurrencia ni proveedor JWT en
este corte SQL; sus resultados anteriores son los de `evidence/h1-chain/`.
El revisor independiente leyó el diff final: sin objeciones adicionales. Los
resultados de BD son evidencia del ejecutor; el revisor no leyó backups privados.

## Pendientes y siguiente decisión

El inventario y el ensayo sobre una copia real ya están completados. Antes de
LIVE siguen pendientes aprovisionamiento seguro de owners/invitaciones,
paginación, persistencia H1.2, runtime Node soportado, aceptación funcional y
visual, y pruebas de integración alojada/SMTP/OAuth según el alcance definitivo.
Para recuperación operativa también se necesita resolver conservación de claves
Vault/configuración externa y una política de backup durable fuera del equipo.

Recomendación: cerrar el contrato de aprovisionamiento y sus consumidores sobre
esta base verificada. No hace falta otro proyecto cloud para repetir el ensayo SQL.
Merge, migración remota y despliegue requieren sus autorizaciones propias.
Un eventual rollback productivo exige congelar escrituras, conservar/reconciliar
cambios posteriores y verificar restauración antes de redirigir tráfico; el
ensayo local no autoriza sustituir ni borrar producción.

Fuentes técnicas: [restauración desde Platform](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres),
[imagen oficial utilizada](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml).
