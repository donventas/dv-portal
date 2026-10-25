# H1.1 — apariencia y responsividad del Portal

Fecha: 2026-10-25. Implementación local preparada para aceptación visual de Arturo.
**No constituye cierre de aceptación humana, release alojado ni operación H1.2.**
Los flujos operativos conservan su estado pendiente en el [backlog](../operational-backlog.md).

## Revisión editorial 02 — contraste y personalidad

Arturo señala que la primera integración `956dcc5` resulta demasiado uniforme y
solicita mayor contraste y recuperar la personalidad tomando como referencia el
merge del sistema de marca. No se acepta esa versión como cierre visual de H1.1.
La revisión actual adapta el piloto operativo/editorial y la composición aprobada
de Runtime PR #75, commit `f8a764b`, no solo sus tokens. Fuente leída y hashes en
`source-receipt.json#editorialAdaptation`; Runtime conserva su checkout intacto.

Adaptación `PORTAL-H11-EDITORIAL-02`: folio mono, título dominante con énfasis azul,
una nota tinta con pregunta útil antes de la pieza, formulario en superficie propia,
navegación activa de relleno sólido y selección con borde interior. En móvil la
nota fluye debajo del título sin recortes ni ocultar el contenido. Papel/blanco
separan estructura y trabajo; oscuro conserva la misma jerarquía. Textos secundarios
y líneas usan los valores del contexto editorial de Runtime. No se cambian tokens
importados ni geometría de activos; no se crean fotografías ni ilustraciones.

Consumidores: cabecera/navegación y roles de texto globales del Portal; apertura y
cinco etapas de la DEMO; acceso y administración incluidos en regresión. Las áreas
de escritura conservan contenido y comportamiento. El nuevo aside no contiene
marcas/iconos dependientes del adaptador de tema. Formularios sobre superficies de
trabajo y un solo campo tinta expresivo, sin repetir el recurso en cada pregunta.

Validación actual: `verify:all`, 256 Node y 17 navegador aprobados; 272 combinaciones
de ruta/tema/ancho. Se amplía contraste a 16 parejas por tema (32 comprobaciones de
texto, todas ≥4.5:1), incluidos nota tinta, título/énfasis, texto secundario, folio,
opciones y navegación. Bordes de los dos controles representativos ≥3:1. No es
certificación integral WCAG. Diez capturas regeneradas y revisadas individualmente
y como familia. Revisión independiente de solo lectura cerrada sin bloqueantes.
El aparente recorte de una línea de la nota en la captura general se descartó con
captura cercana y comprobación de caja de texto. Se regeneró la evidencia móvil
con el textarea contextual completo en pantalla. Aceptación humana pendiente.

## Interacciones 03 — formulario, botones y navegación

Mandato de Arturo: aplicar la propuesta de hover, respuesta al toque/teclado y
movimiento breve en ambos temas y móvil, sin producción. Base `be73433`, checkout
limpio, misma rama/PR; fuentes y ruta BSB de las revisiones anteriores conservadas.
Cambios limitados a `app/appearance.css`, presentación/ARIA del formulario en
`app/hybrid-demo-ui.js` y pruebas en `tests/browser/appearance.spec.js`.

- Hover de puntero preciso refuerza borde/fondo y línea azul, sin seleccionar ni
  revelar datos. Selección conserva checkbox y borde lateral; foco funciona con teclado.
- Botones primarios cambian a su tono semántico hover; flecha decorativa solo en
  confirmar contexto, guardar ficha y crear solicitud. Movimiento 160 ms, 3 px en
  flecha y respuesta de pulsación de 1 px. Colores cambian inmediatamente para no
  introducir contraste transitorio al alternar Claro/Oscuro.
- Contexto y desplegables tienen entrada de 160 ms sin cambiar alturas mediante
  límites artificiales ni borrar texto. Checkbox anuncia contenedor y expansión.
- Toque funciona sin hover; se neutralizan desplazamiento y halo heredados tras
  tap. Movimiento reducido elimina animaciones, transiciones y desplazamientos,
  manteniendo color, estado y foco. Botones deshabilitados conservan apariencia
  inactiva también antes/después de hover; sin señales de acción falsas.

