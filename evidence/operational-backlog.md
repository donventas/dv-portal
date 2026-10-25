# Backlog de flujos operativos del Portal

Corte: 2026-10-25. Mandato de Arturo: dejar pendientes todos los flujos operativos,
indicando a qué corresponden. **Todos los elementos de este documento están
PENDIENTES para operación alojada.** Registrar aquí no autoriza implementarlos,
activar servicios, enviar correos, migrar, hacer merge o desplegar.

Repositorio responsable de esta implementación: `donventas/dv-portal`, rama
`codex/portal-h1-hardening`, PR de desarrollo #6. El inventario corresponde a las
superficies actuales del Portal y sus dependencias conocidas; no pretende
inventariar operaciones internas de otros proyectos. No se ha designado una
persona responsable ni fecha de entrega para cada flujo.

## Lectura y orden propuesto

- **G — habilitación:** resolver antes de admitir el alcance afectado en un
  entorno alojado. LIVE continúa NO_GO; la admisión de sandbox es independiente.
- **P — producto:** definir el alcance de H1.2 y cerrar el flujo antes de ofrecerlo
  como operativo. No es necesario incorporar todas estas funciones al primer release.
- **D — dependencia:** requiere paquete o decisión de otra área; Portal consume
  el resultado sin modificar su fuente canónica.

Este orden es una recomendación técnica, no una prioridad comercial aprobada.
Cerrar un elemento exige evidencia enlazada y actualizar su estado expresamente.
Una prueba aislada o una pantalla DEMO por sí sola no lo cierra. Las operaciones
con escritura deben acreditar autorización por actor/cuenta, persistencia,
auditoría, conflicto/reintento seguro y recuperación, además de su criterio específico.

## Identidad, invitaciones y soporte de acceso

| ID / orden | Corresponde a | Flujo pendiente y criterio de cierre | Avance comprobado |
|---|---|---|---|
| IAM-01 · G | Administración / seguridad | Alta inicial de administradores, enrolamiento MFA, recuperación de factor y acceso de emergencia: procedimiento con responsables, verificación, auditoría y simulacro de recuperación; sin autoasignación de admin. | El laboratorio usa bootstrap confiable y prueba desafío MFA; no hay UI de alta/recuperación de administradores. |
| IAM-02 · G | Identidad / datos heredados | Conciliar usuarios Auth y perfiles por UUID, correos confirmados, duplicados/huérfanos, cuenta y rol: inventario revisado y ensayo de asignaciones sin conceder autoridad por email. | Contrato local de concesión a UUID confirmado, owner único y límite de asientos. |
| IAM-03 · G | Equipo / permisos | Conceder, revocar y restaurar acceso; baja de colaboradores y revocación de sesiones: validar matriz alojada, cambios concurrentes, auditoría y nuevo login tras restaurar. Definir cambio de owner o cuenta antes de ofrecerlo. | UI y contrato probados localmente; no crean admin ni transfieren usuarios entre cuentas. |
| INV-01 · G | Equipo / invitaciones administrativas | Admitir dispatcher en sandbox alojado con origen/configuración exactos, credenciales de servidor, autorización MFA y cuota; demostrar que secretos no llegan al navegador y que invitar no concede acceso. | Dispatcher/UI solo loopback y `synthetic.invalid`; capacidad deshabilitada en release normal. |
| INV-02 · G | Soporte / incidencias de envío | Reconciliar `uncertain`: consultar evidencia del proveedor, conservar intento y recibo originales y registrar resolución auditada mediante contrato/UI. Demostrar que una resolución no duplica el envío. | Ambigüedad retenida y sin reencolado; todavía no existe comando/UI de reconciliación. |
| INV-03 · P | Equipo / ciclo de invitación | Reenvío explícito, enlace expirado, destinatario equivocado y cancelación: definir estados/transiciones y nueva intención solo tras resolver la anterior; probar expiración y mensajes de soporte. | Cancelación solo `queued`; `sent`/`uncertain` bloquean duplicados. Cancelar no revoca un correo ya enviado. |
| INV-04 · P | Miembros / especialistas | Resolver contratos de `member.invite`, `staff.invite`, `member.resend`, `member.remove` y su relación con la nueva administración: límites por rol/cuenta, offboarding y UX consistentes. | Adaptadores legados siguen DEMO-only; nueva UI administrativa local separada. |
| AUTH-01 · G | Acceso / correo transaccional | Configurar SMTP, remitente, plantillas, redirects permitidos y entregabilidad; validar invitación, confirmación y nuevo acceso PKCE, expiración y enlaces usados. | GoTrue y Mailpit locales; callback de invitación verificado y cerrado con alcance local, sin instalar esa sesión en Store. |
| AUTH-02 · G | Sesiones / seguridad | Validación alojada de refresh/logout, varias pestañas, sesión caducada, pérdida de red, JWT manipulado y revocación con actores de prueba separados. | Ensayos locales de identidad e invitaciones; la sesión paralela sobrevive al cierre del callback de invitación. |
| AUTH-03 · D | Acceso / proveedor externo | Decidir si Google OAuth entra al release; si entra, configurar y probar callback, vinculación y restricciones de identidad. Si se difiere, mantenerlo no disponible con estado explícito. | No se ha validado OAuth alojado. |

