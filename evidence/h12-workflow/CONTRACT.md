# H1.2 — corte operativo aislado

Mandato de Arturo, 2026-10-26: trabajar los cinco puntos y detenerse ante una
aprobación necesaria. Repositorio editable: Portal, `codex/portal-h12-drafts`,
base `542c70544ae908f3785d25397021df89a802f2b5`; se conserva el WIP anterior.
Fuente documental de solo lectura: Runtime `cbd68d81fe70da9d3d1e6125c67d25d77ad9b454`
y contrato local `runtime-h12-collaboration/14_PORTAL/Mensajeria-y-colaboradores-H1.2.md`.

## Alcance de los cinco puntos

1. Confirmar la última versión guardada, elegir archivos y recibir folio. Las
   notas de opciones desmarcadas permanecen privadas; no se envían por defecto.
   La instantánea enviada no cambia al editar el borrador. Reintento con misma
   clave devuelve el mismo recibo; otra carga con esa clave es conflicto.
2. Bandeja de solicitudes para miembros DV con alcance explícito por cuenta.
   Responsable y estado se actualizan con versión esperada; no hay autoridad
   por un selector visual ni por una mera etiqueta de administrador.
3. Conversación cliente/equipo e interna separadas. Mensajes inmutables,
   notificaciones por destinatario y leído/no leído. Correo solo capturado en
   laboratorio, sin destinatarios reales. Publicar devolución requiere permiso
   separado y confirmación explícita de la versión revisada.
4. Cola durable, concesión temporal y resultado ligado a la solicitud original.
   Adaptador de herramientas acotadas para el trabajador; simulador declarado.
   Un fallo de análisis no pierde la solicitud. Ningún resultado publica solo.
5. Invitación por encargo con contexto seleccionado, aceptación/rechazo,
   vencimiento y revocación. El suscriptor sin encargo no lee expedientes.
   Referencia externa exige autorización del cliente para ese destinatario y
   ese contexto. Reasignar requiere una nueva invitación y revoca la anterior.

## Decisiones del laboratorio

Las pruebas usan cuentas nuevas `synthetic.invalid`, sin tocar el borrador de
revisión existente. Los permisos se aprovisionan por fixture confiable, no por
API de autoservicio. Todo el equipo DV autorizado para la cuenta recibe avisos;
el responsable coordina y puede cambiarse sin alterar los lectores autorizados.
No se fijan precios, contratos, comisiones ni SLA. Identidad visual y navegación
del recorrido aprobado permanecen como referencia; esta superficie operativa
de prueba no constituye una nueva aprobación de diseño.

Las propuestas SQL quedan fuera de migrations. No hay commit, push, merge,
despliegue ni conexión a producción. Los 39 IDs siguen pendientes para operación
alojada. El correo real, proveedor/modelo y tratamiento de datos reales requieren
un paquete de activación revisable y aprobación posterior.

## Criterios de comprobación

Persistencia entre sesiones; aislamiento entre cuentas; rechazo anónimo y actor
revocado; selección exacta de archivos; permisos internos y de publicación;
concurrencia, reintentos y versiones; revocación de colaborador y consentimientos;
notificaciones sin fuga; concesión caducada y resultado tardío; fallo de correo
independiente de recepción; recuperación del borrador original sin cambios.
