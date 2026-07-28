/* Don Ventas · Portal — resolución fail-safe de ambiente (Issue #26).
   Este módulo no contiene secretos privilegiados ni contacta backends. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DVEnvCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATES = Object.freeze({
    UNRESOLVED: 'UNRESOLVED', VALIDATING: 'VALIDATING', DEMO: 'DEMO',
    SANDBOX: 'SANDBOX', LIVE: 'LIVE', BLOCKED: 'BLOCKED'
  });
  var ORIGINS = Object.freeze({
    PRODUCTION: 'PRODUCTION', PREVIEW: 'PREVIEW', LOCAL: 'LOCAL', UNKNOWN: 'UNKNOWN'
  });
  var MODES = [STATES.DEMO, STATES.SANDBOX, STATES.LIVE];
  var ERRORS = Object.freeze({
    ENV_UNRESOLVED: 'ENV_UNRESOLVED',
    ENV_ORIGIN_UNKNOWN: 'ENV_ORIGIN_UNKNOWN',
    ENV_CONFIG_MISSING: 'ENV_CONFIG_MISSING',
    ENV_CONFIG_PARTIAL: 'ENV_CONFIG_PARTIAL',
    ENV_CONFIG_INVALID: 'ENV_CONFIG_INVALID',
    ENV_CONFIG_STALE: 'ENV_CONFIG_STALE',
    ENV_MODE_FORBIDDEN: 'ENV_MODE_FORBIDDEN',
    ENV_BACKEND_MISMATCH: 'ENV_BACKEND_MISMATCH',
    ENV_PROD_BACKEND_FORBIDDEN: 'ENV_PROD_BACKEND_FORBIDDEN',
    ENV_PROD_DEMO_FORBIDDEN: 'ENV_PROD_DEMO_FORBIDDEN',
    SESSION_ENV_MISMATCH: 'SESSION_ENV_MISMATCH'
  });
  var SECRET_FIELDS = /^(service_role|serviceRole|DATABASE_URL|dbPassword|stripeSecret|webhookSecret|smtpPassword|privateKey|adminToken)$/i;

  function correlationId(random) {
    var bytes = random ? random(12) : null;
    if (bytes && bytes.length) return Array.prototype.map.call(bytes, function (n) { return Number(n).toString(16).padStart(2, '0'); }).join('');
    return 'env-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function safeError(code, context) {
    context = context || {};
    return {
      code: code,
      correlationId: context.correlationId || correlationId(context.random),
      timestamp: new Date(context.now || Date.now()).toISOString(),
      originClass: context.originClass || ORIGINS.UNKNOWN,
      mode: context.mode || STATES.BLOCKED,
      configVersion: context.configVersion || null,
      backendId: context.backendId ? String(context.backendId).slice(0, 8) : null,
      result: 'BLOCKED'
    };
  }
  function hostOf(origin) {
    try { return new URL(origin).hostname.toLowerCase(); } catch (e) { return ''; }
  }
  function normalizeOrigin(origin) {
    try {
      var u = new URL(origin);
      return u.protocol.toLowerCase() + '//' + u.host.toLowerCase();
    } catch (e) { return ''; }
  }
  function classifyOrigin(origin, policy) {
    policy = policy || {};
    var normalized = normalizeOrigin(origin);
    var host = hostOf(origin);
    if (!normalized || !host) return ORIGINS.UNKNOWN;
    if ((policy.productionOrigins || []).map(normalizeOrigin).indexOf(normalized) >= 0) return ORIGINS.PRODUCTION;
    if ((policy.localHosts || ['localhost', '127.0.0.1', '::1']).indexOf(host) >= 0) return ORIGINS.LOCAL;
    if ((policy.previewOrigins || []).map(normalizeOrigin).indexOf(normalized) >= 0) return ORIGINS.PREVIEW;
    if ((policy.previewHostSuffixes || ['.vercel.app']).some(function (suffix) { return host.endsWith(suffix); })) return ORIGINS.PREVIEW;
    return ORIGINS.UNKNOWN;
  }
  function hasSecretField(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some(function (key) {
      return SECRET_FIELDS.test(key) || hasSecretField(value[key]);
    });
  }
  function requiredMissing(config) {
    var required = ['configVersion', 'environmentId', 'mode', 'allowedOrigins',
      'allowedBackendIds', 'deploymentClass', 'features', 'writePolicy'];
    return required.some(function (key) {
      return config[key] === undefined || config[key] === null || config[key] === '';
    });
  }
  function validateConfig(config, context) {
    context = context || {};
    if (!config) return { ok: false, code: ERRORS.ENV_CONFIG_MISSING };
    var url = String(config.backendUrl || '');
    var key = String(config.publicClientKey || '');
    if (requiredMissing(config) || (!!url !== !!key)) return { ok: false, code: ERRORS.ENV_CONFIG_PARTIAL };
    if (hasSecretField(config) || !Array.isArray(config.allowedOrigins) ||
        !Array.isArray(config.allowedBackendIds) || !MODES.includes(config.mode) ||
        !/^(?:[1-9]\d*|[A-Z][A-Z0-9._-]*)$/.test(String(config.configVersion)) ||
        ['production', 'preview', 'local'].indexOf(config.deploymentClass) < 0) {
      return { ok: false, code: ERRORS.ENV_CONFIG_INVALID };
    }
    var now = Number(context.now || Date.now());
    if ((config.configIssuedAt && Date.parse(config.configIssuedAt) > now) ||
        (config.configExpiresAt && Date.parse(config.configExpiresAt) <= now)) {
      return { ok: false, code: ERRORS.ENV_CONFIG_STALE };
    }
    var normalized = normalizeOrigin(context.origin);
    if (!normalized || config.allowedOrigins.map(normalizeOrigin).indexOf(normalized) < 0) {
      return { ok: false, code: ERRORS.ENV_MODE_FORBIDDEN };
    }
    if (config.mode !== STATES.DEMO) {
      if (!config.backendId || !url || !key) return { ok: false, code: ERRORS.ENV_CONFIG_PARTIAL };
      if (config.allowedBackendIds.indexOf(config.backendId) < 0 ||
          !context.observedBackendId || context.observedBackendId !== config.backendId) {
        return { ok: false, code: ERRORS.ENV_BACKEND_MISMATCH };
      }
      if (config.mode === STATES.LIVE && config.backendClass !== 'production') {
        return { ok: false, code: ERRORS.ENV_BACKEND_MISMATCH };
      }
      if (config.mode === STATES.SANDBOX && config.backendClass !== 'sandbox') {
        return { ok: false, code: ERRORS.ENV_BACKEND_MISMATCH };
      }
    } else if (url || key || config.backendId) {
      return { ok: false, code: ERRORS.ENV_CONFIG_INVALID };
    }
    return { ok: true };
  }
  function blocked(code, originClass, config, context) {
    return {
      state: STATES.BLOCKED,
      originClass: originClass,
      config: null,
      fingerprint: null,
      error: safeError(code, {
        now: context && context.now,
        random: context && context.random,
        originClass: originClass,
        mode: config && config.mode,
        configVersion: config && config.configVersion,
        backendId: config && config.backendId
      })
    };
  }
  function fingerprint(config) {
    return [config.schemaVersion || 'legacy', config.configVersion,
      config.environmentId, config.backendId || 'local', config.mode]
      .map(function (value) { return encodeURIComponent(String(value)); }).join('.');
  }
  function resolveEnvironment(input) {
    input = input || {};
    var originClass = classifyOrigin(input.origin, input.originPolicy);
    if (originClass === ORIGINS.UNKNOWN) return blocked(ERRORS.ENV_ORIGIN_UNKNOWN, originClass, input.config, input);
    var validation = validateConfig(input.config, input);
    if (!validation.ok) return blocked(validation.code, originClass, input.config, input);
    var config = input.config;
    var expectedClass = originClass.toLowerCase();
    if (config.deploymentClass !== expectedClass) return blocked(ERRORS.ENV_MODE_FORBIDDEN, originClass, config, input);
    if (originClass === ORIGINS.PRODUCTION) {
      if (config.mode === STATES.DEMO) return blocked(ERRORS.ENV_PROD_DEMO_FORBIDDEN, originClass, config, input);
      if (config.mode !== STATES.LIVE || config.backendClass !== 'production') {
        return blocked(ERRORS.ENV_PROD_BACKEND_FORBIDDEN, originClass, config, input);
      }
    }
    if ((originClass === ORIGINS.PREVIEW || originClass === ORIGINS.LOCAL) && config.mode === STATES.LIVE) {
      return blocked(ERRORS.ENV_PROD_BACKEND_FORBIDDEN, originClass, config, input);
    }
    if (originClass === ORIGINS.PREVIEW && [STATES.DEMO, STATES.SANDBOX].indexOf(config.mode) < 0) {
      return blocked(ERRORS.ENV_MODE_FORBIDDEN, originClass, config, input);
    }
    if (originClass === ORIGINS.LOCAL && [STATES.DEMO, STATES.SANDBOX].indexOf(config.mode) < 0) {
      return blocked(ERRORS.ENV_MODE_FORBIDDEN, originClass, config, input);
    }
    return {
      state: config.mode,
      originClass: originClass,
      config: config,
      fingerprint: fingerprint(config),
      error: null
    };
  }
  function sessionMatches(session, expectedFingerprint) {
    return !!session && session.environmentFingerprint === expectedFingerprint;
  }
  function createMemoryStorage() {
    var values = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      removeItem: function (key) { delete values[key]; },
      key: function (index) { return Object.keys(values)[index] || null; },
      get length() { return Object.keys(values).length; }
    };
  }
  function scopedStorage(storage, environmentFingerprint) {
    var prefix = 'dvportal:' + environmentFingerprint + ':';
    return {
      prefix: prefix,
      keyFor: function (key) { return prefix + key; },
      getItem: function (key) { return storage.getItem(prefix + key); },
      setItem: function (key, value) { storage.setItem(prefix + key, value); },
      removeItem: function (key) { storage.removeItem(prefix + key); }
    };
  }
  function invalidatePreviousNamespace(storage, nextFingerprint) {
    var activeKey = 'dvportal:environment-active';
    var previous = storage.getItem(activeKey);
    if (previous && previous !== nextFingerprint) {
      var prefix = 'dvportal:' + previous + ':';
      var remove = [];
      for (var i = 0; i < storage.length; i += 1) {
        var key = storage.key(i);
        if (key && key.indexOf(prefix) === 0) remove.push(key);
      }
      remove.forEach(function (key) { storage.removeItem(key); });
    }
    storage.setItem(activeKey, nextFingerprint);
    return previous && previous !== nextFingerprint;
  }
  function canCreateClient(resolution) {
    return !!resolution && (resolution.state === STATES.SANDBOX || resolution.state === STATES.LIVE) &&
      !!resolution.fingerprint && !resolution.error;
  }
  function createClientController(factory) {
    var active = null;
    var activeFingerprint = null;
    return {
      apply: function (resolution) {
        if (activeFingerprint && activeFingerprint !== resolution.fingerprint && active && typeof active.destroy === 'function') {
          active.destroy();
        }
        if (!canCreateClient(resolution)) {
          active = null;
          activeFingerprint = resolution && resolution.fingerprint;
          return null;
        }
        if (!active || activeFingerprint !== resolution.fingerprint) active = factory(resolution);
        activeFingerprint = resolution.fingerprint;
        return active;
      },
      current: function () { return active; },
      fingerprint: function () { return activeFingerprint; }
    };
  }
  function retainModeAfterNetworkFailure(resolution) {
    return {
      state: resolution.state,
      fingerprint: resolution.fingerprint,
      error: { code: 'BACKEND_UNREACHABLE', correlationId: correlationId() }
    };
  }
  return {
    STATES: STATES, ORIGINS: ORIGINS, ERRORS: ERRORS,
    classifyOrigin: classifyOrigin, validateConfig: validateConfig,
    resolveEnvironment: resolveEnvironment, fingerprint: fingerprint,
    safeError: safeError, sessionMatches: sessionMatches,
    scopedStorage: scopedStorage, invalidatePreviousNamespace: invalidatePreviousNamespace,
    canCreateClient: canCreateClient, createClientController: createClientController,
    retainModeAfterNetworkFailure: retainModeAfterNetworkFailure,
    createMemoryStorage: createMemoryStorage
  };
});

/* Product bootstrap. Release config and private allowlist evidence are injected
   before this module. Missing evidence fails closed. */
