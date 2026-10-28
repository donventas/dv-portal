# Arquitectura propuesta — servicio humano de marca

Aplicación candidata del PRD con recorrido conectado ensayado en laboratorio y operación alojada pendiente. La sección final «Estado arquitectónico para el cierre local H1.2 — 2026-10-27» consolida el estado vigente; los apartados intermedios conservan la evolución histórica. Este documento no es una migración alojada ejecutada.

## Autoridades separadas

El servidor autoriza actores, transiciones y acceso. El cliente representa estado y conserva entradas. AVOS/MCP puede apoyar tareas internas acotadas, sin autoridad para aceptar términos, cobrar, conceder acceso o publicar. Las colas y notificaciones consumen eventos confirmados; un fallo de correo o IA no pierde un encargo.

## Entidades y relaciones

Son conceptos de dominio, no once subsistemas nuevos. El primer recorte debe
reutilizar tres conjuntos: perfil de marca, encargo y entrega. Alcance,
asignación y revisiones se versionan donde hagan falta sobre los contratos
existentes. Separar tablas o trabajadores solo por una necesidad comprobada;
no construir cobros, agenda ni catálogo completo antes de validar un servicio.

| Entidad candidata | Contenido / invariantes |
|---|---|
| brand_profile_version | Respuestas y activos del cliente. Editable mediante nuevas versiones; compartido solo por selección explícita. |
| service_definition_version | Resultado, inclusiones, exclusiones, formatos, requisitos, rondas, derechos y condiciones de precio/plazo. Publicación de catálogo por DV. |
| service_request | Cuenta, solicitante, necesidad y snapshot del brief. Interés explícito, no compra. |
| scope_offer_version | Alcance concreto, precio/moneda/impuestos, fechas, requisitos de inicio, revisiones y vigencia. Inmutable una vez propuesto; una revisión invalida aceptación previa. |
| scope_acceptance | Actor, versión exacta y momento de aceptación. Pago separado. |
| work_order | Responsable DV, compromiso vigente, estado de producción, bloqueo, próxima actualización y relación con alcance aceptado. |
| assignment | Especialista, brief autorizado, entregables, fecha, remuneración acordada, vencimiento y aceptación/declinación. Revocación conserva auditoría. |
| deliverable_version / quality_review | Archivos privados, contenido, decisiones, uso, autor, versión de alcance y revisión explícita. Publicación atómica de una versión exacta. |
| revision_request | Versión observada, notas, clasificación dentro/fuera de alcance, consumo de ronda confirmado por política, resolución. |
| conversation / event_outbox | Mensajes inmutables por audiencia; evento deduplicable con destinatarios autorizados. |
| billing_record | Estado económico independiente, proveedor/verificación/idempotencia. Pendiente; no modelarlo como delivered o working. |

## Transiciones

Solicitud: recibida → aclaración o alcance propuesto → aceptado / rechazado / vencido.

Trabajo: pendiente de requisitos y capacidad → listo para coordinar → asignado/interno → elaboración → revisión de calidad → publicado → ajustes/aceptado → cerrado.

Asignación: invitada → aceptada/declinada/vencida → avance entregado → observaciones/resuelta. Reasignar exige revocar y obtener otra aceptación; no sustituir silenciosamente a una persona.

El prototipo usa una fase resumida para recorrer estas decisiones. La implementación real debe separar los agregados anteriores: no copiar su reducer de sesión como autoridad del backend.

## Contratos de comandos candidatos

Cada comando con actor autenticado, cuenta, expectedRevision, idempotencyKey y payload validado en servidor. Reintento idéntico devuelve recibo; payload distinto con misma clave es conflicto.

- request.create / clarify / reply: snapshot y consentimiento de revisión, con mínimos proporcionales.
- scope.propose / accept / decline: versión exacta, moneda/precio y disponibilidad verificados. No aceptar propuestas vencidas o supersedidas.
- order.start / block / reschedule: capacidad y requisitos vigentes. Reprogramar conserva el compromiso anterior en auditoría y obtiene aceptación del impacto.
- assignment.invite / accept / decline / expire / revoke: audiencias por encargo, aceptación de fecha y condiciones. No privilegios por etiqueta visual.
- delivery.submit / request_correction / approve_publish: avance privado → revisión DV → versión publicada atómicamente. Si cambia el contenido, se invalida aprobación.
- revision.request / classify / resolve; order.accept_close: historial, límites y desacuerdos explícitos.

No se añaden estos comandos al MCP ni a las RPC existentes durante este diseño. Las RPC H1.2 actuales de solicitud, mensaje y colaboración sirven de base de integración y necesitan nueva revisión de concurrencia y RLS.

## Matriz de lectura y acción

