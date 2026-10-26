/* Administrative invitations. Enabled only for the explicitly admitted local sandbox. */
window.DVAdminInvitations = (() => {
  let generation = 0, intentions = new Map();
  const U = DVUtil, api = () => DVSupa.identity;
  const states = { queued: 'Pendiente de envío', dispatching: 'Resultado por confirmar', uncertain: 'Resultado por confirmar · no reenviar', sent: 'Aceptada por el proveedor', failed: 'No enviada', cancelled: 'Cancelada antes del envío' };
  function resetTransient() { generation++; intentions.clear(); }
  function key(signature) { if (!intentions.has(signature)) intentions.set(signature, crypto.randomUUID()); return intentions.get(signature); }
  function render(host) {
    const epoch = ++generation, actor = DVStore.session()?.userId;
    const current = () => epoch === generation && actor === DVStore.session()?.userId && host.isConnected && host.contains(body);
    if (!api().enabled() || !DVStore.isAdmin()) { host.textContent = 'Gestión no disponible en este entorno.'; return; }
    host.innerHTML = '<div class="eyebrow">Administración · entorno aislado</div><h2 class="vh">Invitaciones y accesos</h2>' +
      '<p class="vsub">Invita, verifica la identidad y después concede acceso. Los correos de este ensayo se reciben en el buzón local.</p>' +
      '<p id="identityNotice" role="status" aria-live="polite"></p><div id="identityBody"></div>';
    const notice = text => { if (current()) host.querySelector('#identityNotice').textContent = text; };
    const body = host.querySelector('#identityBody');
    let userAfter = null, inviteAfter = null, selected = null;
    async function load() {
      const [invitations, users] = await Promise.all([api().directory('invitations', inviteAfter), api().directory('users', userAfter)]);
      if (!current()) return;
      const visibleInvites = invitations.rows.slice(0,20), visibleUsers = users.rows.slice(0,20);
      body.innerHTML = '<form id="inviteForm" class="panel identity-panel"><h3>Invitar a una persona</h3>' +
        '<label for="inviteEmail">Correo del destinatario sintético</label><input id="inviteEmail" type="email" maxlength="254" required placeholder="persona@synthetic.invalid">' +
        '<label for="inviteReason">Motivo de la invitación</label><textarea id="inviteReason" minlength="8" maxlength="500" required></textarea>' +
        '<button class="btn solid" type="submit">Enviar invitación</button></form>' +
        '<section class="panel identity-panel"><h3>Invitaciones</h3><p class="hint">Confirmar el correo no concede permisos. Un resultado por confirmar requiere revisión antes de intentar otro envío.</p><div class="list">' +
        (visibleInvites.length ? visibleInvites.map(i => '<div class="li"><div class="g"><b>' + U.esc(i.email) + '</b><small>' + states[i.state] + '</small></div>' +
          (i.state === 'queued' ? '<button class="btn sm" data-cancel="' + i.id + '">Cancelar envío</button>' : '') + '</div>').join('') : '<p>No hay invitaciones en esta página.</p>') + '</div>' +
        '<button class="btn sm" id="invitationsStart">Inicio</button> <button class="btn sm" id="invitationsNext"' + (invitations.rows.length > 20 ? '' : ' disabled') + '>Siguientes invitaciones</button></section>' +
        '<section class="panel identity-panel"><h3>Identidades y permisos</h3><div class="list">' +
        visibleUsers.map(u => '<div class="li"><div class="g"><b>' + U.esc(u.email) + '</b><small>' + (u.verified ? 'Correo verificado' : 'Verificación pendiente') + ' · ' +
          (u.pending ? 'Sin acceso activo' : U.esc(u.member_role || u.role)) + '</small></div><button class="btn sm" data-user="' + u.id + '">Gestionar</button></div>').join('') + '</div>' +
        '<button class="btn sm" id="usersStart">Inicio</button> <button class="btn sm" id="usersNext"' + (users.rows.length > 20 ? '' : ' disabled') + '>Siguientes personas</button></section><div id="accessEditor"></div>' +
        '<button class="btn" id="identityReload">Actualizar estados</button>';
      body.querySelector('#inviteForm').onsubmit = async event => {
        event.preventDefault(); const email = body.querySelector('#inviteEmail').value.trim().toLowerCase(), reason = body.querySelector('#inviteReason').value.trim();
        const button = event.submitter; button.disabled = true;
        try { const result = await api().invite(key(JSON.stringify(['invite',email,reason])), email, reason); await refreshAfter(states[result.state]); }
        catch (_) { notice('No se confirmó el envío. Actualiza los estados; un reintento conservará la misma intención.'); }
        finally { if (button.isConnected) button.disabled = false; }
      };
      body.querySelector('#identityReload').onclick = () => refresh();
      body.querySelector('#invitationsStart').onclick = () => { inviteAfter = null; refresh(); };
      body.querySelector('#usersStart').onclick = () => { userAfter = null; refresh(); };
      body.querySelector('#invitationsNext').onclick = () => { inviteAfter = visibleInvites.at(-1).id; refresh(); };
      body.querySelector('#usersNext').onclick = () => { userAfter = visibleUsers.at(-1).id; refresh(); };
      body.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api().cancel(b.dataset.cancel); await refreshAfter('Cancelada antes del envío.'); } catch (_) { notice('No se pudo cancelar. Puede haberse iniciado el envío; actualiza el estado.'); } });
      body.querySelectorAll('[data-user]').forEach(b => b.onclick = () => { selected = visibleUsers.find(u => u.id === b.dataset.user); edit(); });
    }
    function edit() {
      const u = selected, editor = body.querySelector('#accessEditor');
      const action = !u.pending ? 'revoke' : u.access_version === 0 ? 'provision' : 'restore';
      editor.innerHTML = '<form id="accessForm" class="panel identity-panel"><h3>Gestionar acceso</h3><p>' + U.esc(u.email) + '</p><p class="hint">' +
        (action === 'revoke' ? 'Se suspenderá el acceso de esta persona.' : 'Después de conceder acceso, la persona debe iniciar sesión nuevamente.') + '</p>' +
        (action === 'provision' ? '<label for="accessRole">Permiso</label><select id="accessRole"><option value="miembro">Miembro</option><option value="owner">Owner</option><option value="analista">Analista</option></select>' +
          '<label for="accessAccount">Cuenta</label><select id="accessAccount"><option value="">Selecciona una cuenta</option>' + DVStore.accounts().map(a => '<option value="' + a.id + '">' + U.esc(a.name) + '</option>').join('') + '</select>' : '') +
        '<label for="accessReason">Motivo del cambio</label><textarea id="accessReason" minlength="8" maxlength="500" required></textarea>' +
        '<button class="btn solid" type="submit"' + (action !== 'revoke' && !u.verified ? ' disabled' : '') + '>' + ({ provision:'Conceder acceso', revoke:'Revocar acceso', restore:'Restaurar acceso' })[action] + '</button></form>';
      const role = editor.querySelector('#accessRole'), account = editor.querySelector('#accessAccount');
      if (role) role.onchange = () => { account.disabled = role.value === 'analista'; if (account.disabled) account.value = ''; };
      editor.querySelector('form').onsubmit = async event => {
        event.preventDefault(); const button = event.submitter; button.disabled = true;
        const params = { p_action: action, p_target: u.id, p_version: u.access_version, p_account: role && role.value !== 'analista' ? account.value || null : null,
          p_access: role ? role.value : null, p_reason: editor.querySelector('#accessReason').value.trim() };
        params.p_key = key(JSON.stringify(params));
        try { const result = await api().command(params); await refreshAfter(result.requiresNewSignIn ? 'Acceso actualizado. La persona debe iniciar sesión nuevamente.' : 'Acceso revocado.'); }
        catch (_) { notice('No se pudo confirmar el cambio. Revisa verificación, cupos y versión; actualiza los estados.'); if (button.isConnected) button.disabled = false; }
      };
    }
    async function refresh() { try { await load(); } catch (_) { notice('No se pudieron actualizar los estados. Verifica tu sesión y MFA.'); } }
    async function refreshAfter(message) { try { await load(); notice(message); } catch (_) { notice(message + ' No se pudo actualizar la lista; vuelve a consultarla.'); } }
    load().catch(async () => {
      if (!current()) return;
      notice('Confirma tu segundo factor para gestionar accesos.');
      let factors; try { factors = await api().factors(); } catch (_) { return notice('Vuelve a iniciar sesión para continuar.'); }
      if (!current()) return;
      if (!factors.length) return notice('Tu cuenta necesita un segundo factor configurado antes de administrar accesos.');
      body.innerHTML = '<form id="identityMfa" class="panel identity-panel"><label for="identityFactor">Segundo factor</label><select id="identityFactor">' + factors.map(f => '<option value="' + f.id + '">' + U.esc(f.friendly_name || 'Autenticador') + '</option>').join('') +
        '</select><label for="identityCode">Código de tu autenticador</label><input id="identityCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required maxlength="6"><button class="btn solid" type="submit">Verificar acceso</button></form>';
      body.querySelector('form').onsubmit = async event => {
        event.preventDefault(); event.submitter.disabled = true;
        try { await api().verify(body.querySelector('#identityFactor').value, body.querySelector('#identityCode').value); await DVSupa.hydrate(); const uid = await DVSupa.authUid();
          const me = DV_SEED.users.find(u => u.id === uid); if (!me || me.pending || me.role !== 'admin') throw new Error('ADMIN_REQUIRED');
          DVStore.loginAs(me); DVPortal.boot(); DVPortal.go('equipo');
        } catch (_) { notice('No se pudo verificar el código. Vuelve a intentarlo.'); if (event.submitter.isConnected) event.submitter.disabled = false; }
      };
    });
  }
  return { render, resetTransient };
})();
