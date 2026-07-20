# Portal Don Ventas · F1 — Supabase (schema + RLS + seed)

Migraciones SQL para la **Fase 1** del Portal MVP: montar auth y datos reales
sobre Supabase, reemplazando `portal/data/seed.js` por consultas a las mismas
tablas. El RLS es la **traducción directa de `portal/app/store.js`** (mismo
alcance por rol) y de la *Matriz de accesos y permisos* (`14_PORTAL/`).

## Archivos (aplicar en orden)

1. **`migrations/01_schema.sql`** — extensiones, enums, tablas (PRD §09),
   índices, función `capa_to_layer()`, triggers (`round` inmutable + `updated_at`).
2. **`migrations/02_rls.sql`** — schema `auth_dv` con los helpers de sesión,
   `enable row level security` en todas las tablas, las políticas por tabla, y el
   trigger `handle_new_auth_user()` que vincula el magic-link con `app_user`.
3. **`migrations/03_seed.sql`** — datos demo (bitácora incluida) con la forma real,
   equivalentes a `data/seed.js`. IDs de pilotos = los de `ESTADO.md`.
4. **`migrations/04_rpc.sql`** — RPC `activate_account()` (multi-fila, atómica,
   solo admin): saca de waitlist, crea brand+project+bloque F1+package_access+
   asignación+ronda de kickoff+owner. La invoca `DVSupa.write.activate()`.

## Cablear el front (YA HECHO — solo faltan las llaves)
El front ya está preparado para conmutar demo↔vivo sin tocar la UI:

- **`portal/app/supabase.js`** (nuevo) — adaptador: config `DV_SUPA`, carga perezosa
  de `supabase-js`, `signIn()` (magic-link), `hydrate()` (lee las 12 tablas RLS-scoped
  y reconstruye `window.DV_SEED` con la misma forma que `data/seed.js`), y `write.*`
  que persiste cada mutación (approve · addRound · invite · assign · validatePayment ·
  publishSkill · register · activate→RPC).
- **`store.js`** — cada mutación hace su update optimista en memoria **y**, si hay
  llaves, llama a `DVSupa.write.*` para persistir. El alcance por rol lo aplica el RLS.
- **`auth.js`** — en vivo, «Enviar enlace mágico» dispara el magic-link real (cliente y
  equipo); las entradas directas demo se ocultan.
- **`portal.js`** — el arranque, en vivo, deriva la sesión de Supabase Auth
  (`authUid()` → `hydrate()` → `loginAs`), no de localStorage. Logout cierra la sesión
  de Supabase.

### Activar (una sola vez)
1. Corre las 4 migraciones (SQL Editor).
2. Supabase → **Authentication → Providers → Email**: activa **magic link**; agrega la
   URL del portal a **Redirect URLs**.
3. Rellena en `portal/app/supabase.js` → `DV_SUPA.URL` y `DV_SUPA.ANON`
   (Project Settings → API). Con eso el portal pasa a **EN VIVO**; con los campos
   vacíos sigue en **DEMO** (sin tocar nada más).

> Nota: el **F0 público** del portal (registro anónimo a waitlist) queda bloqueado por
> RLS en vivo (igual que en la landing, que usa una tabla `lead` con INSERT anónimo);
> su intento falla en silencio (toast). Conectarlo es trabajo de F2.

### Signup abierto + freemium (decisión D-07)
El proveedor **Email (magic-link) queda con signup ABIERTO**: cualquier correo puede
autenticarse. Eso **no** es fuga — el trigger `handle_new_auth_user` deja al desconocido
como **cliente huérfano** (`account_id = null`), así que `auth_dv.account_ids()` devuelve
vacío y el RLS **no le muestra ni una fila de marca**. El front convierte ese estado en la
**vista freemium**: diagnóstico gratuito embebido (F0 público) + CTA a contratar con
Stripe Payment Link. Al pagar, el admin dispara `activate_account()` y la cuenta pasa a
activa con sus capas. Es el **embudo**, no un error.

- **Para blindar** (solo invitados): Authentication → Providers → Email →
  *Allow new users to sign up* = **OFF**. Entonces solo los correos ya sembrados/invitados
  obtienen magic-link.
- **F2** conecta el registro público a la `waitlist` real y monta la vista freemium; el
  cobro por API (webhooks + Billing) sigue siendo **F3**.

### Cómo aplicar las migraciones
- **SQL Editor** de Supabase (corre como owner → bypassa RLS, ideal para el seed), o
- **CLI**: `supabase db push` / `psql "$DATABASE_URL" -f 01_schema.sql` (idem 02, 03).

## Mapa store.js → RLS (traducción)

| store.js | Postgres |
|---|---|
| `scopedAccountIds()` | `auth_dv.account_ids()` (cliente→su cuenta · admin→todas · analista→asignadas) |
| `isAdmin/isAnalyst/isOwner()` | `auth_dv.is_admin/is_staff/is_owner()` |
| `session.accountId` | `auth_dv.account_id()` (lee `app_user` por `auth.uid()`) |
| `access()` (capas del paquete) | policy `brand_scope` (capa ∈ `package_access.layers`) |
| `validatePayment()` (desbloqueo) | policy `asset_view` + `auth_dv.block_is_paid()` |
| bitácora "solo se agrega" | trigger `round_is_append_only` + policy solo-`insert` |

## Cómo funciona el actor de sesión
`app_user.id = auth.uid()`. Los helpers de `auth_dv` son **SECURITY DEFINER** para
leer `app_user` sin disparar su propio RLS (evita recursión). No dependemos de
custom claims en el JWT: todo se resuelve contra la tabla en cada request.

## Auth (magic-link · F1)
El trigger `handle_new_auth_user` sobre `auth.users` reconcilia por email:
1. si ya hay fila en `app_user` (sembrada/invitada) → adopta el `uid` y `pending=false`;
2. si hay `invitation` vigente → crea el usuario con su rol y marca la invitación aceptada;
3. si no → cliente huérfano sin cuenta (no ve nada hasta que el admin lo asocie).

Por eso los `app_user` del seed usan uuids provisionales: al primer login se
adoptan por email. En Supabase Auth: habilitar **Email (magic link)**.

## Notas de frontera (Matriz §07)
- La capa de **operación interna** (SOPs/playbook/CRM) vive fuera del tenant; `skill`
  es solo-staff.
- **Ver ≠ descargar**: el cliente ve `snapshot` siempre; `fuente`/`export` requieren
  bloque liquidado (`block_is_paid`).
- `payment` se escribe por **service_role** (webhook Stripe · F3), no por el cliente.

## Siguiente (F1 → cablear el front)
Reemplazar `data/seed.js` por un cliente `@supabase/supabase-js` que consulte estas
tablas; las funciones de `store.js` mapean 1:1 (el RLS ya aplica el alcance, así que
el front deja de filtrar por rol y solo pinta lo que la base devuelve).