| Información | Cliente | Equipo autorizado de la cuenta | Colaborador asignado |
|---|---|---|---|
| Perfil de marca completo | Su cuenta según rol | Solo alcance concedido | Nunca por defecto |
| Brief de solicitud | Propio | Sí | Solo subset del encargo aceptado |
| Precio al cliente / términos | Propios | Permiso comercial | No; condiciones propias en contrato aparte |
| Notas internas / IA | No | Permiso interno | Solo observaciones dirigidas al encargo |
| Avance sin revisar | No | Sí | Su propio avance |
| Entrega publicada | Propia | Sí | Lo necesario para su colaboración |
| Publicar al cliente | No | Permiso separado + aprobación | No |

Acceso denegado ante actor revocado, encargo vencido o cuenta ajena. El contrato real incluye cuentas distintas, sesiones caducadas, IDOR, enlaces de archivo caducados y retirada de acceso, no solo ocultación de UI.

## Infraestructura mínima y evolución

Reutilizar Supabase/Auth y almacenamiento privado existentes del laboratorio; tablas por agregados, RPC transaccionales, RLS, outbox y trabajador con privilegio mínimo. No añadir microservicios para cada estado. El transporte MCP es adaptador interno opcional con herramientas mínimas, entradas versionadas y resultados no publicados. Captura local de correo antes de autorizar proveedor real.

Archivos: metadatos y permisos por versión, límites/tipos, revisión de contenido, almacenamiento privado y URLs de acceso acotadas. Un adjunto no se publica por cargarse. No copiar evidencias de un cliente a otro ni a AVOS.

Capacidad: empezar por confirmación manual del coordinador y aceptación del especialista. Agenda automatizada, reparto, comisiones, disponibilidad en tiempo real y SLA no son necesarios para el primer recorte; permanecen pendientes hasta tener políticas y evidencia.

## Prototipo implementado y separación

`app/service-model.js` especifica transiciones del ensayo; `app/service-journey.js/css` presenta tres perspectivas dentro del shell con tokens de marca. Habilitación únicamente con `experience=human`, host local y DVDrafts habilitado. Sin fetch, SQL, archivos, correo, proveedor de pago o llamadas MCP. Guarda solo el escenario de ejemplo y entradas en sessionStorage con clave separada por usuario; logout elimina esa clave. No contiene credenciales. No es una frontera de seguridad: las tres vistas son accesibles a quien revisa la simulación.

Las cuentas reales aisladas del Portal conservan su autenticación, borrador y permisos existentes. El selector del prototipo nunca cambia la sesión ni simula que ha concedido acceso real a otro usuario.

## Validación y despliegue

Ahora: pruebas del reducer, ciclo UI sin red operativa, matriz visual, preservación y revisión independiente. Después: contrato persistente, seguridad y concurrencia con tres cuentas distintas; fallos/reintentos, expiración, archivos, outbox y pruebas de cancelación/reprogramación. Solo después del paquete concreto de activación se consideran pagos/correos/IA reales. `vercel.json` conserva bloqueo de despliegues de main y H1.2. Sin commit, merge ni producción en este corte.

## Integración acotada ejecutada en laboratorio — 2026-10-26

Este apartado actualiza el primer recorte; las entidades comerciales propuestas arriba no se han migrado ni activado. Se amplió la RPC existente `portal_workflow_v1` con `submit_improvement`, reutilizando solicitud, snapshot, recibo idempotente, conversación y avisos. No se creó un segundo sistema de mensajes.

- Entrada permitida: categoría, necesidad, claves de contexto seleccionadas, versión exacta y consentimiento. Cuenta y actor provienen de Auth, nunca del payload. Solo el titular autorizado envía.
- Seis categorías y dos orientaciones; necesidad de 1 a 4000 caracteres. Contexto vacío permitido; si se eligen respuestas, el servidor toma los valores del borrador de esa cuenta y versión. Archivos y campos no permitidos se rechazan.
- Una solicitud exige equipo autorizado preexistente. La prueba no concede permisos ni crea miembros. Cuenta ajena, miembro no titular y colaborador no asignado no pueden leer ni enviar como cliente.
- Mismo actor/clave/payload devuelve el mismo folio; cambiar payload con la misma clave produce conflicto. La interfaz mantiene el envío pendiente hasta confirmar su recibo, incluso después de recargar.
- Avisos internos por destinatario autorizado; `mail_state=suppressed` para `improvement-v1`, incluyendo respuestas posteriores. No se crean trabajos de análisis para estas solicitudes. No se ejecutó worker ni proveedor externo.
- `app/improvements-ui.js` usa la conexión autenticada de `workflow-ui.js`; no usa el selector de roles del prototipo. Solo se habilita con DVDrafts aislado y `experience=requests`.
- Los buffers se ligan a usuario, sesión Auth y entorno; no contienen JWT. Sesión desconocida no restaura buffers. Logout, revocación y error de autorización retiran identidad y datos; los eventos de un montaje vencido y las respuestas tardías no pueden repoblarlos. Un fallo de transporte conserva la intención pendiente.