Verificación: 256 pruebas Node aprobadas; suite de navegador ampliada a 19 casos,
incluidos hover/selección, Space, pulsación, conservación del contexto, botones
deshabilitados, contraste de CTA hovered, móvil táctil simulado y movimiento
reducido. Las capturas de interacción son evidencia local de coordinación en
`evidence/portal-h11-appearance-20261025/` del workspace; las diez capturas estáticas
de este paquete conservan la composición editorial 02, no prueban movimiento.
Revisión independiente sin bloqueantes de implementación; la comprobación táctil
final conserva un botón real durante un tap en el fixture para comprobar el reset
de hover sin que el rerender enmascare el resultado. Estado de QA/CI registrado en
el paquete de coordinación. No dispositivo
físico, auditoría WCAG completa ni aceptación visual humana implícita.

## Mandato, fuente y límites

Arturo declara disponible la variante clara y autoriza integrarla con selector
Claro/Oscuro/Sistema en todo el Portal, ajustes visuales y responsividad, sin
modificar producción. Se conserva la autorización previa de commit/push/PR de
desarrollo. Repositorio editable único: Portal, `donventas/dv-portal`, rama
`codex/portal-h1-hardening`, base `00109ca9c27538056e49f22fae9a337c2ea55f24`,
checkout limpio al inicio, mismo PR #6. Sin merge, migraciones ni despliegue.

