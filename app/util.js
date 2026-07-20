/* Don Ventas · Portal — utilidades compartidas */
window.DVUtil = (function () {
  const el = id => document.getElementById(id);
  const qsa = (s, r) => Array.from((r || document).querySelectorAll(s));
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function mxn(n) { return '$' + Number(n).toLocaleString('es-MX'); }

  const ST_LABEL = { cerrado: 'Cerrado', en_revision: 'En revisión', en_curso: 'En curso', pendiente: 'Pendiente' };
  const RES_LABEL = { aprobado: 'aprobado', propuesto: 'propuesto', ajustes: 'ajustes', cerrado: 'cerrado' };

  /* Sistema de estados CANÓNICO (mismo para cola y bitácora) ── 4 estados.
     Mapeo: block.status y round.result se traducen a la misma escala. */
  const CANON_STATES = [
    { key: 'pendiente', label: 'Pendiente' },
    { key: 'en_curso', label: 'En curso' },
    { key: 'en_revision', label: 'En revisión' },
    { key: 'aprobado', label: 'Aprobado' }
  ];
  function blockState(status) { return status === 'cerrado' ? 'aprobado' : status; }
  function roundState(result) { return result === 'aprobado' ? 'aprobado' : result === 'ajustes' ? 'en_curso' : 'en_revision'; }
  function stateLabel(k) { const s = CANON_STATES.find(x => x.key === k); return s ? s.label : k; }
  function statePill(k) { return '<span class="st ' + k + '"><span class="d"></span>' + stateLabel(k) + '</span>'; }
  const CHEVRON = '<svg class="chev" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6 L8 10 L12 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  function statusPill(status) {
    return '<span class="st ' + status + '"><span class="d"></span>' + (ST_LABEL[status] || status) + '</span>';
  }
  function resTag(r) { return '<span class="res ' + r + '">' + (RES_LABEL[r] || r) + '</span>'; }
  function fitTag(f) { const c = f === 'alto' ? 'hi' : f === 'medio' ? 'mid' : ''; return '<span class="tag ' + c + '">fit ' + f + '</span>'; }
  function prog(pct) { return '<div class="prog"><i style="width:' + pct + '%"></i></div>'; }

  function ago(iso) {
    const d = Math.round((Date.parse('2026-07-13T12:00:00') - Date.parse(iso)) / 864e5);
    if (d <= 0) return 'hoy';
    if (d === 1) return 'ayer';
    if (d < 7) return 'hace ' + d + ' días';
    if (d < 30) return 'hace ' + Math.round(d / 7) + ' sem';
    return 'hace ' + Math.round(d / 30) + ' meses';
  }

  let tmr;
  function toast(m) {
    let t = el('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('on'); clearTimeout(tmr);
    tmr = setTimeout(() => t.classList.remove('on'), 2800);
  }

  const MARK = '<svg class="mk" viewBox="0 0 100 100" fill="none"><path d="M22 16 L22 84 L58 50 Z" stroke="#F2F5F9" stroke-width="9" stroke-linejoin="round"></path><path d="M54 20 L84 50 L54 80" stroke="#3B74F2" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  /* El Don · emblema del monóculo (mínimo) con expresión vía ceja. Avatar del copiloto. */
  function elDon(o) {
    o = o || {}; const ink = o.ink || '#EEF1F6', acc = o.acc || '#3B74F2', expr = o.expr || 'base';
    const monocle = '<circle cx="70" cy="63" r="9" fill="none" stroke="' + acc + '" stroke-width="3.4"></circle><path d="M79 67 Q83 77 78 84" fill="none" stroke="' + acc + '" stroke-width="2" stroke-linecap="round"></path>';
    let brow, eye;
    if (expr === 'smug') {
      brow = '<path d="M44 47.5 L76 43.5" fill="none" stroke="' + ink + '" stroke-width="4.4" stroke-linecap="round"></path>';
      eye = '<path d="M48.5 63.5 L57.5 63.5" fill="none" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round"></path>';
    } else if (expr === 'wow') {
      brow = '<path d="M44 44 Q60 37 76 44" fill="none" stroke="' + ink + '" stroke-width="4.2" stroke-linecap="round"></path>';
      eye = '<circle cx="53" cy="64" r="4.4" fill="' + ink + '"></circle>';
    } else {
      brow = '<rect x="44" y="44" width="32" height="4.4" rx="2.2" fill="' + ink + '"></rect>';
      eye = '<circle cx="53" cy="63" r="3.6" fill="' + ink + '"></circle>';
    }
    return '<svg viewBox="0 0 120 120" role="img" aria-label="El Don">' + brow + eye + monocle + '</svg>';
  }

  return { el, qsa, esc, mxn, statusPill, resTag, fitTag, prog, ago, toast, ST_LABEL, MARK, elDon, CANON_STATES, blockState, roundState, stateLabel, statePill, CHEVRON };
})();
