# H1.2 · guardado y recuperación aislados

Contrato candidato `portal-draft-v1`. Alcance aprobado por Arturo: base técnica,
permisos y borrador persistente; sin merge ni producción. Continúan pendientes
envío, consentimiento de solicitud, revisión, encargos y entregas.

## Autoridad y persistencia

| Actor | Leer borrador / historial | Guardar |
| --- | --- | --- |
| Propietario activo y confirmado de la cuenta activa | Su cuenta | Su cuenta |
| Miembro, analista, administrador | No admitido en este incremento | No |
| Anónimo, pendiente, revocado, sesión caducada/cerrada | No | No |

La cuenta y el actor proceden de Auth y `app_user`, nunca del formulario. El
contrato reutiliza la comprobación de identidad/sesión real y el bloqueo del
contrato de aprovisionamiento H1.0. Restaurar acceso requiere iniciar sesión de
nuevo. No se implementa transferencia de cuenta ni alta de administradores.

Un borrador actual por cuenta en `portal_brand_draft`; cada guardado genera una
revisión inmutable en `portal_brand_draft_revision` con actor, fecha, versión y
clave de operación. Tablas con RLS activado, sin grants directos al cliente. Cinco
RPC admitidas a `authenticated`; todas verifican nuevamente autoridad. Las
funciones tienen search_path explícito y permisos PUBLIC/anon revocados.

`save(key, expectedVersion, document)` verifica la versión antes de escribir.
Misma clave, mismo actor, misma versión esperada y mismo documento devuelven el
recibo original; reutilizarla con otro contenido falla. Borrador e historial se
escriben en una transacción. La revocación también se comprueba antes de un replay.

## Documento y experiencia

Documento: `{schema:1, stage:'marca'|'identidad'|'contexto'|'panel', fields:{...}}`. Admite respuestas
incompletas; no recorta espacios ni saltos de línea. Conserva booleanos y contexto
de opciones desmarcadas, además de fuentes y bases declaradas. Es un borrador;
guardarlo no equivale a confirmar respuestas, enviar una solicitud o dar
consentimiento. Los campos admitidos proceden del cuestionario H1.1 y el kit opcional H1.2; esquema
cliente y SQL se cotejan mediante prueba.

Límites por campo: 500 caracteres para los cuatro resúmenes principales, 2000
para canales/tono/restricciones, 1500 para contexto de opciones e insights y 300
para referencias. Bases: hypothesis/observed/pending. Backend además limita el
documento serializado a 100000 bytes. Rechazo sin truncamiento ni escritura parcial.

Guardar es explícito. Mientras está pendiente se bloquea edición. Si se pierde
la respuesta, se conserva en memoria la intención exacta y solo se permite
reintentarla, evitando que una edición cambie el significado del mismo intento.
Ante conflicto se conserva texto local, se explica el problema y se ofrece una
carga explícita que descarta esos cambios. No hay sobrescritura automática.

El borrador guardado vive en BD. Texto no guardado e intención de reintento viven
solo en memoria, con aviso antes de recargar/salir del documento; no se promete
recuperarlos después de cerrar sesión o recargar. Una nueva sesión recupera la
última versión confirmada del servidor.

Cerrar sesión, cambiar identidad/sesión o recibir rechazo Auth autoritativo
limpia documento y Store. Recuperar foco con la misma identidad y session_id no
borra cambios. Un fallo de transporte mantiene el texto para reintentar.

## Lecturas y límites

El arranque H1.2 obtiene solo el actor y cuenta autorizados mediante `open`; no
usa la hidratación general del Portal ni muestra rutas de producto aún pendientes.
El historial pagina de 20 en 20 por versión inmutable, fijando techo al iniciar
la lectura. Los nuevos guardados quedan fuera de ese recorrido hasta recargar.
Esto atiende DATA-01 para este flujo; la hidratación general sigue en backlog.

Se reutilizan tokens, fuentes, activos, estilos e interacciones aceptados en
H1.1. El formulario aislado conecta las dos primeras etapas. Las siguientes
permanecen explícitamente pendientes; la DEMO original conserva sus cinco etapas.

## Admisión y reproducción

La configuración normal no habilita H1.2. Requiere SANDBOX, LOCAL, host exacto
127.0.0.1, endpoint del mismo origen y `h12Drafts: isolated-v1`. El servidor de
ensayo solo comunica con Auth/REST loopback fijos; sirve el SDK local verificado
por SRI, sin CDN ni correos externos. No hay credenciales privilegiadas en cliente.