(function () {
  if (typeof window === 'undefined' || !window.DVEnvCore || !window.DVReleaseConfig) return;
  var C = window.DVEnvCore;
  var origin = window.location.origin;
  var releaseConfig = window.DV_PORTAL_RELEASE_CONFIG;
  var binding = window.DV_PORTAL_RELEASE_BINDING || {};
  var originPolicy = {
    productionOrigins: (binding.productionOrigins || []).slice(),
    previewOrigins: (binding.previewOrigins || []).slice(),
    previewHostSuffixes: (binding.previewHostSuffixes || []).slice(),
    localHosts: (binding.localHosts || ['localhost', '127.0.0.1', '::1']).slice()
  };
  var originClass = C.classifyOrigin(origin, originPolicy);
  var originClassName = originClass ? originClass.toLowerCase() : 'unknown';
  var origins = (binding.origins || []).slice();
  var backendIds = (binding.backendIds || []).slice();
  var validation = window.DVReleaseConfig.validate(releaseConfig, {
    originAllowed: origins.map(function (value) {
      try { return new URL(value).origin; } catch (e) { return ''; }
    }).indexOf(origin) >= 0,
    backendAllowed: !!releaseConfig && backendIds.indexOf(releaseConfig.backendId) >= 0,
    observedBackendId: binding.observedBackendId || null,
    bindingCount: Number(binding.bindingCount || 1)
  });
  var config = validation.ok ? window.DVReleaseConfig.toEnvironmentConfig(releaseConfig, {
    origins: origins, backendIds: backendIds, originClass: originClassName
  }) : null;
  var observedBackendId = binding.observedBackendId || null;
  var current = { state: C.STATES.UNRESOLVED, originClass: null, config: null, fingerprint: null, error: null };
  var listeners = [];
  var resolutionInput = {
    origin: origin,
    config: config,
    observedBackendId: observedBackendId,
    originPolicy: originPolicy
  };
  current.state = C.STATES.VALIDATING;
  var resolved = validation.ok ? C.resolveEnvironment(resolutionInput) : {
    state: C.STATES.BLOCKED,
    originClass: originClass,
    config: null,
    fingerprint: null,
    error: C.safeError('ENV_CONFIG_' + validation.code, {
      originClass: originClass,
      mode: C.STATES.BLOCKED,
      configVersion: releaseConfig && releaseConfig.configVersion,
      backendId: releaseConfig && releaseConfig.backendId
    })
  };
  Object.assign(current, resolved);
  var storage = null;
  if (resolved.fingerprint) {
    C.invalidatePreviousNamespace(window.localStorage, resolved.fingerprint);
    storage = C.scopedStorage(window.localStorage, resolved.fingerprint);
  }
  function publicSnapshot() {
    return Object.freeze({
      state: current.state,
      originClass: current.originClass,
      fingerprint: current.fingerprint,
      diagnostic: current.error ? Object.freeze({
        code: current.error.code,
        correlationId: current.error.correlationId
      }) : null
    });
  }
  function notify() {
    var snapshot = publicSnapshot();
    listeners.slice().forEach(function (listener) {
      try { listener(snapshot); } catch (e) { }
    });
    try { window.dispatchEvent(new CustomEvent('dv:environment', { detail: snapshot })); } catch (e) { }
  }
  function applyResolution(next) {
    Object.assign(current, next);
    if (next.fingerprint) {
      C.invalidatePreviousNamespace(window.localStorage, next.fingerprint);
      storage = C.scopedStorage(window.localStorage, next.fingerprint);
    } else {
      storage = null;
    }
    window.DVEnv.storage = storage;
    notify();
    return publicSnapshot();
  }
  function revalidate(overrides) {
    overrides = overrides || {};
    current.state = C.STATES.VALIDATING;
    current.error = null;
    notify();
    var input = Object.assign({}, resolutionInput, overrides);
    resolutionInput = input;
    return applyResolution(C.resolveEnvironment(input));
  }
  window.DVEnv = {
    STATES: C.STATES,
    state: function () { return current.state; },
    mode: function () { return current.state; },
    resolution: function () { return current; },
    snapshot: publicSnapshot,
    subscribe: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.push(listener);
      listener(publicSnapshot());
      var active = true;
      return function () {
        if (!active) return;
        active = false;
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    revalidate: revalidate,
    isBackend: function () { return current.state === C.STATES.SANDBOX || current.state === C.STATES.LIVE; },
    isDemo: function () { return current.state === C.STATES.DEMO; },
    storage: storage,
    storageKey: function (key) { return storage ? storage.keyFor(key) : 'dvportal:blocked:' + key; },
    validateSession: function (session) {
      if (!C.sessionMatches(session, current.fingerprint)) {
        return { ok: false, error: C.safeError(C.ERRORS.SESSION_ENV_MISMATCH, current) };
      }
      return { ok: true };
    },
    fingerprint: function () { return current.fingerprint; },
    reportNetworkFailure: function () {
      return { mode: current.state, error: { code: 'BACKEND_UNREACHABLE', correlationId: C.safeError('BACKEND_UNREACHABLE', current).correlationId } };
    }
  };
  window.DV_SUPA = resolved.config ? Object.assign({}, window.DV_SUPA || {}, {
    URL: resolved.config.backendUrl || '',
    ANON: resolved.config.publicClientKey || '',
    BACKEND_ID: resolved.config.backendId || ''
  }) : { URL: '', ANON: '', BACKEND_ID: '' };
})();