Se reemplazaron únicamente dos funciones revisadas dentro de `portal_h10_disposable`: `auth_dv.review_notify` y `public.portal_workflow_v1`. Sin reset/reseed, grants, cambios de credenciales ni producción. Las pruebas comprobaron que los borradores preexistentes conservaron su hash. El servidor de revisión permite además el puerto fijo loopback 55477, para una sesión cliente separada del prototipo abierto; el equipo sigue en 55475.

Límite: la respuesta validada es conversación humana persistente, no un deck/archivo publicado ni un alcance contratado. Publicación, aceptación comercial, colaboración del nuevo recorrido y entrega versionada requieren su siguiente recorte. La revisión independiente es estática y coteja recibos, no sustituye una certificación de producción.

## Contrato implementado de propuesta/aceptación — solo laboratorio

Se añade `portal_request_scope`: una fila por solicitud/versión con definición, entrega, validez, autor y fecha de propuesta, actor/fecha de aceptación. RLS activado, sin permisos directos para public/anon/authenticated. El contenido compartido no se edita por RPC: una corrección crea otra versión. La aceptación se escribe una sola vez por versión. El historial se devuelve solo a equipo autorizado y titular; nunca al colaborador.

La RPC existente incorpora:

- `scope_propose`: equipo activo con `can_publish`, solicitud `improvement-v1` abierta, revisión esperada de la solicitud, payload cerrado y capacidad confirmada. Nueva versión, aumento de revisión, responsable proponente y avisos en la misma transacción.
- `scope_accept`: titular activo, consentimiento `scope-lab-v1`, número exacto de la propuesta vigente. Rechaza solicitud cerrada, vencimiento y versión sustituida. La aceptación no se transfiere al crear otra versión. No inicia trabajo ni contratación.
- `read.scopes`: historial descendente con estado derivado (propuesta, aceptada, vencida, sustituida o solicitud cerrada). Una aceptación anterior sigue en auditoría, sin presentarse como aceptación del nuevo alcance.

Permisos de ambos comandos se revalidan antes de devolver receipts, incluido `can_publish`. Bloqueo de identidad existente y bloqueo de fila de solicitud serializan propuesta/aceptación/gestión. Claves idempotentes existentes: replay idéntico devuelve recibo; payload distinto con igual clave falla. Aceptar concurrentemente la misma versión no reescribe actor/fecha. Todas las fechas se validan en servidor con el día de `America/Mexico_City`; límite de aceptación >= hoy y < entrega. La validez limita aceptar, no borra una aceptación histórica al llegar esa fecha.

Los avisos reutilizan `review_notify`, suprimidos para correo por `improvement-v1`; no se crean jobs de IA. Se aplicó únicamente la creación aditiva de esta tabla privada y la sustitución revisada de `portal_workflow_v1` en `portal_h10_disposable`. No se alteraron grants permanentes de personas ni borradores previos. Los ensayos de revocación/expiración/cierre se ejecutaron en transacciones revertidas con sesión Auth válida.

`workflow-ui.js` añade el bloque de alcance en el expediente existente, confirmación manual y lectura histórica; `workflow.css` reutiliza tokens semánticos y controles con área táctil. Errores específicos orientan a revisar fechas/capacidad o actualizar versión; una confirmación identifica explícitamente el número aceptado incluso si otra propuesta llegó durante la respuesta.

No se ha aplicado esta migración a un entorno alojado ni se autoriza hacerlo por el resultado del laboratorio. El siguiente agregado operativo aún debe vincular asignación, avances y publicación a la versión aceptada; las herramientas previas de colaboración/devolución no constituyen esa integración por sí solas.

## Contrato implementado de encargo/entrega — solo laboratorio

La asignación existente incorpora `scope_version`, `brief` y `due_on`, con FK a la versión de alcance. `portal_request_delivery` conserva contenido, explicación de uso, autor, fecha, versión por encargo y resultado de revisión (submitted/changes/published), actor/fecha y observación. RLS y ausencia de grants directos; toda operación usa `portal_workflow_v1`. El contenido de cada versión es inmutable por RPC. Solo se modifica su revisión.

`work_assign` exige equipo activo, alcance vigente aceptado, revisión de solicitud, colaborador suscrito/verificado, fecha coherente y selección válida de contexto. Solo un encargo invited/accepted vigente por alcance. `work_accept/work_reject` requieren destinatario y confirmación exacta del alcance. `delivery_submit` exige encargo aceptado vigente del autor; evita otro avance mientras haya uno pendiente o publicado. `delivery_review` exige equipo con can_publish, revisor distinto del autor, revisión de solicitud y última versión enviada del encargo. La publicación escribe estado y aviso atómicamente. Una observación pide nueva versión sin alterar el cuerpo anterior.