Runtime se inspeccionó solo en lectura: entrega `14b6359`, posteriormente integrada
por su propio chat en `f8a764bb3b18b8575c5826c7646953d40031ff34` (PR #75).
[source-receipt.json](source-receipt.json) verifica siete consumidores exactos:
CSS/bootstrap/controlador de apariencia y logos B6/B-S tinta/reverso. No se
modificaron maestros, geometría, fotografías ni el sprite original de iconos.
El adaptador selecciona las variantes tinta/papel del sprite según el fondo.
Los comentarios históricos «candidate» de archivos importados se conservan byte
a byte; la autorización de consumo proviene del mandato de Arturo y el registro
de integración de Runtime. Landing no se editó ni se afirma sincronizado.

BSB: snapshot `60ed1ec1914bb3b5c636f1142d853a1a70aa91fc`, integridad PASS,
actualidad frente a AVOS live no verificada. Se reutiliza la ruta vigente
[web/execute/protected-mark](../h1-chain/bsb-route.json), con nuevo chequeo del
contrato de gobernanza, composición, web y controles de entrega. Ensamblaje de
aplicación derivada, `PRESENTATION_REFINEMENT`; no cambio canónico. Autoridad
creativa: Arturo. Revisión independiente de solo lectura separada del ensamblador.
Sites se usa en modalidad local-only; no registro ni publicación de sitio nuevo.

## Composición y comportamiento

Familia conservada: firma de marca y contexto de cuenta en cabecera, navegación
lateral en escritorio y menú plegable en móvil, lectura central con titulares
Schibsted y folios Space Mono. Papel de página y blanco de trabajo en claro;
negro frío y paneles en oscuro. El formulario sigue siendo el protagonista;
se compactan introducción, espacios entre preguntas y opciones sin reducir los
campos para texto propio. Los avisos de entorno conservan nombre, símbolo y
explicación explícitos en ambos temas.

- Selector nativo etiquetado y disponible en aplicación, acceso y prelanzamiento.
  Preferencia `dv.appearance.v1`, del mismo origen y sin datos personales; escucha
  cambios de sistema solo al elegir Sistema y cambios de otras pestañas.
- Bootstrap anterior al CSS, sin red externa. Si almacenamiento falla, la elección
  funciona en la página actual. Sin JavaScript, CSS sigue al dispositivo y selector
  queda deshabilitado; esto no convierte el resto de la app en una aplicación sin JS.
- El cambio actualiza tokens/activos sin renderizar formularios: conserva contexto,
  selección y texto de modal. No llama Auth ni modifica sesión, cuentas o permisos.
- Bordes esenciales, foco, acciones, estados y controles deshabilitados usan roles
  semánticos. Se retiró la transición de fondo de botones para evitar contraste
  insuficiente durante la alternancia. Los estados mantienen etiquetas textuales.
- Logos e iconos usan variantes exactas, sin filtros ni recoloración. Assets fijos
  de terceros y expediente imprimible mantienen sus fondos propios; el impreso
  continúa como documento de tinta sobre papel, fuera del tema de interfaz.
- Se corrigieron listas de facturación y KPIs que desbordaban en móvil, contexto
  de cabecera largo, ajuste de menú y popovers, campos y botones con texto largo.

## Verificación

Suite `tests/browser/appearance.spec.js` sobre servidor loopback y datos sintéticos:

1. Conservación del nodo/campo editado, texto por opción, preferencia tras reload
   y logout, cambio de sistema, elección explícita y sincronización entre pestañas.
2. Selecciones con contexto visible en Claro/Oscuro, escritorio y móvil.
3. [results.json](results.json): 272 combinaciones de rutas de cliente, miembro,
   analista, administrador y freemium × 320/390/768/1280 × ambos temas, sin
   desbordamiento de documento/contenedor principal ni errores JavaScript.
4. Recorrido en 320/390/640/768/890/980/1024/1280; sus cinco etapas en ambos temas.
   Menú móvil operable y modal real de comentarios: texto conservado al alternar,
   límites visibles y navegación Tab a Cancelar.
5. Reflujo de viewport 640×450, equivalente CSS de 1280×900 al 200 %; **no** se
   operó ni certificó zoom nativo del navegador. No se declara prueba de ampliación
   de toda la tipografía por cambiar un font-size heredado.
6. Contraste computado de 16 parejas representativas por tema: selector,
   campo de nombre, botón primario y los nuevos contextos editoriales; texto ≥4.5:1,
   borde esencial de los dos controles representativos ≥3:1.
   No es un barrido de todos los textos ni certificación integral WCAG.
7. BLOCKED/prelanzamiento, almacenamiento denegado y fallback sin JavaScript.

Regresión: 256 pruebas Node, 17 pruebas de navegador y validadores
paths/bundle/secrets; se corrige la expectativa histórica de logo oscuro para
declarar expresamente su tema. Los flujos versionados y el contrato de ambiente
se conservan. No se reabrió el laboratorio de BD/Auth ni se repitieron sus suites;
no hay cambios en SQL, dispatcher, contratos de identidad ni configuración de release.

Capturas revisadas individualmente y como familia:
[claro escritorio](light-1280.png), [oscuro escritorio](dark-1280.png),
[claro móvil](light-390.png), [oscuro móvil](dark-390.png),
[formulario claro](form-light-1280.png), [formulario oscuro](form-dark-1280.png),
[formulario claro móvil](form-light-390.png), [formulario oscuro móvil](form-dark-390.png),
[administración](admin-light.png) y [acceso](access-light.png).

Límites: Edge/Chromium local y Chromium de CI; Safari/Firefox, dispositivos físicos,
zoom nativo, métricas de campo y auditoría completa de accesibilidad no probados.
Los originales de marca y tokens nuevos suman una carga acotada; no se agregan
dependencias, fuentes remotas, imágenes raster de producto ni servicios de terceros.

## Estado de cierre y recuperación

Implementación visual y QA técnica local: preparadas para revisión de Arturo.
Revisión independiente: bordes/foco y contraste del interruptor corregidos; sin
bloqueantes adicionales observados en el diff y capturas dentro de su alcance.
La aceptación visual del Portal integrado permanece pendiente y no se hereda de
la aprobación del sistema de marca. No se declara H1.2 ni preparación productiva.

Preview de revisión: http://127.0.0.1:8011/ (servidor DEMO preexistente, no iniciado
ni detenido por esta ronda). Servidor de pruebas 8002 temporal cerrado por Playwright.
Rollback: revertir el commit de esta integración mediante cambio revisado; no
reset/clean, no datos de BD que recuperar. Retirar el consumo derivado no modifica
los maestros Runtime. Próxima decisión humana: aceptar o señalar ajustes de la
DEMO en ambos temas para registrar el cierre de diseño H1.1.