## Base de datos, seguridad y operación del servicio

| ID / orden | Corresponde a | Flujo pendiente y criterio de cierre | Avance comprobado |
|---|---|---|---|
| DB-01 · G | BD / migración | Preparar migración versionada del esquema real y preflight de políticas, grants, triggers y datos heredados; ensayar aplicación y conflictos en copia fresca. Confirmar alcance de leads 05/06. | Candidatos fuera de `migrations`, aplicados únicamente en copias aisladas; no son receta de ejecución repetida. |
| DB-02 · G | BD / respaldo | Definir custodia, acceso, retención y copia independiente del equipo; actualizar respaldo antes de una ventana autorizada y demostrar recuperación periódica. | Backup real preservado y recuperación aislada de 66/66 tablas; no acredita política operativa remota. |
| DB-03 · G | Recuperación / secretos externos | Verificar portabilidad y recuperación de Vault, claves raíz, configuración Auth/SMTP/OAuth y otros recursos externos; simulacro sin depender del entorno caído. | Restauración de tablas no certifica estos componentes. |
| DB-04 · G | Continuidad / rollback | Plan de congelación de escrituras, preservación de operaciones posteriores y reconciliación; probar reversión de código/BD con criterios para detener o recuperar. | Recuperaciones locales históricas documentadas; sin autorización de rollback remoto. |
| SEC-01 · G | Infraestructura / secretos | Custodia y rotación de credenciales, separación de ambientes, privilegio mínimo, revocación y recuperación; demostrar configuración del destino y ausencia de secretos en cliente/logs. | Credenciales del laboratorio fuera de Git y retiradas al cierre; ninguna clave de servicio en requests del navegador. |
| OPS-01 · G | Soporte / observabilidad | Definir alertas, revisión de fallos de Auth/envío/BD, auditoría consultable, conservación y acceso a logs; runbook con responsable y prueba de incidente. | Recibos y auditoría locales; no hay operación alojada acreditada. |
| DATA-01 · G | Portal / carga de datos | Paginar `hydrate` general sin truncar resultados ni mezclar cuentas; probar volúmenes, cursores, cambios durante lectura y logout/cambio de identidad. | Nuevos directorios de personas/invitaciones paginados; hidratación general pendiente. |
| ENG-01 · G | Desarrollo / CI | Actualizar Node a una versión soportada y verificar dependencias, pruebas y reproducibilidad de desarrollo/CI. | Proyecto todavía fija Node 20; no confundir SDK de navegador con runtime del servidor. |
| REL-01 · G | Release / admisión | Configuración versionada y destino exacto de sandbox; ejecutar matriz con proveedor alojado. Después, revisión final, CI, aceptación humana y autorizaciones separadas de merge/migración/publicación. Smoke y seguimiento con rollback preparado. | Release mapper no habilita los contratos nuevos; PR borrador y despliegue automático de esta rama deshabilitado. |