`review_scope_current` verifica alcance más reciente aceptado y solicitud abierta. `review_assignment`, lectura de avances, avisos e invitaciones revalidan esa relación; una descripción de encargo solo vuelve en inbox si la invitación sigue activa y sin vencer. Permisos, vigencia y número de alcance se validan antes de recibos idempotentes. Las acciones legacy assign/accept/reject/publish se rechazan para improvement-v1, incluyendo sus replays. La versión publicada sigue accesible al cliente como historia aunque cambie el alcance.

Lectura: el equipo ve versiones y observaciones; el colaborador únicamente su encargo y versiones, sin el historial completo de alcance; el cliente solo versiones publicadas, con reviewNote=null. La revisión permanece vinculada a request/assignment/scope/version, sin publicación directa por colaborador. Fechas de avance y acceso son distintas; expires_at corresponde a medianoche CDMX de delivery_on+8, que cierra el séptimo día posterior a la entrega.

Se reutilizan el bloqueo de identidad, el bloqueo de fila de solicitud, receipts y notificaciones suprimidas. Las pruebas incluyen envío concurrente con la misma clave, revisión frente a cambio de alcance, retirada frente a publicación, y revocación/vencimiento/can_publish antes de replay. No se crean jobs ni correos en cola para estas mejoras. Guardado y recuperación usan Auth real del proveedor local con perfiles sintéticos separados.

Aplicación acotada: columnas/FK y tabla aditivas, helper privado y sustitución de tres funciones en `portal_h10_disposable`; sin reset, reseed, nuevas concesiones a personas ni cambios de credenciales. El runner compara la función desplegada contra el baseline o su recibo local previo antes de reemplazarla. Preserva hash de borradores existentes. Las pruebas de expiración y cambios de permisos hacen rollback. Las solicitudes de ensayo permanecen como evidencia sintética.

Rollback de este corte: detener las nuevas acciones en la UI local y restaurar solo los archivos/funciones guardados en el paquete `collaboration-delivery-20261026/before`, mediante revisión separada; conservar tabla/columnas y versiones para evitar pérdida de evidencia. No ejecutar eliminación ni restauración destructiva por este documento. No hay rollback de producción porque no se la modificó.

Pendientes fuera del corte: adjuntos de entrega privada, recepción/ajustes del cliente, condiciones comerciales y política de retención, monitoreo alojado, escalamiento y activación de proveedores. El bloqueo global heredado de identidad es suficiente para esta validación local; no acredita rendimiento de producción.

## Recepción y ronda autorizada — solo laboratorio

`portal_delivery_response` añade una fila por entrega publicada: request/scope/delivery, decisión del titular received/changes, focos/nota, actor/fecha y decisión del equipo accepted/scope_needed con explicación y trazabilidad. RLS sin grants directos. La respuesta del cliente es inmutable por RPC; la decisión del equipo se escribe una vez. `delivery_respond` exige titular, última publicación del alcance vigente, revisión de solicitud y confirmación. `response_review` exige equipo activo con can_publish y revisión actual; accepted además exige encargo activo y ronda disponible. Recibos revalidan actor, alcance y publicación vigente antes de replay. No se concede autoridad desde la UI.

La última publicación se identifica por solicitud/alcance y fecha de publicación, no por el contador de un encargo. El contador de rondas aceptadas se calcula en todo el alcance. El bloqueo heredado y la fila de solicitud serializan recepción/cambio, decisiones y versiones. La ronda se consume en la misma transacción que su autorización; el reintento no la consume otra vez.

`review_can_submit` requiere encargo vigente sin avance pendiente y, si ya hubo publicación, instrucción accepted sobre la última publicada de ese encargo. Una corrección interna todavía puede reemplazar un avance rechazado, pero publicar una nueva versión vuelve a cerrar el permiso de envío hasta otra ronda autorizada. La versión anterior nunca se sobrescribe. La nueva versión queda privada hasta revisión/publicación de DV.

`read.work.items.response` solo llega a equipo y cliente. El colaborador recibe únicamente `revisionInstruction` de una decisión accepted; no recibe foco, nota ni recepción del cliente. Los avisos solo comunican estados, mantienen audiencias y mail_state=suppressed. No se crean jobs de IA. Tabla/helper nuevos y RPC se aplicaron únicamente a `portal_h10_disposable`, con verificación del contrato previamente aplicado. No hubo reset, cambios de credenciales o grants a personas. Borradores existentes conservaron su hash.

