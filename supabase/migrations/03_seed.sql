-- ═══════════════════════════════════════════════════════════════════════════
-- Don Ventas · Portal MVP — F1 · Seed (Supabase / Postgres)
-- ═══════════════════════════════════════════════════════════════════════════
-- Traducción de portal/data/seed.js. Datos demo con la forma del schema real.
-- Se ejecuta como owner de las tablas (bypassa RLS). Aplicar tras 01 y 02.
--
-- IDs de cuentas pilotos = los de ESTADO.md. app_user usa uuids provisionales:
-- al primer magic-link, handle_new_auth_user() adopta la fila por email.
-- Fechas relativas a "hoy" (equivalente a data/seed.js · now = 2026-07-13).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── account ───────────────────────────────────────────────────────────────────
insert into account (id, name, segment, status, queue_position, pkg, fit, diag, created_at) values
  ('acabb9da-c157-444c-9e9e-dbf0371cadbe','Sicarú','Joyería artesanal · Oaxaca','activo',null,'Sistema · Pro','alto',null, now()-interval '96 days'),
  ('a1944467-e179-4ef4-b390-804cb94c730f','Tamanova','Hospitalidad · Mérida','activo',null,'Sistema · Growth','alto',null, now()-interval '74 days'),
  ('1959e0d2-c8b7-4d1a-8971-a67d0e56a32a','Pafi','Viajes · contenido','activo',null,'Sistema · Starter','medio',null, now()-interval '120 days'),
  ('3f1b2c00-0000-4000-8000-000000000004','QuickFinance','Fintech contable · CDMX','activo',null,'Fundación','alto',null, now()-interval '41 days'),
  ('3f1b2c00-0000-4000-8000-000000000005','Café Nube','Cafetería de especialidad','waitlist',1,null,'alto','hecho', now()-interval '9 days'),
  ('3f1b2c00-0000-4000-8000-000000000006','Dr. Salas','Consultorio dental','waitlist',2,null,'medio','hecho', now()-interval '6 days'),
  ('3f1b2c00-0000-4000-8000-000000000007','Loma Real','Inmobiliaria','waitlist',3,null,'—','pendiente', now()-interval '3 days')
on conflict (id) do nothing;

-- ── app_user · staff (uuid fijo · referenciado por assignment) ────────────────
insert into app_user (id, account_id, email, name, role, member_role, pending) values
  ('11111111-1111-4111-8111-111111111111', null, 'arturo@donventas.mx','Arturo Villagómez','admin',    null, false),
  ('22222222-2222-4222-8222-222222222222', null, 'luis@donventas.mx',  'Luis Antonio Rosas','analista', null, false)
on conflict (id) do nothing;

-- ── app_user · clientes (uuid provisional · se adopta por email al loguear) ───
insert into app_user (id, account_id, email, name, role, member_role, pending)
select gen_random_uuid(), a.id, v.email, v.name, 'cliente', v.mrole::member_role, v.pending
from (values
  ('Sicarú',   'daniela@sicaru.mx','Daniela Ríos','owner',  false),
  ('Sicarú',   'socio@sicaru.mx',  '(invitación enviada)','miembro', true),
  ('Tamanova', 'hola@tamanova.mx', 'Renata Cauich','owner', false),
  ('Pafi',     'team@pafi.travel', 'Emilio Fonseca','owner',false),
  ('QuickFinance','ceo@quickfinance.mx','Paola Bernal','owner',false)
) v(acct,email,name,mrole,pending)
join account a on a.name = v.acct
on conflict (email) do nothing;

-- ── assignment (analista ↔ cuenta · el admin asigna) ──────────────────────────
insert into assignment (analyst_id, account_id, assigned_by)
select u.id, a.id, (select id from app_user where email='arturo@donventas.mx')
from (values
  ('luis@donventas.mx',  'Sicarú'),
  ('luis@donventas.mx',  'Tamanova'),
  ('arturo@donventas.mx','Pafi'),
  ('arturo@donventas.mx','QuickFinance')
) v(analyst,acct)
join app_user u on u.email = v.analyst
join account a on a.name = v.acct
on conflict (analyst_id, account_id) do nothing;

