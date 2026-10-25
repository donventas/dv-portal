# H1.1 — apariencia y responsividad del Portal

Fecha: 2026-10-25. Implementación local preparada para aceptación visual de Arturo.
**No constituye cierre de aceptación humana, release alojado ni operación H1.2.**
Los flujos operativos conservan su estado pendiente en el [backlog](../operational-backlog.md).

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
6. Contraste computado de tres parejas representativas por tema: selector,
   campo de nombre y botón primario; texto ≥4.5:1, borde esencial de campos ≥3:1.
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
