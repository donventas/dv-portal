/* Don Ventas · Portal — indicador persistente y UX fail-closed (Issue #30). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DVEnvironmentIndicatorCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COPY = Object.freeze({
    UNRESOLVED: { icon: '…', label: 'Inicializando entorno', detail: 'Preparando la validación segura del Portal.', operational: false },
    VALIDATING: { icon: '◌', label: 'Validando entorno', detail: 'El Portal está verificando el origen, la configuración y la identidad del entorno.', operational: false },
    DEMO: { icon: '◇', label: 'Entorno DEMO', detail: 'Datos sintéticos locales. No afecta clientes ni operaciones reales.', operational: true },
    SANDBOX: { icon: '▧', label: 'Entorno SANDBOX', detail: 'Ambiente aislado de pruebas. No es producción.', operational: true },
    LIVE: { icon: '◆', label: 'Entorno LIVE', detail: 'Ambiente productivo. Las acciones autorizadas pueden afectar registros reales.', operational: true },
    BLOCKED: { icon: '!', label: 'Portal bloqueado', detail: 'No pudimos verificar un ambiente seguro para operar.', operational: false }
  });
  var PROHIBITED = /token|key|secret|password|authorization|magic|session|email|url|project|tenant|payload|document|contract|payment|file|pii/i;

  function safeSnapshot(snapshot) {
    snapshot = snapshot || {};
    var state = COPY[snapshot.state] ? snapshot.state : 'BLOCKED';
    var diagnostic = snapshot.diagnostic || {};
    return {
      state: state,
      fingerprint: snapshot.fingerprint || null,
      diagnostic: {
        code: String(diagnostic.code || (state === 'BLOCKED' ? 'ENV_UNRESOLVED' : '')),
        correlationId: String(diagnostic.correlationId || '')
      }
    };
  }
  function viewModel(snapshot) {
    var safe = safeSnapshot(snapshot);
    return Object.assign({}, COPY[safe.state], safe);
  }
  function diagnosticIsSafe(diagnostic) {
    return Object.keys(diagnostic || {}).every(function (key) { return !PROHIBITED.test(key); }) &&
      !PROHIBITED.test(String((diagnostic || {}).code || ''));
  }
  function guardModel(result) {
    result = result || {};
    var diagnostic = result.diagnostic || {};
    var models = {
      DENY: { title: 'Acción no disponible', detail: 'La acción fue rechazada de forma segura.' },
      DENY_AND_LOG: { title: 'Acción bloqueada', detail: 'La acción no se ejecutó. Usa la referencia si necesitas soporte.' },
      REAUTH: { title: 'Vuelve a autenticarte', detail: 'Tu sesión no corresponde al ambiente actual.' },
      CONFIRM_SANDBOX: { title: 'Confirmar acción en SANDBOX', detail: 'Esta acción ocurre en un ambiente aislado de pruebas.' }
    };
    return Object.assign(models[result.outcome] || { title: '', detail: '' }, {
      outcome: result.outcome || 'DENY',
      code: String(diagnostic.code || ''),
      correlationId: String(diagnostic.correlationId || '')
    });
  }
  return { COPY: COPY, safeSnapshot: safeSnapshot, viewModel: viewModel, diagnosticIsSafe: diagnosticIsSafe, guardModel: guardModel };
});

(function () {
  if (typeof window === 'undefined' || !window.DVEnvironmentIndicatorCore) return;
  var Core = window.DVEnvironmentIndicatorCore;
  var root = null;
  var block = null;
  var guardDialog = null;
  var lastState = null;
  var lastFingerprint = null;
  var started = false;
  var loaded = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ensureMounts() {
    root = document.getElementById('environmentStatusMount');
    if (!root) {
      root = document.createElement('div');
      root.id = 'environmentStatusMount';
      document.body.insertBefore(root, document.body.firstChild);
    }
    block = document.getElementById('environmentBlockedMount');
    if (!block) {
      block = document.createElement('div');
      block.id = 'environmentBlockedMount';
      document.body.appendChild(block);
    }
    guardDialog = document.getElementById('environmentGuardMount');
    if (!guardDialog) {
      guardDialog = document.createElement('div');
      guardDialog.id = 'environmentGuardMount';
      document.body.appendChild(guardDialog);
    }
  }
  function setOperational(enabled) {
    var auth = document.getElementById('auth');
    var app = document.getElementById('app');
    [auth, app].forEach(function (element) {
      if (!element) return;
      element.inert = !enabled;
      element.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    });
  }
  function renderBlocked(model) {
    block.innerHTML =
      '<section class="env-blocked-screen" role="alertdialog" aria-modal="true" aria-labelledby="envBlockedTitle">' +
      '<div class="env-blocked-card"><div class="env-blocked-symbol" aria-hidden="true">!</div>' +
      '<p class="env-kicker">Seguridad de ambiente</p><h1 id="envBlockedTitle" tabindex="-1">Portal bloqueado</h1>' +
      '<p>No pudimos verificar un ambiente seguro. El inicio de sesión, la navegación y las operaciones están deshabilitados.</p>' +
      '<dl><div><dt>Código</dt><dd><code>' + esc(model.diagnostic.code || 'ENV_UNRESOLVED') + '</code></dd></div>' +
      '<div><dt>Referencia</dt><dd><code id="envCorrelation">' + esc(model.diagnostic.correlationId || 'no-disponible') + '</code></dd></div></dl>' +
      '<div class="env-actions"><button type="button" id="envRetry">Reintentar validación</button>' +
      '<button type="button" id="envCopy">Copiar referencia</button>' +
      '<a href="../00_HUB/00_HUB%20-%20Sistema%20Don%20Ventas.html">Volver al HUB</a></div>' +
      '<p class="env-safe-note">No se cargaron datos, sesión ni servicios externos.</p></div></section>';
    document.body.classList.add('env-blocked-state');
    setOperational(false);
    document.getElementById('envRetry').addEventListener('click', function () { window.DVEnv.revalidate(); });
    document.getElementById('envCopy').addEventListener('click', function () {
      var value = model.diagnostic.correlationId || 'no-disponible';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value);
      this.textContent = 'Referencia copiada';
    });
    document.getElementById('envBlockedTitle').focus();
  }
  function clearBlocked() {
    document.body.classList.remove('env-blocked-state');
    block.innerHTML = '';
  }
  function render(snapshot) {
    ensureMounts();
    var model = Core.viewModel(snapshot);
    root.innerHTML =
      '<div class="env-indicator env-' + model.state.toLowerCase() + '" role="status" aria-live="polite" aria-atomic="true" ' +
      'aria-label="' + esc(model.label + '. ' + model.detail) + '">' +
      '<span class="env-icon" aria-hidden="true">' + esc(model.icon) + '</span>' +
      '<span class="env-copy"><strong>' + esc(model.label) + '</strong><span>' + esc(model.detail) + '</span></span></div>';
    document.documentElement.setAttribute('data-environment-state', model.state);
    if (model.state === 'BLOCKED') renderBlocked(model);
    else if (!model.operational) {
      clearBlocked();
      document.body.classList.add('env-validating-state');
      setOperational(false);
    } else {
      clearBlocked();
      document.body.classList.remove('env-validating-state');
      setOperational(true);
    }
    if (lastFingerprint && model.fingerprint && lastFingerprint !== model.fingerprint) {
      document.documentElement.setAttribute('data-environment-changed', 'true');
    }
    lastState = model.state;
    lastFingerprint = model.fingerprint;
    return model;
  }
  function loadScripts(paths) {
    return paths.reduce(function (chain, path) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var script = document.createElement('script');
          script.src = path;
          script.onload = resolve;
          script.onerror = function () { reject(new Error('APP_RESOURCE_UNAVAILABLE')); };
          document.body.appendChild(script);
        });
      });
    }, Promise.resolve());
  }
  function start(options) {
    if (started) return;
    started = true;
    options = options || {};
    ensureMounts();
    window.DVEnv.subscribe(function (snapshot) {
      var model = render(snapshot);
      if (model.operational && !loaded) {
        loaded = true;
        loadScripts(options.scripts || []).catch(function () {
          loaded = false;
        });
      }
    });
  }
  function handleGuardOutcome(result, actions) {
    actions = actions || {};
    if (!result || result.authorized) return result;
    var model = Core.guardModel(result);
    ensureMounts();
    if (model.outcome === 'DENY' || model.outcome === 'DENY_AND_LOG') {
      var message = model.detail + (model.outcome === 'DENY_AND_LOG' && model.correlationId ? ' Referencia: ' + model.correlationId : '');
      if (window.DVUtil) DVUtil.toast(message);
      return result;
    }
    return new Promise(function (resolve) {
      var isConfirm = model.outcome === 'CONFIRM_SANDBOX';
      guardDialog.innerHTML =
        '<div class="modal env-guard-modal on" role="dialog" aria-modal="true" aria-labelledby="envGuardTitle"><div class="mbox">' +
        '<h3 id="envGuardTitle">' + esc(model.title) + '</h3><p>' + esc(model.detail) + '</p>' +
        '<div class="mrow"><button class="btn sm" id="envGuardCancel">Cancelar</button>' +
        '<button class="btn solid sm" id="envGuardConfirm">' + (isConfirm ? 'Confirmar en SANDBOX' : 'Volver a autenticarme') + '</button></div></div></div>';
      document.getElementById('envGuardCancel').focus();
      document.getElementById('envGuardCancel').addEventListener('click', function () {
        guardDialog.innerHTML = '';
        resolve(result);
      });
      document.getElementById('envGuardConfirm').addEventListener('click', function () {
        guardDialog.innerHTML = '';
        var next = isConfirm && actions.confirm ? actions.confirm() : actions.reauth ? actions.reauth() : result;
        Promise.resolve(next).then(resolve);
      });
    });
  }
  window.DVEnvironmentIndicator = { start: start, render: render, handleGuardOutcome: handleGuardOutcome };
})();
