// Test helper: network isolation for property-based and unit tests.
//
// Provides a factory that builds a stub suitable for replacing the global
// `fetch`. The stub returns a configurable `Response` (status + body) and
// records every invocation so tests can assert call counts (e.g. zero calls
// for endpoints that must not contact upstream, like GET /health).
//
// Usage:
//   import { createFetchMock, installFetchMock } from './helpers/fetch-mock.js';
//
//   const mock = createFetchMock({ status: 200, body: [[['hi', 'hi']]] });
//   globalThis.fetch = mock;
//   // ...exercise code...
//   expect(mock.callCount).toBe(0);
//
//   // or install + auto-restore:
//   const restore = installFetchMock({ status: 503, body: 'upstream down' });
//   // ...
//   restore();

/**
 * Serialize a body value into a string suitable for the Response constructor.
 * Objects and arrays are JSON-stringified; strings (and other primitives) are
 * passed through as text. `null`/`undefined` produce an empty body.
 *
 * @param {*} body
 * @returns {string|null}
 */
function serializeBody(body) {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body;
  if (typeof body === 'object') return JSON.stringify(body);
  return String(body);
}

/**
 * @typedef {Object} FetchMockConfig
 * @property {number} [status=200] - HTTP status code for the returned Response.
 * @property {*} [body] - Body to return. Object/array is JSON-serialized; a
 *   string is returned as-is. Defaults to an empty body.
 * @property {Record<string,string>} [headers] - Optional response headers.
 */

/**
 * @typedef {Object} FetchMockExtras
 * @property {number} callCount - Number of times the stub has been invoked.
 * @property {Array<{url: *, options: *}>} calls - Recorded invocations.
 * @property {() => void} reset - Clear recorded calls and reset callCount to 0.
 */

/**
 * Create a stub function that can replace the global `fetch`.
 *
 * The stub resolves to a `Response` built from the supplied config and tracks
 * every call. Each invocation is recorded in the `.calls` array and reflected
 * in the `.callCount` property so tests can assert exact (including zero)
 * upstream contact.
 *
 * @param {FetchMockConfig} [config]
 * @returns {((url: *, options?: *) => Promise<Response>) & FetchMockExtras}
 */
export function createFetchMock(config = {}) {
  const { status = 200, body, headers } = config;

  const stub = async function fetchStub(url, options) {
    stub.calls.push({ url, options });
    stub.callCount = stub.calls.length;
    return new Response(serializeBody(body), { status, headers });
  };

  stub.calls = [];
  stub.callCount = 0;
  stub.reset = function reset() {
    stub.calls.length = 0;
    stub.callCount = 0;
  };

  return stub;
}

/**
 * Install a fetch mock onto `globalThis.fetch`, returning a restore function
 * that puts the previous `fetch` back. The installed stub is exposed on the
 * restore function as `restore.mock` for convenient assertions.
 *
 * @param {FetchMockConfig} [config]
 * @returns {(() => void) & { mock: ReturnType<typeof createFetchMock> }}
 */
export function installFetchMock(config = {}) {
  const previous = globalThis.fetch;
  const mock = createFetchMock(config);
  globalThis.fetch = mock;

  const restore = function restore() {
    globalThis.fetch = previous;
  };
  restore.mock = mock;
  return restore;
}

export default createFetchMock;
