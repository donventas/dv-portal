/* Product-owned public release configuration validator. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DVReleaseConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var RESULTS = Object.freeze({
    VALID: 'VALID', MISSING: 'MISSING', PARTIAL: 'PARTIAL',
    MALFORMED: 'MALFORMED', STALE: 'STALE',
    BACKEND_MISMATCH: 'BACKEND_MISMATCH',
    ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
    VERSION_UNSUPPORTED: 'VERSION_UNSUPPORTED',
    AMBIGUOUS: 'AMBIGUOUS', BLOCKED: 'BLOCKED'
  });
  var MODES = ['DEMO', 'SANDBOX', 'LIVE'];
  var BACKEND_CLASSES = ['none', 'sandbox', 'production'];
  var FORBIDDEN = /service.?role|password|secret|token|session|private.?key|database.?url|webhook/i;
  var REQUIRED = [
    'schemaVersion', 'configVersion', 'environmentId', 'declaredMode',
    'backendId', 'backendClass', 'allowlistVersion', 'issuedAt',
    'expiresAt', 'buildCommit', 'publicClient'
  ];
  function result(code) { return { ok: code === RESULTS.VALID, code: code }; }
  function hasForbidden(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some(function (key) {
      return FORBIDDEN.test(key) || hasForbidden(value[key]);
    });
  }
  function validate(config, context) {
    context = context || {};
    if (config === undefined || config === null) return result(RESULTS.MISSING);
    if (typeof config !== 'object' || Array.isArray(config)) return result(RESULTS.MALFORMED);
    if (REQUIRED.some(function (key) { return config[key] === undefined || config[key] === null; })) {
      return result(RESULTS.PARTIAL);
    }
    if (hasForbidden(config) || config.schemaVersion !== 'CONFIG_SCHEMA_V1' ||
        !/^[A-Z0-9._-]+$/.test(String(config.configVersion)) ||
        !/^[A-Z0-9._-]+$/.test(String(config.environmentId)) ||
        MODES.indexOf(config.declaredMode) < 0 ||
        BACKEND_CLASSES.indexOf(config.backendClass) < 0 ||
        typeof config.publicClient !== 'object') {
      return result(config.schemaVersion !== 'CONFIG_SCHEMA_V1' ?
        RESULTS.VERSION_UNSUPPORTED : RESULTS.MALFORMED);
    }
    var issued = Date.parse(config.issuedAt);
    var expires = Date.parse(config.expiresAt);
    var now = Number(context.now || Date.now());
    if (!Number.isFinite(issued) || !Number.isFinite(expires)) return result(RESULTS.MALFORMED);
    if (issued > now || expires <= now) return result(RESULTS.STALE);
    if (config.declaredMode === 'DEMO') {
      if (config.backendId || config.backendClass !== 'none' ||
          config.publicClient.endpoint || config.publicClient.publicKey) return result(RESULTS.MALFORMED);
    } else if (!config.backendId || !config.publicClient.endpoint || !config.publicClient.publicKey) {
      return result(RESULTS.PARTIAL);
    }
    if (context.bindingCount > 1) return result(RESULTS.AMBIGUOUS);
    if (!context.originAllowed) return result(RESULTS.ORIGIN_MISMATCH);
    if (config.declaredMode !== 'DEMO' &&
        (!context.backendAllowed || context.observedBackendId !== config.backendId)) {
      return result(RESULTS.BACKEND_MISMATCH);
    }
    return result(RESULTS.VALID);
  }
  function fingerprint(config) {
    return [
      config.schemaVersion, config.configVersion, config.environmentId,
      config.backendId || 'local', config.declaredMode
    ].map(function (value) { return encodeURIComponent(String(value)); }).join('.');
  }
  function toEnvironmentConfig(config, binding) {
    binding = binding || {};
    return {
      schemaVersion: config.schemaVersion,
      configVersion: config.configVersion,
      environmentId: config.environmentId,
      mode: config.declaredMode,
      backendId: config.backendId,
      backendClass: config.backendClass,
      backendUrl: config.publicClient.endpoint || '',
      publicClientKey: config.publicClient.publicKey || '',
      allowedOrigins: (binding.origins || []).slice(),
      allowedBackendIds: (binding.backendIds || []).slice(),
      deploymentClass: binding.originClass,
      configIssuedAt: config.issuedAt,
      configExpiresAt: config.expiresAt,
      features: Object.freeze({ syntheticSeed: config.declaredMode === 'DEMO' }),
      writePolicy: config.declaredMode === 'DEMO' ? 'local-only' : 'rls',
      releaseBuildCommit: config.buildCommit,
      allowlistVersion: config.allowlistVersion
    };
  }
  return { RESULTS: RESULTS, validate: validate, fingerprint: fingerprint,
    toEnvironmentConfig: toEnvironmentConfig };
});