`workflow-ui` añade decisiones y revisión en cada entrega, controles de confirmación, estados y recuperación idempotente. `service-journey` provee la ayuda opcional compartida con `improvements-ui`; `service-model.describeNeed` compone solo texto escrito y opciones seleccionadas, sin inferencias ni IA. El contexto se guarda dentro de la instantánea de necesidad existente, evitando una segunda fuente de verdad. Los borradores de ayuda usan los mecanismos previos: sesión ligada a Auth/environment para requests, ensayo sintético separado para human. No implica persistencia remota antes de enviar.

La propuesta SQL no se ejecuta automáticamente. Backups selectivos y baseline en el paquete padre `client-reception-20261026/before`. Para rollback local, restaurar UI/función previa de ese baseline tras revisión y conservar la tabla de respuestas para no destruir evidencia. No se ejecutó rollback ni eliminación. No existe cambio de producción que revertir.
# Archivos de entrega y próxima extensión de perfiles — 2026-10-26

## Implementado solo en laboratorio

`h12-delivery-files.sql` incorpora `portal_delivery_file`: ID idempotente, entrega, autor, nombre, MIME, bytes privados, SHA-256 y fecha. RLS, sin acceso directo de public/anon/authenticated. La RPC `portal_delivery_file_v1` reutiliza la lectura autorizada de workflow y sus bloqueos de identidad/solicitud antes de leer o repetir una carga. El autor puede añadir archivos solo a su avance submitted del encargo vigente. El equipo autorizado puede descargarlos para revisión; el cliente solo recibe metadata/bytes de entregas publicadas. Retirar el encargo elimina acceso del colaborador sin borrar la entrega histórica del cliente.

Almacenamiento binario acotado en PostgreSQL local, siguiendo el adaptador previo de activos de marca. No constituye el diseño final de Storage alojado. Límites del ensayo: 4 MiB/archivo, 3/versión, 48 MiB/solicitud; formatos PDF/PNG/JPEG con nombre, extensión, MIME, firma y base64 canónico validados. La firma no prueba ausencia de malware. Antes de una activación externa se requiere cuarentena/escaneo, almacenamiento privado, retención/cuotas, descarga autorizada y registro de auditoría adecuado. No se crearon buckets públicos ni URLs de acceso persistentes.

Los archivos son append-only por RPC. Cada carga aumenta la revisión de solicitud. `delivery_review` exige revisión actual y el array exacto ordenado de IDs revisados, además de can_publish y confirmación. Los bloqueos serializan subida/publicación: o se incorpora el archivo y queda obsoleta la revisión, o se publica y se rechaza la carga. Los reintentos comparan ID/autor/entrega/nombre/MIME/hash; reutilizar una clave con contenido distinto falla. La UI conserva la intención pendiente con solicitud y encargo; no guarda bytes o tokens en almacenamiento persistente del navegador.

Las descargas pasan por Auth en cada petición, comprueban SHA-256 en cliente y usan un Blob application/octet-stream con nombre de descarga; no incrustan PDF/HTML ni previsualizan contenido no confiable. Una descarga ya realizada no puede revocarse del dispositivo. El proxy loopback admite hasta 6 MB solo en las RPC de archivos; el resto mantiene su límite. El permiso de RPC es para el rol autenticado con autorización interna, no un grant a personas.

Orden del ensayo aditivo: tabla/RPC de archivos y sustitución de workflow desde baseline verificado en una transacción local. Los contratos completos de proposals no son migraciones automáticas para producción. Para instalación limpia por revisión, crear la tabla de archivos antes de ejecutar las lecturas de workflow que la referencian. Sin reset/reseed ni cambios a borradores existentes. Rollback propuesto: deshabilitar UI/RPC nueva y restaurar función previa desde baseline, conservando archivos/evidencia; no ejecutar borrados.

## Propuesta no implementada: perfiles de equipo/colaboradores

Extender la identidad existente con un perfil profesional común y audiencias separadas, sin duplicar Auth. Separar contenido privado de versión publicable/aprobada. Un proyecto de portafolio referencia piezas y permisos propios; no da acceso a portal_delivery_file ni hereda derechos de una entrega privada. Reutilizar patrones de carga/revisión, no los mismos objetos/ACL.

Modelos candidatos para el siguiente corte: perfil profesional, especialidades/habilidades, proyecto de portafolio y sus piezas autorizadas, versión de ficha visible al cliente, participación de persona en solicitud con función/responsabilidad, y recomendación humana con motivo y disponibilidad confirmada. Mantener el responsable de Don Ventas y una conversación principal. La actual restricción de un encargo activo por alcance permanece; admitir varias personas requiere revisar ese contrato explícitamente, no crear asignaciones paralelas por la UI.

