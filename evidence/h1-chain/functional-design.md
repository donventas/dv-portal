# H1 · diseño funcional para revisión

Mandato 2026-10-25: ejecutar bases técnicas → diseño → DEMO → preparación de despliegue.
Repositorio Portal, misma rama/PR #6. Referencia Runtime 83cbc318 para alcance;
marca Don Ventas confirmada por Arturo, identidad existente conservada. Brand Profile
v1.4 consultado en Runtime f01d471: declaración de uso interno supervisado, sin elevar
su estado a aprobación productiva. La revisión aplica roles canónicos 2.0 y fuentes locales; derivación y referencias en brand-and-form.md.

## Recorrido y contratos

1. Tu marca: selección múltiple con contexto por opción, profundización opcional con base/origen, y resumen manual de oferta, audiencia y objetivo. Canales, tono y restricciones opcionales.
2. Confirmación: fuente manual, fecha, versión e historial; contexto operativo pending_sync
   respecto del canon de marca. Actualizar contexto no reescribe piezas ni encargos existentes.
3. Ficha: titular, destinatario, problema, valor, evidencia, condiciones y CTA. Edición manual
   explícita; «sin evidencia aportada» es válido, una prueba inventada no lo es. Comparar
   versiones, exportar y revertir creando otra versión, sin borrar historial.
4. Feedback y ayuda: alcance pieza/campaña/marca, consentimiento explícito; no hay cambios
   globales automáticos. Encargo fija versiones de contexto y ficha. Blog/SEO agregan intención,
   fuentes, autor/revisor, derechos visuales y URL prevista.
5. Bandeja compartida: especialista asignado, propuestas versionadas, contrapropuesta,
   aceptación exacta de alcance, trabajo, entregas, revisión y aceptación exacta de entrega.

Cliente acepta su alcance/entrega. Especialista propone y entrega en su encargo. Admin
supervisa y puede proponer; no sustituye aceptación del cliente. Segundo espacio ficticio
solo accesible al admin en esta demostración. Selector de actores expresa simulación,
no una autoridad de backend. Aceptar alcance, pagar y publicar son decisiones distintas;
las dos últimas no se implementan aquí. Activos propios y entregables se distinguen.

## Estados y recuperación

Cada comando usa versión esperada y clave idempotente por actor/espacio. Conflicto,
fallo simulado y validación preservan el borrador. Cambiar actor/espacio no traslada
borradores. Reintento conserva intención hasta éxito. Contrapropuesta requiere una nueva
propuesta antes de aceptar. Revisión agotada pide nuevo alcance. Cancelar conserva historial.
Persistencia DEMO local, separada por fingerprint; aviso visible de datos sintéticos.
Exportación JSON contiene únicamente el espacio visible de la DEMO.

## Alcance de preparación de release

Esta DEMO prueba interacción y contratos de producto, no implementa H1.2 persistente.
H1.2 requiere almacenamiento privado, Auth/REST reales, contratos de las nuevas entidades,
pruebas de carga y recuperación integrales. Mantener LIVE y comandos nuevos deshabilitados
hasta esa evidencia, aceptación de Arturo y decisión de despliegue. La preparación devuelve una decisión NO-GO para producción. Auth/REST reales se probaron localmente en entorno sintético; no equivalen a validar configuración o datos alojados. La aprobación de esta DEMO sigue pendiente.