## Flujos de negocio del Portal

| ID / orden | Corresponde a | Flujo pendiente y criterio de cierre | Superficie actual |
|---|---|---|---|
| PROD-01 · P | Cliente / recorrido de marca H1.2 | Persistir contexto de selección múltiple y texto, versiones, consentimiento, encargos y entregas; recuperar en otra sesión sin pérdida ni fuga entre cuentas. | Recorrido de cinco etapas H1.1 en DEMO; no usa IA en primera etapa. |
| PROD-02 · P | Cuenta / incorporación | Registro, perfil freemium y activación de waitlist: definir datos requeridos, transición de cuenta y permisos; probar alta y recuperación de un intento interrumpido. | `account.register`, `session.profile` DEMO-only; `account.activate` tiene candidato local. |
| PROD-03 · P | Cuenta / plan y capas | Cambio de tipo de cuenta y capas disponibles: contrato de elegibilidad y efectos sobre acceso/cobro, con decisión auditable. | `account.kind`, `account.layers` DEMO-only. |
| PROD-04 · P | Producción / bloques y revisión | Aprobar bloque, registrar ronda y solicitar cambio de alcance: integrar revisiones/versiones exactas y estados de UI con persistencia alojada; resolver alcance antes de continuar trabajo. | `block.approve`, `round.create`, `scope.request` con RPC candidata probada localmente. |
| PROD-05 · P | Especialistas / asignaciones | Asignar, aceptar, rechazar y reasignar trabajo, incluidos vencimientos/barrido: reglas de capacidad y pertenencia, concurrencia y auditoría. | `assignment.update`, `.accept`, `.reject`, `.reassign` DEMO-only. |
| PROD-06 · P | Colaboración / conversación | Guardar chat y aumentar iteraciones: persistencia, alcance por cuenta, límites y trazabilidad de revisión. | `chat.save`, `iteration.bump` DEMO-only. |
| PROD-07 · P | Capacidades / propuestas | Aprobar o descartar propuestas y pasar backlog de capacidades a publicación: revisión y transición versionada con permisos. | `skill.proposal.approve`, `.dismiss`, `skill.backlog.publish` DEMO-only. |
| PROD-08 · P | Capacidades / catálogo publicado | Publicar y revertir una capacidad: versionado, revisión autorizada y recuperación conservando consumidores. | `skill.publish`, `skill.revert` DEMO-only. |
| PROD-09 · P | Finanzas / facturación y cobro | Solicitud de factura y validación de pago: evidencia, estados, conciliación y permisos; definir proveedor y manejo idempotente de efectos externos si entra al alcance. | `invoice.request`, `payment.validate` DEMO-only; la DEMO no abre pagos reales. |
| PROD-10 · P | Finanzas / periodos, costos y precios | Actualizar periodo, costo de equipo y precio de catálogo: vigencia, permisos y trazabilidad de cambios. | `period.update`, `labor.update`, `catalog.update` DEMO-only. |
| PROD-11 · P | Operación / registro de trabajo | Iniciar y detener trabajo: intervalos persistentes, duplicados, cruces de sesión y atribución correcta. | `work.track` DEMO-only. |
| PROD-12 · P | Incentivos / referidos | Configuración y umbrales, alta de referido y pago: elegibilidad, conciliación y prevención de duplicados. | `incentive.update`, `referral.create`, `referral.pay` DEMO-only. |
| PROD-13 · P | Comercial / prospectos | Actualizar lead y su pipeline: contrato con permisos, transiciones e historial; coordinar captura/notificaciones del sitio cuando se incluya. | `lead.update` DEMO-only; migraciones 05/06 y función de notificaciones existentes no equivalen a despliegue verificado. |
| PROD-14 · P | Equipo / RR. HH. | Editar base y agregar/eliminar eventos: definir visibilidad de información, corrección auditada y persistencia. | `hr.base`, `hr.event.add`, `hr.event.remove` DEMO-only. |
| PROD-15 · P | Experiencia / reseñas y testimonios | Crear/retractar reseña, otorgar consentimiento y publicar/despublicar testimonio: consentimiento demostrable y retiro efectivo del contenido publicado. | `review.create`, `.retract`, `.consent`, `.publish`, `.unpublish` DEMO-only. |
| PROD-16 · P | Archivos / entregables | Disponibilidad, descarga segura y publicación de artefactos: autorización por cuenta, enlace y vigencia, verificación del archivo y retiro de acceso. | Descarga/publicación backend sin contrato operativo acreditado. |
| PROD-17 · P | Preferencias / experiencia | Decidir qué preferencias deben sincronizarse; si son persistentes, contrato por usuario/cuenta y recuperación entre sesiones. | `ui.preference` efímera; no se promete persistencia remota. |

