/* Don Ventas · Portal — bounded confirm-then-commit coordinator.
   It stores operation metadata only; payloads and credentials remain in closures. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DVAtomicMutations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var pending = new Map();
  var sequence = 0;

  function sameIdentity(options) {
    return options.fingerprint === options.getFingerprint() &&
      options.sessionIdentity === options.getSessionIdentity();
  }

  function run(options) {
    if (!options || !options.key || typeof options.execute !== 'function' ||
        typeof options.commit !== 'function' || typeof options.getFingerprint !== 'function' ||
        typeof options.getSessionIdentity !== 'function') {
      return Promise.resolve({ status: 'FAILED', code: 'ATOMIC_CONTEXT_INVALID', committed: false });
    }
    if (pending.has(options.key)) return pending.get(options.key);

    var operationId = 'operation-' + (++sequence);
    var task = Promise.resolve().then(options.execute).then(function (canonical) {
      if (!sameIdentity(options)) {
        return { status: 'STALE', code: 'ATOMIC_IDENTITY_STALE', committed: false, operationId: operationId };
      }
      options.commit(canonical);
      if (typeof options.success === 'function') options.success(canonical);
      return { status: 'SUCCEEDED', committed: true, value: canonical, operationId: operationId };
    }, function (error) {
      var cancelled = error && (error.name === 'AbortError' || error.code === 'WRITE_CANCELLED');
      var result = {
        status: cancelled ? 'CANCELLED' : 'FAILED',
        code: cancelled ? 'ATOMIC_CANCELLED' : 'ATOMIC_BACKEND_FAILED',
        committed: false,
        operationId: operationId
      };
      if (typeof options.failure === 'function') options.failure(result);
      return result;
    }).finally(function () {
      if (pending.get(options.key) === task) pending.delete(options.key);
    });
    pending.set(options.key, task);
    return task;
  }

  return {
    run: run,
    isPending: function (key) { return pending.has(key); },
    pendingCount: function () { return pending.size; }
  };
});