-- ── package_access (base del RLS) ─────────────────────────────────────────────
insert into package_access (account_id, package, layers, sections)
select a.id, v.pkg::package_type, array['marca']::brand_layer[], v.sections
from (values
  ('Sicarú',      'sistema',   array['tablero','previews','bitacora','cuenta','generadores']),
  ('Tamanova',    'sistema',   array['tablero','previews','bitacora','cuenta','generadores']),
  ('Pafi',        'sistema',   array['tablero','previews','bitacora','cuenta']),
  ('QuickFinance','fundacion', array['tablero','previews','bitacora','cuenta'])
) v(acct,pkg,sections)
join account a on a.name = v.acct
on conflict (account_id) do nothing;

-- ── brand + project (una marca / un proyecto por cuenta activa) ───────────────
insert into brand (account_id, name, layer, enabled)
select id, name, 'marca', true from account where status='activo'
on conflict do nothing;

insert into project (brand_id, title)
select b.id, 'Sistema de marca '||b.name from brand b
where not exists (select 1 from project p where p.brand_id = b.id);

-- ── block (entregable) ────────────────────────────────────────────────────────
insert into block (project_id, code, title, capa, status, progress)
select p.id, v.code, v.title, v.capa, v.status::block_status, v.progress
from (values
  ('Sicarú','F1','Estrategia y arquetipo','Fundación','cerrado',100),
  ('Sicarú','F2','Voz de marca','Fundación','cerrado',100),
  ('Sicarú','B01','Logo','Sistema','cerrado',100),
  ('Sicarú','B02','Sistema de color','Sistema','cerrado',100),
  ('Sicarú','B03','Tipografía','Sistema','cerrado',100),
  ('Sicarú','B04','Patterns','Sistema','en_curso',55),
  ('Sicarú','B12','Merchandising','Sistema','pendiente',0),
  ('Sicarú','B10','Landing','Activación','en_revision',80),
  ('Sicarú','B11','Contenido educativo','Activación','en_curso',45),
  ('Tamanova','F1','Estrategia y arquetipo','Fundación','cerrado',100),
  ('Tamanova','B01','Logo','Sistema','cerrado',100),
  ('Tamanova','B04','Patterns','Sistema','en_curso',40),
  ('Tamanova','B09','Instagram','Sistema','pendiente',0),
  ('Pafi','F1','Estrategia y arquetipo','Fundación','cerrado',100),
  ('Pafi','B01','Logo','Sistema','cerrado',100),
  ('Pafi','B05','Iconografía','Sistema','cerrado',100),
  ('Pafi','B10','Landing','Activación','en_revision',85),
  ('QuickFinance','F1','Estrategia y arquetipo','Fundación','en_curso',60)
) v(acct,code,title,capa,status,progress)
join account a on a.name = v.acct
join brand b on b.account_id = a.id
join project p on p.brand_id = b.id
on conflict do nothing;

-- helper local: resolver un block por (cuenta, code)
-- (usado por round/preview/asset vía join)

-- ── round · bitácora (inmutable · solo se agrega) ─────────────────────────────
insert into round (block_id, seq, title, deliverable, feedback, result, author, created_at)
select bl.id, v.seq, v.title, v.deliverable, v.feedback, v.result::round_result, v.author,
       now() - (v.ago||' days')::interval
from (values
  ('Sicarú','F1',1,'Estrategia y arquetipo','Arquetipo preliminar + 3 hallazgos','Aprobado — El Guardián','aprobado',90,'Luis'),
  ('Sicarú','F2',1,'Voz de marca','Tono, léxico y do/don''t','Aprobada','aprobado',84,'Luis'),
  ('Sicarú','B01',1,'Logo cerrado','Ruta B (boceto) · triángulo + chevron','Aprobado','aprobado',70,'Luis'),
  ('Sicarú','B02',1,'Color cerrado','Paleta negro-azul','Aprobado','aprobado',66,'Luis'),
  ('Sicarú','B03',1,'Tipografía cerrada','Schibsted Grotesk + Space Mono','Aprobada','aprobado',62,'Luis'),
  ('Sicarú','B04',1,'Familia de patrones v1','3 patrones tileables','—','propuesto',8,'Luis'),
  ('Sicarú','B10',1,'Estructura Ruta A','1 variante · terminal','Elegí la Ruta A','aprobado',22,'Luis'),
  ('Sicarú','B10',2,'Afinamientos + jubilar v2','hero, lightbox, niveles','Conservar hero original','ajustes',12,'Luis'),
  ('Sicarú','B10',3,'Preview en revisión','rama mejora/B10-hero','—','propuesto',2,'Luis'),
  ('Sicarú','B11',1,'2 plantillas de carrusel','carrusel educativo A/B','Base aprobada, faltan ajustes','ajustes',5,'Luis'),
  ('Tamanova','F1',1,'Estrategia y arquetipo','Arquetipo + posicionamiento','Aprobado','aprobado',60,'Luis'),
  ('Tamanova','B01',1,'Logo cerrado','marca denominativa + símbolo','Aprobado','aprobado',40,'Luis'),
  ('Tamanova','B04',1,'Familia de patrones v1','set inicial','—','propuesto',4,'Luis'),
  ('Pafi','B10',1,'Landing en revisión','rama mejora/B10-portada','—','propuesto',3,'Arturo'),
  ('QuickFinance','F1',1,'Kickoff · arranque de Fundación','diagnóstico + research inicial','En proceso','propuesto',6,'Arturo')
) v(acct,code,seq,title,deliverable,feedback,result,ago,author)
join account a on a.name = v.acct
join brand b on b.account_id = a.id
join project p on p.brand_id = b.id
join block bl on bl.project_id = p.id and bl.code = v.code
on conflict (block_id, seq) do nothing;

