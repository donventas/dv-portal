# Inventario H1.0 · mutación, persistencia y permiso

Snapshot del código local, no inventario de grants desplegados. DEMO simula en memoria.
SANDBOX/LIVE solo admiten plumbing de sesión, preferencias efímeras y comandos candidatos.
El mapper de release vigente no habilita los comandos nuevos.

| API Store | Acción guard | Backend |
|---|---|---|
| `savePreference` | `ui.preference` | Efímera; namespace de usuario/tenant en DEMO. |
| `loginAs` | `session.login` | Sesión derivada de Auth; revalidación de actor al escribir; logout purga caché. |
| `setRole` | `session.role` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `logout` | `session.logout` | Sesión derivada de Auth; revalidación de actor al escribir; logout purga caché. |
| `loginFree` | `session.login` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `updateFreeProfile` | `session.profile` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setAccountKind` | `account.kind` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `toggleCapa` | `account.layers` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `saveChat` | `chat.save` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `bumpIter` | `iteration.bump` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `approveProposal` | `skill.proposal.approve` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `dismissProposal` | `skill.proposal.dismiss` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `shipBacklog` | `skill.backlog.publish` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setPeriod` | `period.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setTeamCost` | `labor.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `startWork` | `work.track` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `stopWork` | `work.track` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setCatalogPrice` | `catalog.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setIncentiveCfg` | `incentive.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setUmbral` | `incentive.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `markReferralPaid` | `referral.pay` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `addReferral` | `referral.create` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `updateLead` | `lead.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `approve` | `block.approve` | RPC v1 candidata cerrada. Owner aprueba/comenta; staff asignado registra ronda; admin activa. Versión/revisión obligatorias. |
| `addRound` | `round.create` | RPC v1 candidata cerrada. Owner aprueba/comenta; staff asignado registra ronda; admin activa. Versión/revisión obligatorias. |
| `requestScope` | `scope.request` | RPC v1 candidata cerrada. Owner aprueba/comenta; staff asignado registra ronda; admin activa. Versión/revisión obligatorias. |
| `invite` | `member.invite` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `inviteStaff` | `staff.invite` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `resendInvite` | `member.resend` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `removeMember` | `member.remove` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `requestInvoice` | `invoice.request` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `assign` | `assignment.update` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `validatePayment` | `payment.validate` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `publishSkill` | `skill.publish` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `revertSkill` | `skill.revert` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `activate` | `account.activate` | RPC v1 candidata cerrada. Owner aprueba/comenta; staff asignado registra ronda; admin activa. Versión/revisión obligatorias. |
| `register` | `account.register` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `acceptAssignment` | `assignment.accept` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `rejectAssignment` | `assignment.reject` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `reassignNow` | `assignment.reassign` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `sweepReassign` | `assignment.reassign` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `setBase` | `hr.base` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `addHrEvent` | `hr.event.add` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `removeHrEvent` | `hr.event.remove` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `addReview` | `review.create` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `publishTestimonial` | `review.publish` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `unpublishTestimonial` | `review.unpublish` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `retractReview` | `review.retract` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |
| `grantReviewConsent` | `review.consent` | DEMO-only. Guard niega backend; adaptador legado, si existe, rechaza. |

## Otras superficies

- Auth OTP/OAuth/signout: guard central. UI de enlace se confirma después de éxito;
  no se probó el proveedor real. No hay sesión freemium backend fabricada.
- SDK: adaptador sin insert/update/upsert/delete de tablas. Único write de negocio:
  RPC candidata, pendiente de contrato verificado y autorización del servidor.
- Loader: bootstrap vacío; seed solo DEMO con autoguarda. Pagos DEMO no abren proveedor.
- Consumidores demo-only niegan antes de mostrar éxito; controles deshabilitados en backend.
- Backend no lee/escribe cachés locales heredadas de chats, backlog, HR o reseñas.
  SDK Auth conserva su namespace de ambiente para procesar signout entre pestañas.
- Preferencias/acordeones pasan por Store. Cambio de identidad/generación y logout
  limpian Store y borradores Client/Staff/Auth/Free e invalidan operaciones pendientes.
- Publicación, descarga segura, invitaciones enviadas, leads, pagos y administración
  de asignaciones siguen pendientes de sus contratos. El modelo híbrido no se amplía.
- Lead-notifications y Landing sin cambios; no se verificó su despliegue ni envío.