Recomendaciones visibles solo a clientes autorizados de esa solicitud. Consultar una ficha no otorga acceso al expediente. Aceptar una preferencia de cliente no concede permisos ni contacta a terceros automáticamente. La liberación de contexto sigue ligada al encargo/alcance vigente y a una decisión del equipo. No se aplicaron tablas, grants o publicación de perfiles en este corte.

# Presentación simplificada conectada — 2026-10-26

`DVWorkflowUI.overview` deriva etiquetas/CTA únicamente del estado y capacidades devueltos por read: alcance vigente, publicaciones visibles, respuesta autorizada, canReview y canSubmit. No crea estados persistidos ni autoridad nueva. Los casos legacy sin work llevan a conversación; una revisión autorizada al colaborador conserva prioridad sobre su publicación anterior sin revelar notas privadas del cliente. No se modifica SQL ni las RPC.

La organización del expediente mueve nodos de formularios existentes dentro de disclosures nativos. La conversación conserva sus inputs y buffers; las acciones siguen pasando por guards, RPC, versión esperada e idempotencia previos. El CTA abre/focaliza su sección; no envía, acepta ni publica. La UI mantiene estado de apertura por solicitud en memoria; no promete conservarlo al cerrar sesión. El estado remoto y las versiones sí se recuperan con nuevas sesiones.

El panel consulta hasta seis solicitudes abiertas de la página autorizada, deriva estados con la misma función y muestra tres, priorizando decisiones conocidas. Es una selección acotada; la bandeja conserva paginación. No requiere agregados nuevos de BD, cron, matching, correo o IA. Si falla una lectura de detalle, la tarjeta conserva acceso y evita inventar estado. Mi panel explícito cambia la vista sin borrar la necesidad guardada ni descartar una operación pendiente.

Rollback propuesto: restaurar únicamente archivos de presentación de before/ en el paquete simplified-connected-20261026, preservando trabajo previo. No se ejecutó rollback, migración, commit/merge o despliegue. Los hashes de SQL, backlog y vercel.json permanecieron iguales al baseline.

## Perfiles profesionales: implementación local por versión y solicitud

Nueva propuesta aditiva `supabase/proposals/h12-professional-profiles.sql`. Tablas separadas `portal_professional_profile` (borrador, datos privados, revisión y snapshot autorizado), `portal_portfolio_file` (archivo inmutable de su autor, tipo/hash/bytes acotados) y `portal_profile_share` (solicitud/persona/versión/revisor/fecha). RLS habilitada y sin grants de tabla para anon/authenticated. El único contrato público es `portal_professional_v1`, ejecutable por authenticated, con identidad verificada y permisos vivos en servidor. No sustituye ni altera los contratos de borradores, solicitudes o entregas privadas existentes.

`own/save/upload/authorize/withdraw` requieren profesional activo verificado (suscripción o grant vigente de equipo). Save/authorize/withdraw usan revisión esperada; upload es idempotente por UUID y contenido exacto. La autorización copia exclusivamente la ficha pública y los IDs de muestras elegidas, nunca private_data. Lista blanca de campos, longitudes, seis proyectos, archivos propios, tipos/extensión/firma/base64 canónicos y cuota de doce archivos. Solo almacenamiento binario de laboratorio; no acredita antimalware, políticas de retención ni infraestructura alojada.

`list/share/unshare/download` revalidan acceso a la solicitud y participación vigente: responsable con grant activo o encargo aceptado vigente. Compartir requiere equipo con can_publish, versión exacta y confirmación de revisión. El titular cliente solo ve shares cuya versión coincide con la autorización actual; el equipo accede a las versiones autorizadas para revisar. Descargar exige muestra incluida en el snapshot y ese mismo permiso. El dueño puede descargar sus archivos privados. Identidad y fila de solicitud usan los mismos bloqueos del laboratorio, evitando carreras entre revocación, autorización y compartición. Ver un perfil no concede acceso al trabajo ni cambia asignaciones.

UI: `professional-ui.js` usa la conexión protegida de workflow, marca Don Ventas y controles semánticos de apariencia. Solo se añade una entrada «Mi perfil profesional» al espacio de profesionales y un bloque plegado «Quién trabaja contigo» en solicitudes del cliente/equipo. Archivos descargados como octet-stream tras comprobar SHA-256; ningún contenido ejecutable se inserta. Caché de edición ligada a sesión Auth exacta + fingerprint, con invalidación en logout/cambio de identidad, y comprobación de vigencia de la vista antes/después de llamadas y digest. Las respuestas tardías no vuelven a pintar ni persistir una ficha desmontada.