SQL permanece en `supabase/proposals/h12-drafts.sql`; no hay migración automática.
Preparador: `setup-identity-lab.cjs --authorized-local-identity --h12`, una vez en
copia nueva, con la máquina del Portal y respaldo privado existentes. Restaura
en red interna sin API pública, sanea datos y aplica candidatos antes de iniciar
Auth/REST. No ejecutar sobre una base usada ni extrapolarlo a un destino remoto.

Con Node 24.19.0 y dependencias fijadas: ejecutar `h12-provider.cjs
--authorized-local-h12` y después `h12-browser.cjs --authorized-local-h12` dentro
de `supabase/tests`. El segundo usa Edge local si H10_BROWSER_PATH está definido.
Los fixtures administrativos son exclusivos de pruebas sintéticas; no sustituyen
aprovisionamiento de usuarios reales. El harness de navegador usa login de
contraseña sintético para preparar sesiones; no certifica entrega SMTP ni el
recorrido magiclink alojado.

`vercel.json` bloquea main, codex/portal-h1-hardening y codex/portal-h12-drafts;
una prueba exige ese mapa exacto. No se afirma bloqueo de despliegues manuales
ni de otras ramas. Ninguna autorización de publicación acompaña este contrato.

## Bienvenida opcional y panel — 2026-10-26

Mandato adicional: toda la bienvenida puede omitirse, incluso vacía; dividir el
formulario para reducir scroll y recuperar después lo ya respondido. Cuatro
bloques: negocio, objetivo, clientes e identidad; Profundizar es independiente.
El panel permite entrar a cualquiera sin orden obligatorio ni porcentaje exigido.
Sus estados son Sin empezar, Con información guardada y Cambios sin guardar.
No equivalen a completitud, aprobación ni envío.

Guardar respuestas, Guardar y continuar y Guardar y salir usan el mismo contrato
idempotente con versión esperada. Conservan campos exactos y posición de retorno.
Omitir por ahora navega al panel sin escribir; si hay cambios, ofrece guardarlos
sin bloquear la salida. En esa sesión puede retomarse el texto local; al cerrar
sesión o recargar solo se recupera la última versión confirmada. Navegar durante
un guardado pendiente no altera su intención ni fuerza volver a la bienvenida.
La apariencia no recrea campos ni modifica selección, texto o desplazamiento.

Identidad opcional: estado declarado, colores HEX/descripción/selector, fuentes,
contexto y cuatro referencias a archivos (principal, claro, oscuro y manual).
El selector de colores no rellena por defecto los campos vacíos. La identidad
del cliente no cambia los tokens ni la marca de la interfaz del Portal.

## Archivos privados — alcance aislado PROD-16

portal_brand_asset guarda bytes inmutables con cuenta/actor/UUID/fecha/nombre/tipo.
RLS sin grants directos a anon/authenticated; put/get revalidan el owner activo
mediante el mismo lock de identidad. Put reintenta por UUID y exige los mismos
bytes/metadatos/actor. Save comprueba cuenta y tipo de cada referencia de archivo.
Una cuenta no puede leer ni adjuntar archivos ajenos. No hay bucket ni URL pública.

Logos PNG/JPEG de hasta 1 MiB; manual PDF de hasta 4 MiB. Nombre hasta 120 caracteres
sin controles. Se validan tamaño y firmas, no estructura completa ni malware.
No SVG/HTML, render de PDF ni ejecución de contenido. El PDF se descarga como
octet-stream con nombre generado por UUID; las imágenes se presentan con img.
Límite32 archivos/16 MiB por cuenta, incluido material de revisiones anteriores.
La cuota y las escrituras se serializan con el lock de identidad.

Subir guarda bytes; Guardar respuestas asocia la referencia al borrador. Una
subida de resultado incierto retiene la misma intención en memoria para reintentar
sin duplicar. Se permite ir al panel; la edición sigue bloqueada hasta reconciliar.
Quitar o reemplazar modifica la referencia del borrador al guardar y no altera
revisiones anteriores. Purga de huérfanos, ciclo de retención, análisis de archivos,
Storage alojado y admisión operativa siguen pendientes antes de publicar PROD-16.
Esta tabla local es candidato de prueba, no autorización de migración alojada.
