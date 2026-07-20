-- ═══════════════════════════════════════════════════════════════════════════
-- Don Ventas · Portal MVP — F1 · RPCs (Supabase / Postgres)
-- ═══════════════════════════════════════════════════════════════════════════
-- Operaciones multi-fila que deben ser atómicas y correr con permisos de admin.
-- Aplicar DESPUÉS de 02_rls.sql. Se invocan desde el front con supabase.rpc(...).
-- SECURITY DEFINER + verificación de rol adentro (no dependen del RLS de tabla).
-- ═══════════════════════════════════════════════════════════════════════════

-- activate_account: espeja store.activate() — saca de waitlist, crea brand+project,
-- primer bloque F1, package_access base, asignación al analista, ronda de kickoff
-- y el usuario owner. Todo en una transacción. Solo admin.
create or replace function activate_account(p_account uuid, p_analyst uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_brand uuid; v_project uuid; v_block uuid; v_name text;
begin
  if not auth_dv.is_admin() then
    raise exception 'solo el admin puede activar cuentas';
  end if;

  select name into v_name from account where id = p_account;
  if v_name is null then raise exception 'cuenta inexistente'; end if;

  update account
    set status = 'activo', queue_position = null, pkg = 'Fundación'
    where id = p_account;

  insert into brand (account_id, name, layer, enabled)
    values (p_account, v_name, 'marca', true) returning id into v_brand;

  insert into project (brand_id, title)
    values (v_brand, 'Sistema de marca ' || v_name) returning id into v_project;

  insert into block (project_id, code, title, capa, status, progress)
    values (v_project, 'F1', 'Estrategia y arquetipo', 'Fundación', 'en_curso', 5)
    returning id into v_block;

  insert into package_access (account_id, package, layers, sections)
    values (p_account, 'fundacion', array['marca']::brand_layer[],
            array['tablero','previews','bitacora','cuenta'])
    on conflict (account_id) do nothing;

  insert into assignment (analyst_id, account_id, assigned_by)
    values (coalesce(p_analyst, auth.uid()), p_account, auth.uid())
    on conflict (analyst_id, account_id) do nothing;

  insert into round (block_id, seq, title, deliverable, feedback, result, author)
    values (v_block, 1, 'Kickoff · arranque de Fundación', 'agenda de arranque', '—',
            'propuesto', (select name from app_user where id = auth.uid()));

  return p_account;
end $$;

grant execute on function activate_account(uuid, uuid) to authenticated;