La migración se aplicó únicamente en `portal_h10_disposable`, comprobando nombre de base y recibo previo. Hubo recuperación del arranque del contenedor local: se preservó el anterior y una imagen local, y se arrancaron sus datos existentes sin initdb, manteniendo la red interna, IP y proveedores de ensayo. No hubo reset/reseed ni cambio de credenciales. El detalle y rollback están en el paquete de evidencia del workspace padre.

Rollback del corte: retirar la entrada local y restaurar únicamente los archivos del baseline de este corte con revisión; conservar las tablas y archivos privados para no perder trabajo. No ejecutar DROP ni eliminar contenedores/copias como parte del cierre. Desactivación alojada, migración de producción y limpieza de almacenamiento quedan fuera de esta autorización.

## Extensión local: fotos y galerías privadas

Se amplía el mismo snapshot con `photoId` opcional y `projects[].gallery` (hasta cuatro referencias propias, distintas dentro de cada galería, con caption de hasta 300 caracteres). No se añaden tablas ni una vía de acceso pública. Guardar/autorizar valida pertenencia, MIME y dimensiones de los archivos. Se conserva el archivo descargable previo de cada proyecto.

`h12-portfolio-images.sql` añade el helper privado `auth_dv.portfolio_image_size`: verifica cabeceras PNG/JPEG, segmentos JPEG y dimensiones de hasta 4096 px por lado / 8.388.608 píxeles. No es un decodificador completo ni un antivirus. El contrato `portal_professional_v1` incorpora `preview` con el mismo control vivo de download: autor, participación vigente, snapshot autorizado y versión compartida para esa solicitud. PDF nunca es una imagen de galería. La aplicación quedó limitada a `portal_h10_disposable`, comprobando base y función previa antes de sustituirla.

`professional-media.js` valida dimensiones antes de decodificar (entrada hasta 8192 px/lado y 16 MP), recodifica mediante canvas a un máximo de 1600 px de lado largo y sube ese resultado. El ensayo verificó eliminación de EXIF/text metadata de los fixtures por esta vía. Una carga directa a la RPC no pasa por esa normalización: no afirmar eliminación universal de metadatos en servidor.

Las miniaturas se solicitan al aproximarse al viewport, verifican hash, decodifican y usan blobs efímeros. Se revalida la autorización al ampliar; el diálogo nativo conserva foco/Escape. Los callbacks revisan sesión y montaje tras cada operación asíncrona. Desmontaje/logout revoca blobs y desconecta observadores. Una miniatura ya vista puede persistir hasta refrescar tras una revocación externa; una ampliación nueva queda denegada. No se puede retirar una copia ya entregada.

El servidor de revisión loopback permite `blob:` únicamente en img-src; frame/object siguen bloqueados. No se cambia la política de despliegues. Los puertos locales de revisión se reiniciaron para servir esa cabecera. No hay URLs públicas ni caché persistente de imágenes. UI común para equipo/colaborador, sin nueva navegación obligatoria.

Verificación y rollback selectivo: paquete padre `profile-galleries-20261026/`, baseline `before/`. Restaurar UI y función previa solo tras revisión si se solicita rollback; conservar datos y helper aditivo, sin DROP. No ejecutar las propuestas como migración alojada. Las pruebas no certifican almacenamiento productivo, retención ni análisis de malware.

## Disponibilidad y recomendaciones — corte aislado 2026-10-27

`h12-recommendations.sql` propone tablas RLS sin grants directos: `portal_recommendation` por solicitud/versión de alcance/persona, y `portal_recommendation_preference` por solicitud/alcance. RPC `portal_recommendation_v1`: inbox/list/ask/reply/offer/prefer/confirm/withdraw. Revalida identidad, permisos vivos y alcance aceptado. Las mutaciones comparten bloqueo de identidad y fila de solicitud con los contratos anteriores; usan revisiones esperadas. Ask conserva el UUID de intento y rechaza reuso con otro contenido. Confirm reutiliza work_assign existente, sin alterar su contrato ni la aceptación separada del encargo.

La preferencia conserva revisión de recomendación y exige la versión de alcance que vio el cliente. Así, una reoferta o cambio de perfil no transforma un clic tardío en aprobación silenciosa de otra versión. Confirm exige revisión de solicitud, recomendación y preferencia. El indicador fulfilled comprueba encargo invitado/aceptado no expirado; los encargos revocados no ocultan la siguiente confirmación. No se asigna acceso por leer un perfil o marcar disponibilidad.

Helpers privados comprueban vigencia y visibilidad por solicitud. Solo preview/download de `portal_professional_v1` se amplían para revisar o ver la recomendación autorizada exacta; conservan validación de archivo incluido en snapshot y versión. La bandeja personal contiene resumen acotado, fecha y respuesta; no expone el contexto completo del cliente. Hasta tres ofertas vigentes, consulta hasta catorce días, fecha de avance dentro del alcance. Las muestras siguen privadas; retirada de autorización bloquea nuevas lecturas, sin poder recuperar copias ya entregadas.