-- ── preview (rama / URL de mejora) ────────────────────────────────────────────
insert into preview (block_id, branch, url, merged)
select bl.id, v.branch, v.url, false
from (values
  ('Sicarú','B10','mejora/B10-hero','b10-hero.sicaru.vercel.app'),
  ('Sicarú','B11','mejora/B11-carruseles','b11-carruseles.sicaru.vercel.app'),
  ('Sicarú','B04','mejora/B04-patterns','b04-patterns.sicaru.vercel.app'),
  ('Pafi','B10','mejora/B10-portada','b10-portada.pafi.vercel.app')
) v(acct,code,branch,url)
join account a on a.name = v.acct
join brand b on b.account_id = a.id
join project p on p.brand_id = b.id
join block bl on bl.project_id = p.id and bl.code = v.code
on conflict do nothing;

-- ── asset (entregables · gate por pago) ───────────────────────────────────────
insert into asset (block_id, kind, name, locked)
select bl.id, v.kind::asset_kind, v.name, v.locked
from (values
  ('Sicarú','B10','fuente','Landing · fuentes y exports', true),
  ('Sicarú','B10','snapshot','Vista previa (pantalla)',    false),
  ('Sicarú','B01','export','Logo · SVG + PNG + curvas',    false)
) v(acct,code,kind,name,locked)
join account a on a.name = v.acct
join brand b on b.account_id = a.id
join project p on p.brand_id = b.id
join block bl on bl.project_id = p.id and bl.code = v.code
on conflict do nothing;

-- ── invoice (facturación · pago conforme a la capa) ───────────────────────────
insert into invoice (account_id, concept, layer, amount, status, paid_at, created_at)
select a.id, v.concept, v.layer::package_type, v.amount, v.status::invoice_status,
       case when v.status='pagado' then now()-(v.ago||' days')::interval end,
       now()-interval '120 days'
from (values
  ('Sicarú','Anticipo · Sistema Pro','sistema',35000,'pagado',88),
  ('Sicarú','Saldo · Sistema Pro','sistema',35000,'pendiente',0),
  ('Sicarú','Retainer · mes en curso','activacion',12000,'pendiente',0),
  ('Tamanova','Anticipo · Growth','sistema',25000,'pagado',70),
  ('Tamanova','Saldo · Growth','sistema',25000,'pendiente',0),
  ('Pafi','Anticipo · Starter','sistema',14000,'pagado',118),
  ('Pafi','Saldo · Starter','sistema',14000,'pagado',30),
  ('QuickFinance','Apartado · Fundación','fundacion',500,'pagado',40)
) v(acct,concept,layer,amount,status,ago)
join account a on a.name = v.acct;

-- ── payment (por cada invoice pagada · demo) ──────────────────────────────────
insert into payment (invoice_id, amount, provider, provider_ref, paid_at)
select i.id, i.amount, 'stripe', 'seed_'||left(i.id::text,8), i.paid_at
from invoice i where i.status='pagado';

-- ── skill (motor · staff) ─────────────────────────────────────────────────────
insert into skill (n, v, d) values
  ('Motor de Arquetipos','1.18','Deriva cada decisión de marca del arquetipo del cliente.'),
  ('Brand System Builder','1.17','Construye el sistema bloque por bloque, con checkpoints.'),
  ('Voz & Copy','1.4','Aplica el léxico y el tono de la marca.'),
  ('Investigación de mercado','1.2','Research potenciado con las bases del fundador.')
on conflict do nothing;
