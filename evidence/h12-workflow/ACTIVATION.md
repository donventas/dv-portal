# H1.2 — siguiente gate de activación

## Qué se puede revisar ahora

El paso 5 del Portal local incorpora envío confirmado, folio, versión y conversación.
La superficie del equipo y colaboradores se prueba con Auth real en el harness
local 55474; aún no sustituye su navegación completa dentro del shell del Portal.
La prueba distingue permisos de lectura, revisión y publicación.

## Punto 4: conexión preparada, análisis real pendiente

El adaptador MCP stdio funciona contra el laboratorio y expone únicamente
`take_request`, `read_request`, `complete_review` y `fail_review`.
La prueba negocia protocolo `2025-06-18` y ejecuta una solicitud por esas herramientas.
El resultado actual procede de `dv-review-simulator-v1`: **no es análisis de IA**.
No se instaló un servidor MCP en la configuración de Codex ni se activó un agente
persistente. AVOS se consultó como método; no se acredita una capacidad instalada
o un servicio autónomo de AVOS por este ensayo.

Antes de activar análisis real se necesita una configuración concreta aprobada:

1. Proveedor y cuenta de ejecución (o sesión supervisada de Codex), modelo,
   método/versiones AVOS que consumirá y presupuesto/límite por ensayo.
2. Destino, retención y acceso a los datos. Primer piloto propuesto: únicamente
   tres solicitudes sintéticas, ejecución manual supervisada, sin adjuntos reales.
3. Identidad propia del trabajador con alcance mínimo. El transporte actual
   usa el administrador del contenedor **solo como harness de pruebas**; no es
   una identidad de servicio admisible para alojamiento o procesamiento real.
4. Aprobar el resultado de una revisión comparada con el equipo antes de
   programar ejecución continua. El modelo nunca recibe herramientas de envío,
   publicación, asignación o concesión de permisos.

Una elección de proveedor no autoriza por sí sola credenciales, instalación,
transferencia de datos reales o consumo abierto. No se solicitan secretos en el chat.

## Correo y colaboradores reales

Los mensajes de prueba solo se capturan en Mailpit, con destinatarios
`synthetic.invalid` y relay/forward ausentes. Antes de correo real: elegir
remitente/dominio, proveedor, destinatarios, custodia de credenciales y aprobar
el envío concreto de validación. Un resultado incierto permanece retenido;
no se reenvía automáticamente. La reconciliación operativa sigue en backlog.

Las asignaciones actuales usan colaboradores sintéticos ya aprovisionados.
Suscripción no concede acceso. La referencia pide consentimiento sobre persona
y contexto exactos antes de que el destinatario conozca la invitación. La
invitación de siete días es una regla del laboratorio, pendiente de aceptación
operativa; no fija SLA ni términos comerciales. No hay altas externas reales.

## Integración y salida

Actualización de diseño 2026-10-26: las vistas de equipo y colaborador ya se
integraron al shell nativo en el laboratorio; el informe del workspace padre
`evidence/h12-scope/portal-ui-20261026/README.md` sustituye la limitación anterior
de acceso solo por harness. El ensayo de servicio humano documentado en
`../h12-service-design/PRD.md` es un prototipo separado, sin nuevas operaciones
persistentes ni cambio a estos gates de activación.

Este corte requiere revisión funcional de Arturo y revisión técnica antes de
preparar una integración Git. No se ha pedido ni realizado commit, push, PR,
merge o despliegue. `main` y la rama H1.2 conservan despliegues automáticos
deshabilitados. Los 39 flujos mantienen estado pendiente para operación alojada.

Fuentes técnicas del adaptador:
[MCP stdio](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports),
[ciclo de vida](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle),
[herramientas](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
[Mailpit API](https://mailpit.axllent.org/docs/api-v1/).
