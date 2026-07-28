/* Don Ventas · Portal — central fail-closed write guard (Issue #28).
   Authorization metadata only: payloads, credentials and session objects are forbidden. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DVWriteGuardCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var OUTCOMES = Object.freeze({
    ALLOW: 'ALLOW', DENY: 'DENY', DENY_AND_LOG: 'DENY_AND_LOG',
    REAUTH: 'REAUTH', CONFIRM_SANDBOX: 'CONFIRM_SANDBOX'
  });
  var EXECUTION = Object.freeze({
    NOT_EXECUTED: 'NOT_EXECUTED', PENDING: 'PENDING', SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED', CANCELLED: 'CANCELLED', STALE: 'STALE'
  });
  var CODES = Object.freeze({
    WRITE_ENV_UNRESOLVED: 'WRITE_ENV_UNRESOLVED',
    WRITE_ENV_BLOCKED: 'WRITE_ENV_BLOCKED',
    WRITE_MODE_FORBIDDEN: 'WRITE_MODE_FORBIDDEN',
    WRITE_POLICY_MISSING: 'WRITE_POLICY_MISSING',
    WRITE_POLICY_DENIED: 'WRITE_POLICY_DENIED',
    WRITE_SESSION_REQUIRED: 'WRITE_SESSION_REQUIRED',
    WRITE_SESSION_ENV_MISMATCH: 'WRITE_SESSION_ENV_MISMATCH',
    WRITE_BACKEND_MISMATCH: 'WRITE_BACKEND_MISMATCH',
    WRITE_SANDBOX_CONFIRMATION_REQUIRED: 'WRITE_SANDBOX_CONFIRMATION_REQUIRED',
    WRITE_DEMO_NETWORK_FORBIDDEN: 'WRITE_DEMO_NETWORK_FORBIDDEN',
    WRITE_DIRECT_BYPASS_BLOCKED: 'WRITE_DIRECT_BYPASS_BLOCKED',
    WRITE_CONTEXT_INVALID: 'WRITE_CONTEXT_INVALID',
    WRITE_EXECUTOR_FAILED: 'WRITE_EXECUTOR_FAILED',
    WRITE_EXECUTOR_MISSING: 'WRITE_EXECUTOR_MISSING',
    WRITE_EXECUTION_CANCELLED: 'WRITE_EXECUTION_CANCELLED',
    WRITE_EXECUTION_STALE: 'WRITE_EXECUTION_STALE',
    WRITE_ALREADY_PENDING: 'WRITE_ALREADY_PENDING'
  });
  var ALLOWED_FIELDS = [
    'action', 'resourceType', 'resourceId', 'environmentState', 'originClass',
    'environmentFingerprint', 'configVersion', 'environmentId', 'backendId',
    'backendClass', 'sessionFingerprint', 'writePolicy', 'requiresAuth',
    'destructive', 'externallyVisible', 'syntheticOnly', 'sandboxConfirmed',
    'correlationId'
  ];
  var PROHIBITED = /(^|_)(payload|token|key|secret|password|authorization|session|email|name|url|document|contract|payment|file|pii)(_|$)/i;

  function result(outcome, code, request) {
    return {
      outcome: outcome,
      authorized: outcome === OUTCOMES.ALLOW,
      execution: EXECUTION.NOT_EXECUTED,
      completed: false,
      executorCount: 0,
      diagnostic: {
        code: code,
        correlationId: request && request.correlationId || 'write-' + Date.now().toString(36),
        timestamp: new Date().toISOString(),
        environmentState: request && request.environmentState || 'UNRESOLVED',
        originClass: request && request.originClass || 'UNKNOWN',
        action: request && request.action || null,
        resourceType: request && request.resourceType || null,
        environmentId: request && request.environmentId ? String(request.environmentId).slice(0, 12) : null,
        backendId: request && request.backendId ? String(request.backendId).slice(0, 8) : null,
        outcome: outcome
      }
    };
  }
  function invalid(request) {
    if (!request || typeof request !== 'object' || !request.action || !request.resourceType) return true;
    return Object.keys(request).some(function (key) {
      return ALLOWED_FIELDS.indexOf(key) < 0 || (PROHIBITED.test(key) && key !== 'sessionFingerprint');
    });
  }
  function evaluate(request, policies) {
    if (invalid(request)) return result(OUTCOMES.DENY, CODES.WRITE_CONTEXT_INVALID, request);
    if (['UNRESOLVED', 'VALIDATING'].indexOf(request.environmentState) >= 0) {
      return result(OUTCOMES.DENY, CODES.WRITE_ENV_UNRESOLVED, request);
    }
    if (request.environmentState === 'BLOCKED') {
      return result(OUTCOMES.DENY_AND_LOG, CODES.WRITE_ENV_BLOCKED, request);
    }
    var policy = policies && policies[request.action];
    if (!policy) return result(OUTCOMES.DENY, CODES.WRITE_POLICY_MISSING, request);
    if ((policy.modes || []).indexOf(request.environmentState) < 0 ||
        (policy.origins || []).indexOf(request.originClass) < 0) {
      return result(OUTCOMES.DENY, CODES.WRITE_MODE_FORBIDDEN, request);
    }
    if ((policy.writePolicies || [policy.writePolicy]).indexOf(request.writePolicy) < 0) {
      return result(OUTCOMES.DENY, CODES.WRITE_POLICY_DENIED, request);
    }
    if (request.environmentState === 'DEMO') {
      if (!policy.synthetic || request.syntheticOnly !== true) {
        return result(OUTCOMES.DENY, CODES.WRITE_DEMO_NETWORK_FORBIDDEN, request);
      }
      if (request.backendId || request.backendClass && request.backendClass !== 'none') {
        return result(OUTCOMES.DENY_AND_LOG, CODES.WRITE_BACKEND_MISMATCH, request);
      }
    }
    if (request.environmentState === 'SANDBOX' && request.backendClass !== 'sandbox') {
      return result(OUTCOMES.DENY_AND_LOG, CODES.WRITE_BACKEND_MISMATCH, request);
    }
    if (request.environmentState === 'LIVE' && request.backendClass !== 'production') {
      return result(OUTCOMES.DENY_AND_LOG, CODES.WRITE_BACKEND_MISMATCH, request);
    }
    if (request.environmentState === 'LIVE' && request.syntheticOnly) {
      return result(OUTCOMES.DENY_AND_LOG, CODES.WRITE_MODE_FORBIDDEN, request);
    }
    if (policy.requiresAuth || request.requiresAuth) {
      if (!request.sessionFingerprint) return result(OUTCOMES.REAUTH, CODES.WRITE_SESSION_REQUIRED, request);
      if (request.sessionFingerprint !== request.environmentFingerprint) {
        return result(OUTCOMES.REAUTH, CODES.WRITE_SESSION_ENV_MISMATCH, request);
      }
    }
    if (request.environmentState === 'SANDBOX' &&
        (policy.confirmSandbox || request.destructive || request.externallyVisible) &&
        request.sandboxConfirmed !== true) {
      return result(OUTCOMES.CONFIRM_SANDBOX, CODES.WRITE_SANDBOX_CONFIRMATION_REQUIRED, request);
    }
    return result(OUTCOMES.ALLOW, 'WRITE_ALLOWED', request);
  }
  var pending = new Map();
  function pendingKey(request) {
    return [request.action, request.resourceType, request.resourceId || ''].join(':');
  }
  function executed(authorization, execution, patch) {
    return Object.assign({
      outcome: authorization.outcome,
      authorized: authorization.authorized,
      execution: execution,
      completed: execution === EXECUTION.SUCCEEDED,
      executorCount: 1,
      diagnostic: authorization.diagnostic
    }, patch || {});
  }
  function execute(request, executor, policies) {
    var authorization = evaluate(request, policies);
    if (!authorization.authorized) return authorization;
    if (typeof executor !== 'function') {
      return executed(authorization, EXECUTION.FAILED, { error: CODES.WRITE_EXECUTOR_MISSING, executorCount: 0 });
    }
    var controls = arguments[3] || {};
    var key = pendingKey(request);
    if (pending.has(key)) return pending.get(key);
    function current() {
      try { return typeof controls.isCurrent !== 'function' || controls.isCurrent(request) === true; }
      catch (_) { return false; }
    }
    function failed(code, error) {
      var cancelled = code === CODES.WRITE_EXECUTION_CANCELLED ||
        error && (error.name === 'AbortError' || error.code === 'WRITE_CANCELLED');
      return executed(authorization, cancelled ? EXECUTION.CANCELLED : EXECUTION.FAILED, {
        error: cancelled ? CODES.WRITE_EXECUTION_CANCELLED : CODES.WRITE_EXECUTOR_FAILED
      });
    }
    try {
      var value = executor();
      if (value && typeof value.then === 'function') {
        var operation = Promise.resolve(value).then(function (resolved) {
          if (!current()) return executed(authorization, EXECUTION.STALE, { error: CODES.WRITE_EXECUTION_STALE });
          return executed(authorization, EXECUTION.SUCCEEDED, { value: resolved });
        }, function (error) {
          return failed(null, error);
        }).finally(function () {
          if (pending.get(key) === operation) pending.delete(key);
        });
        pending.set(key, operation);
        return operation;
      }
      return executed(authorization, EXECUTION.SUCCEEDED, { value: value });
    } catch (e) {
      return failed(null, e);
    }
  }
  function pendingCount() { return pending.size; }
  return { OUTCOMES: OUTCOMES, EXECUTION: EXECUTION, CODES: CODES, evaluate: evaluate, execute: execute, pendingCount: pendingCount };
});

(function () {
  if (typeof window === 'undefined' || !window.DVWriteGuardCore) return;
  var C = window.DVWriteGuardCore;
  var policies = {};
  var localActions = [
    'session.login','session.role','session.logout','session.profile','ui.preference',
    'account.kind','account.layers','chat.save','iteration.bump','skill.proposal.approve',
    'skill.proposal.dismiss','skill.backlog.publish','period.update','labor.update',
    'work.track','catalog.update','incentive.update','referral.create','referral.pay',
    'block.approve','round.create','scope.request','member.invite','staff.invite',
    'member.resend','member.remove','invoice.request','assignment.update','payment.validate',
    'skill.publish','skill.revert','account.activate','account.register',
    'assignment.accept','assignment.reject','assignment.reassign','hr.base','hr.event.add',
    'hr.event.remove','review.create','review.publish','review.unpublish','review.retract',
    'review.consent'
  ];
  localActions.forEach(function (action) {
    policies[action] = {
      modes: ['DEMO', 'SANDBOX', 'LIVE'], origins: ['LOCAL', 'PREVIEW', 'PRODUCTION'],
      writePolicies: ['local-only', 'rls'], synthetic: true
    };
  });
  var backend = {
    'auth.otp': 1, 'auth.oauth': 1, 'auth.signout': 1, 'block.backend.approve': 1,
    'round.backend.create': 1, 'invitation.backend.create': 1, 'staff.backend.invite': 1,
    'assignment.backend.upsert': 1, 'payment.backend.validate': 1, 'skill.backend.publish': 1,
    'account.backend.register': 1, 'account.backend.activate': 1
  };
  Object.keys(backend).forEach(function (action) {
    policies[action] = {
      modes: ['SANDBOX', 'LIVE'], origins: ['LOCAL', 'PREVIEW', 'PRODUCTION'],
      writePolicy: action.indexOf('auth.') === 0 ? 'rls' : 'rls',
      requiresAuth: action.indexOf('auth.otp') !== 0 && action.indexOf('auth.oauth') !== 0,
      confirmSandbox: /invite|payment|activate|publish/.test(action)
    };
  });
  function context(action, resourceType, options) {
    options = options || {};
    var resolution = window.DVEnv && DVEnv.resolution ? DVEnv.resolution() : {};
    var config = resolution.config || {};
    var session = window.DVStore && DVStore.session ? DVStore.session() : null;
    return {
      action: action, resourceType: resourceType, resourceId: options.resourceId || null,
      environmentState: resolution.state || 'UNRESOLVED',
      originClass: resolution.originClass || 'UNKNOWN',
      environmentFingerprint: resolution.fingerprint || null,
      configVersion: config.configVersion || null, environmentId: config.environmentId || null,
      backendId: config.backendId || null, backendClass: config.backendClass || 'none',
      sessionFingerprint: session && session.environmentFingerprint || null,
      writePolicy: config.writePolicy || null, requiresAuth: !!options.requiresAuth,
      destructive: !!options.destructive, externallyVisible: !!options.externallyVisible,
      syntheticOnly: resolution.state === 'DEMO', sandboxConfirmed: options.sandboxConfirmed === true,
      correlationId: options.correlationId || null
    };
  }
  function execute(action, resourceType, options, executor) {
    var initial = context(action, resourceType, options);
    return C.execute(initial, executor, policies, {
      isCurrent: function () {
        var now = context(action, resourceType, options);
        return now.environmentFingerprint === initial.environmentFingerprint &&
          now.sessionFingerprint === initial.sessionFingerprint;
      }
    });
  }
  function run(action, resourceType, options, executor) {
    options = options || {};
    var r = execute(action, resourceType, options, executor);
    function handle(x) {
      if (x && x.execution === C.EXECUTION.SUCCEEDED) return x.value;
      if (x && x.authorized && x.execution !== C.EXECUTION.NOT_EXECUTED) {
        var safe = new Error(x.error || C.CODES.WRITE_EXECUTOR_FAILED);
        safe.code = x.error || C.CODES.WRITE_EXECUTOR_FAILED;
        safe.correlationId = x.diagnostic && x.diagnostic.correlationId;
        throw safe;
      }
      if (window.DVEnvironmentIndicator && DVEnvironmentIndicator.handleGuardOutcome) {
        return DVEnvironmentIndicator.handleGuardOutcome(x, {
          confirm: function () {
            return run(action, resourceType, Object.assign({}, options, { sandboxConfirmed: true }), executor);
          },
          reauth: function () {
            if (window.DVStore && DVStore.logout) DVStore.logout();
            var app = document.getElementById('app');
            var auth = document.getElementById('auth');
            var side = document.getElementById('side');
            var top = document.getElementById('topBar');
            if (app) app.classList.remove('on');
            if (side) side.innerHTML = '';
            if (top) top.innerHTML = '';
            if (auth) auth.style.display = 'grid';
            if (window.DVAuth && DVAuth.render) DVAuth.render();
            return x;
          }
        });
      }
      return x;
    }
    if (r && typeof r.then === 'function') return r.then(handle);
    return handle(r);
  }
  window.DVWriteGuard = { OUTCOMES: C.OUTCOMES, EXECUTION: C.EXECUTION, CODES: C.CODES, policies: policies, context: context, execute: execute, run: run };
})();