El selector de actor/rol y el login freemium ficticio (`setRole`, `loginAs` en
DEMO, `loginFree`) son herramientas de demostración: **no se trasladarán a
producción como flujos de autoasignación de permisos**. El acceso real corresponde
a IAM/AUTH. Esto cubre también las superficies de sesión del inventario original.

## Dependencias y aceptación

Avance local posterior: [apariencia H1.1 integrada](h11-appearance/REPORT.md).
La dependencia de recibir la variante de Runtime está atendida y Portal ya la
consume en DEMO. UX-01/BRAND-01 conservan pendiente la aceptación visual y la
habilitación alojada; SITE-01 pertenece al chat del sitio. Esto no activa flujos operativos.

| ID / orden | Corresponde a | Pendiente y criterio de cierre |
|---|---|---|
| UX-01 · G | Producto / aceptación | Aceptación funcional y visual de la DEMO revisada, incluyendo contexto libre por selección, accesibilidad y responsividad; decidir funciones que entran a H1.2. Pruebas automáticas no sustituyen aceptación humana. |
| BRAND-01 · D | Sistema de marca / variante clara | Recibir de Runtime tokens y activos claros aprobados, implementar consumo en Portal y comprobar contraste, estados, responsive y preferencia de tema. Mandato ya canalizado al chat de marca; no inventar canon aquí. |
| SITE-01 · D | Sitio público / integración | El chat del sitio debe aplicar la variante aprobada a todas sus páginas, blogs y políticas; coordinar con Portal enlaces de entrada, captura de leads y testimonios publicados según alcance. Landing permanece solo referencia en esta tarea. |

## Fuentes y límites de evidencia

- [Inventario de mutaciones H1.0](h1.0/mutation-inventory.md): mapa base de todas las acciones Store/guard; es un corte histórico.
- [Cadena H1 y dependencias de diseño/marca](h1-chain/README.md).
- [Preparación de release y gates](h1-chain/release-runbook.md).
- [Respaldo y restore real aislado](hosted-restore-20261025/REPORT.md).
- [Identidad y Auth aislados](identity-auth-20261025/REPORT.md).
- [Administración de invitaciones y validación más reciente](invitations-20261025/REPORT.md).

Hechos: los informes enlazados acreditan únicamente sus pruebas y alcances.
Declaración del propietario: mantener pendientes estos flujos y no modificar
producción. Supuestos abiertos: alcance comercial del primer release, personas
responsables, fechas, proveedor/configuración alojada y política de conservación.
Decisión futura de Arturo: priorizar alcance H1.2 y autorizar por separado cualquier
operación alojada. Este backlog no requiere resolver esa decisión para quedar registrado.
