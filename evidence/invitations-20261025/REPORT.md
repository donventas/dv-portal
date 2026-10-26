# Invitaciones administrativas — entorno aislado, 2026-10-25

## Resultado y alcance

Gestión administrativa integrada en el Portal y probada con Auth, PostgreSQL,
PostgREST y SMTP locales reales. El recorrido cubre MFA, envío, confirmación,
concesión de permisos y revocación/restauración. **Sin cambios ni conexiones a
producción, sin correos externos. NO_GO para LIVE.**

Único repositorio editable: `donventas/dv-portal`, rama
`codex/portal-h1-hardening`, base `83d98504b1b17e9264603f29dcf058e1708e26e7`,
[PR #6](https://github.com/donventas/dv-portal/pull/6). Checkout limpio al inicio.
Arturo autorizó continuar invitaciones/validaciones aisladas; siguen vigentes
commit/push/PR de desarrollo y revisión independiente. Sin merge ni despliegue.
No se editaron Runtime, Landing ni expedientes de clientes. Se reutilizaron
los componentes y tokens ya integrados en Portal, sin cambiar el canon de marca.

## Qué cambió

- `supabase/proposals/h10-invitations.sql`: intención durable antes del envío,
  clave idempotente, unicidad por destinatario abierto y cuota de veinte nuevas
  intenciones por administrador/hora. Solo acepta destinatarios sintéticos.
- El administrador debe tener identidad verificada, sesión activa y MFA real.
  El claim vuelve a comprobar rol, estado, sesión, versión y vigencia de la
  aprobación. Una aprobación pendiente expira en diez minutos.
- Claim/completion son funciones exclusivas del dispatcher privilegiado. El
  recibo está ligado a un nonce y rechaza cambios contradictorios. Registra el
  efecto ocurrido aunque el administrador haya sido revocado después del claim.
- Estado ambiguo, timeout o lease vencido queda `uncertain`; nunca se reencola
  automáticamente. Solo una intención todavía `queued` puede cancelarse. Una
  invitación aceptada por el proveedor sigue bloqueando duplicados por correo.
- `server/invitations.cjs`: dispatcher HTTP local, origen exacto, Bearer, tamaño
  y tipo de solicitud limitados; configuración de servicios exclusivamente
  loopback, destinatarios `synthetic.invalid`, sin claves embebidas ni en frontend.
- `app/admin-invitations.js`: vista Equipo para admin admitido, verificación MFA,
  formulario con motivo, estados, cancelación previa al envío y gestión de
  identidades verificadas. Conceder, revocar y restaurar usan el contrato de
  identidad anterior y su auditoría. No otorga permisos por enviar el correo.
- Directorios de invitaciones/personas con paginación por UUID: veinte filas
  visibles y una adicional para detectar continuación. No expone nonces ni
  sesiones del dispatcher. Los cambios no confirmados conservan su intención.
- Adaptador, write guard, shell y Store integrados: capacidad solo SANDBOX/LOCAL,
  confirmación explícita de acciones, limpieza de estado al cambiar identidad y
  descarte de resultados cuando se abandona la vista.

## Invitación y autenticación

La invitación administrativa estándar de GoTrue no es el flujo PKCE de acceso.
El proveedor verifica el enlace y entrega un callback con fragmento. El Portal
captura y limpia ese fragmento antes de iniciar el SDK, verifica el bearer contra
Auth y cierra la sesión de invitación sin instalarla en SDK/Store. No se muestra
ni persiste el token. El cierre usa `scope=local`; se comprueba que otra sesión
del mismo destinatario sigue renovándose. El destinatario sigue sin permisos.

Después de la asignación explícita del UUID confirmado, el usuario solicita
un enlace nuevo e inicia sesión mediante PKCE en el mismo navegador. La prueba
recorrió este proceso en otro contexto de navegador distinto al del administrador.
Restaurar acceso no revive el JWT ni refresh anteriores.

## Validaciones realizadas

[results.json](results.json) registra nueve grupos satisfactorios y cuatro
despachos sintéticos, todos hacia Mailpit:

1. Anónimo, identidad pendiente no administradora, aal1, origen externo, destinatario real y llamadas directas
   a claim/tabla rechazados antes del envío.
2. Solicitudes concurrentes y replay envían una sola vez; otra clave para el
   mismo destinatario no duplica correo. El perfil continúa pendiente.
3. Respuesta del proveedor perdida, fallo al guardar recibo y lease vencido no
   causan reenvío, incluso cuando Mailpit ya recibió el correo.
4. Cancelación solo previa al envío, expiración de aprobación, nonce incorrecto,
   completion sin privilegios y recibos contradictorios rechazados.
5. UI real del Portal exige MFA, envía la invitación, confirma el destinatario,
   borra el callback y deja SDK/Store sin esa sesión.
6. UI concede al UUID confirmado; PKCE entra a su cuenta. Revocar/restaurar desde
   UI mantiene negado el acceso al refresh antiguo.
7. Shell y formularios sin desbordamiento a 320/390/1280 px; capturas
   [escritorio](admin-1280.png) y [móvil](admin-390.png) revisadas visualmente.
   Cero tráfico de navegador externo y ninguna clave privilegiada en sus requests.
8. Páginas reales completas, sin duplicados ni secretos de despacho; cuota
   aplicada y directorio rechazado para usuario no administrador.
9. Revocar al admin bloquea claim pendiente y replay, conservando el recibo
   histórico de una operación ya reclamada.

Regresión: 256 pruebas Node (225 unitarias +31 integración), diez pruebas
Playwright y verificadores paths/bundle/secrets. La comprobación de secretos
ahora también inspecciona `.cjs`. La prueba adicional de capacidad deshabilitada
y el ensayo final de cierre local de la sesión resultaron satisfactorios.

El ensayo utiliza el respaldo previamente autorizado, restaurado y saneado
antes de abrir servicios mediante `setup-identity-lab.cjs`. Se aplicaron H1.0,
identidad e invitaciones como `postgres NOSUPERUSER`. Servicios y aislamientos
conservan las versiones/controles del [ensayo de identidad](../identity-auth-20261025/REPORT.md).
La configuración de release y el resolver reales se ejecutan; solamente la
admisión de la nueva capacidad se inyecta explícitamente en el servidor local de
prueba. No modifica el mapper ni la configuración pública de despliegue.

## Límites y continuación

Todos los flujos operativos se conservan pendientes, con área y criterio de
cierre, en el [backlog operativo](../operational-backlog.md), por instrucción de
Arturo. Distingue el avance aislado de la admisión alojada y la persistencia H1.2.

La gestión y el despacho quedan cerrados para este ensayo aislado. Un estado
ambiguo requiere reconciliación operativa antes de habilitar reenvío; no hay
botón que fuerce un segundo correo ni se promete entrega por un simple HTTP200.
El recibo `uncertain` ya completado queda retenido: no existe aún un comando/UI
de reconciliación posterior y no se permite sobrescribirlo como `sent`.
La UI distingue aceptación por el proveedor; la recepción solo se demuestra en
el buzón SMTP local. El código no crea administradores ni configura su MFA.

Para avanzar a un entorno alojado faltan admisión y configuración del servicio,
SMTP/deliverabilidad, redirects y OAuth según alcance, reconciliación de usuarios
reales y MFA del administrador, gestión operativa de incidencias y conservación
de secretos/backups. No se intentó cerrar esos puntos contra producción.
La paginación aquí cubre los nuevos directorios; sigue pendiente la hidratación
general del Portal. Persistencia H1.2, runtime Node soportado y aceptación
funcional/visual también permanecen fuera de este corte.

## Reproducción y recuperación

Primero preparar una copia sintética con `setup-identity-lab.cjs` y aplicar una
sola vez `h10-invitations.sql` después del contrato de identidad. Después:
`node supabase/tests/invitations-integration.cjs --authorized-local-identity`.
El harness usa el SDK local verificado por SRI y el navegador instalado; no
descubre contraseñas, no consulta proyectos alojados y no despliega servicios.
Las credenciales temporales permanecen fuera de Git y del bundle del Portal.

Recuperación del ensayo: retirar únicamente contenedores/red etiquetados
`dv.rehearsal=identity-20261025`, eliminar credenciales temporales y detener la
máquina propia si no hay otros contenedores activos. Conservar el respaldo
original. Cualquier migración o rollback alojado necesita su propio plan y
autorización; este cambio no los ejecuta.

Revisión independiente de solo lectura: sin bloqueantes para el ensayo aislado.
Se atendió la observación sobre cierre local de la sesión de invitación y se
dejó explícita la limitación de reconciliación. No revisó credenciales ni datos
privados y no otorga autorización productiva.

Cierre del laboratorio ejecutado y verificado: cuatro contenedores propios y su
red retirados, nueve archivos temporales de credenciales eliminados, cero
contenedores activos y máquina `dv-portal-h1` detenida. Se preservaron el respaldo
original y los contenedores previos ajenos al ensayo. El servidor de prueba en
55454 terminó con la suite; no queda una instancia administrativa activa.

Fuentes primarias: [API de invitación Supabase](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
y [implementación GoTrue2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/invite.go).