`professional-space.js/css` compone los formularios existentes sin duplicar estado. `recommendations.js` usa la conexión Auth protegida de workflow y chequea identidad/montaje antes de pintar respuestas. El editor mantiene controles ocultos montados para conservar texto entre secciones. El cliente usa destinos existentes (marca y solicitud) y accesos semánticos a sus secciones; no se crean vistas de personas o entregas con permisos independientes. Claro/oscuro usan los tokens vigentes; controles nativos, teclado y reduced-motion conservan significado.

Aplicación exclusivamente a `portal_h10_disposable` mediante verificación de nombre y comparación exacta del cuerpo previo de las RPC. No reset, DROP ni migración alojada. No cambia el SQL de workflow/archivos finales, la configuración de despliegue ni el backlog. No se activan pagos, trabajadores IA ni correo real. Capacidad alojada, retención/limpieza de archivos y calendario global quedan fuera de este corte.

Rollback: revisar y restaurar selectivamente la presentación y RPC previas del before/ del paquete padre; conservar las tablas aditivas y las solicitudes para no perder datos. No copiar un checkout completo ni ejecutar las propuestas en producción. Los recibos de pruebas y hashes del paquete identifican el estado local revisado; no equivalen a certificación de producción.
# Estado arquitectónico para el cierre local H1.2 — 2026-10-27

Esta consolidación prevalece sobre descripciones históricas de recortes aún no conectados. La autoridad y alcance de producto están en la sección de cierre actual de `PRD.md`. La arquitectura es candidata para el laboratorio `portal_h10_disposable`; propuestas SQL no son migraciones alojadas ni autorización para aplicarlas.

## Trayecto y límites de confianza

Cliente autenticado conserva borrador privado y envía necesidad con consentimiento; una instantánea seleccionada entra al workflow de solicitud. Equipo autorizado propone una versión de alcance con capacidad/fecha, y el cliente acepta esa versión. Con alcance aceptado, el equipo consulta disponibilidad con un resumen mínimo, revisa perfil autorizado y recomienda; la preferencia del cliente no concede acceso. La confirmación del equipo crea el encargo y la aceptación expresa del colaborador habilita únicamente el contexto correspondiente.

El colaborador prepara versiones y archivos privados; el equipo con capacidad de publicar revisa la versión y la lista de archivos, y el cliente solo consulta o descarga lo publicado. La recepción o instrucción de ajustes se vincula a la versión entregada; una versión nueva no sobrescribe la anterior. Perfil propio, snapshot autorizado, revisión de Don Ventas y share por solicitud son permisos distintos. La retirada bloquea consultas nuevas; no retira copias descargadas.

Un único encargo invitado/aceptado vigente por alcance es el límite actual. Varios miembros simultáneos, reparto y sustitución requieren revisar modelo, reglas, concurrencia, auditoría y UX en un alcance posterior. Una preferencia o vista del perfil no equivale a asignación ni consentimiento contractual.

## Integración y operación

Las piezas actuales incluyen borradores, `portal_workflow_v1`, archivos de entrega, perfiles/galerías y recomendaciones, más interfaces y pruebas. Los scripts en `supabase/proposals/` y el servidor/proveedores loopback son artefactos de laboratorio: una integración de código no aplica esquemas ni habilita producción. El almacenamiento binario de laboratorio no certifica Storage alojado, malware, retención, cuotas o recuperación.

El envío real de correo y el análisis AVOS/MCP siguen desactivados; el escenario de ensayo usa avisos suprimidos y no crea trabajos de IA. Pagos no forman parte del corte. La autorización en servidor, controles de sesión, revisión esperada e idempotencia deben comprobarse nuevamente sobre el conjunto consolidado con actores y cuentas distintos.

Para preparar un PR: inventariar y seleccionar cambios del WIP preservado, comparar con `main`, establecer orden y precondiciones de propuestas de BD para un ensayo limpio posterior, revisar que la configuración de despliegue siga bloqueando la rama y cualquier merge no provoque release, y ejecutar las comprobaciones/CI pertinentes. No se ejecutan migraciones alojadas. El PR y la integración requieren autorización separada; una liberación necesitará además un paquete de migración, respaldo/rollback y seguridad explícitamente aprobado.

Pendiente para cierre técnico: regresión integral incluyendo una ronda completa de ajustes y segunda versión, matriz negativa de permisos/aislamiento, conflictos/reintentos, revocación y caducidad, revisión de archivos/perfiles y revisión independiente del diff final. El reporte del workspace padre identifica pruebas ya realizadas, supuestos, límites y diferencias de integración; los 39 flujos no cambian de estado alojado.
