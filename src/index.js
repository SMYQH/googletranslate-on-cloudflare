/**
 * Google Translate Proxy - Cloudflare Worker
 *
 * A thin, stateless reverse proxy in front of `translate.googleapis.com`.
 * It forwards requests under `/translate_a/`, parses the upstream array-based
 * response into a single translated string, and serializes the result into a
 * predictable `{code, msg, text}` shape.
 *
 * See .kiro/specs/google-translate-proxy/design.md for the full design.
 */

const UPSTREAM_HOSTNAME = 'translate.googleapis.com';
const TRANSLATE_PATH_PREFIX = '/translate_a/';

/**
 * Build a Response that ALWAYS carries `content-type: application/json`.
 * Every exit path of the Worker goes through this helper so the content-type
 * invariant (Requirement 1.3 / Property 2) cannot be accidentally bypassed.
 *
 * @param {object} obj - the Standardized_Response object to serialize
 * @param {number} status - the HTTP status code
 * @returns {Response}
 */
export function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Response_Parser. Pure function over the parsed upstream JSON.
 *
 * Reads `jsonData[0]` (the segment list), maps each segment to its first
 * element, drops falsy values, and joins in order with the empty string.
 *
 * Requirement 4.1: jsonData[0] is the segment list.
 * Requirement 4.2: segment[0] is the translated chunk, concatenated in order.
 * Requirement 4.3: filter(Boolean) drops empty/absent first elements.
 *
 * @param {Array} jsonData - the upstream response array
 * @returns {string} concatenated translated text
 */
export function parseTranslation(jsonData) {
  const segments = (jsonData && jsonData[0]) || [];
  return segments
    .map((segment) => segment[0])
    .filter(Boolean)
    .join('');
}

/**
 * Build the upstream URL from the incoming request URL by rewriting the
 * hostname to `translate.googleapis.com` while preserving the original path
 * and query string unchanged.
 *
 * Requirement 2.1: hostname set to translate.googleapis.com.
 * Requirement 2.2: preserve original path and query parameters.
 *
 * @param {string} requestUrl - the incoming request URL string
 * @returns {string} the upstream URL string
 */
export function buildUpstreamUrl(requestUrl) {
  const url = new URL(requestUrl);
  url.hostname = UPSTREAM_HOSTNAME;
  return url.toString();
}

/**
 * The Worker fetch handler. Routes, proxies, parses, and serializes.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    // Router (Requirement 1.1, 1.2): only `/translate_a/` paths are proxied.
    if (!url.pathname.startsWith(TRANSLATE_PATH_PREFIX)) {
      return jsonResponse({ code: 1, msg: 'Invalid path' }, 404);
    }

    // Proxy forwarder (Requirement 2.1, 2.2, 2.3): rewrite hostname,
    // preserve path + query, use GET.
    const upstreamUrl = buildUpstreamUrl(request.url);
    const upstreamResponse = await fetch(upstreamUrl, { method: 'GET' });

    // Upstream error (Requirement 5.1): non-200 -> {code:1, msg:<body>} status 200.
    if (upstreamResponse.status !== 200) {
      const errorText = await upstreamResponse.text();
      return jsonResponse({ code: 1, msg: errorText }, 200);
    }

    // Success (Requirement 4.4): parse and serialize.
    const jsonData = await upstreamResponse.json();
    const text = parseTranslation(jsonData);
    return jsonResponse({ code: 0, msg: 'ok', text }, 200);
  } catch (e) {
    // Exception (Requirement 5.2): {code:1, msg:e.message} status 500.
    return jsonResponse({ code: 1, msg: e.message }, 500);
  }
}

/**
 * Translate_Endpoint core handler. Validates the required `q` parameter
 * before any upstream call, then proxies to `translate.googleapis.com`,
 * parses the array-based response, and serializes the `{code, msg, text}`
 * envelope.
 *
 * This function deliberately does NOT wrap its body in try/catch: exceptions
 * (e.g. network failures, malformed upstream JSON) bubble up to the
 * middleware shell which owns unified error handling and logging.
 *
 * Requirement 6.8: missing/empty `q` -> 400 {code:1, msg:'Missing required query parameter: q'}
 *                  before any upstream fetch.
 * Requirement 5.1: rewrite hostname, preserve path + query, GET the upstream.
 * Requirement 5.3: upstream non-200 -> 200 {code:1, msg:<body>}.
 * Requirement 5.2: upstream 200 -> 200 {code:0, msg:'ok', text}.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleTranslate(request) {
  const url = new URL(request.url);

  // Parameter validation (Requirement 6.8): reject before any upstream call.
  const validation = validateTranslateParams(url);
  if (!validation.valid) {
    return jsonResponse({ code: 1, msg: 'Missing required query parameter: q' }, 400);
  }

  // Proxy forwarder (Requirement 5.1): rewrite hostname, preserve path + query, GET.
  const upstreamUrl = buildUpstreamUrl(request.url);
  const upstreamResponse = await fetch(upstreamUrl, { method: 'GET' });

  // Upstream error (Requirement 5.3): non-200 -> {code:1, msg:<body>} status 200.
  if (upstreamResponse.status !== 200) {
    const errorText = await upstreamResponse.text();
    return jsonResponse({ code: 1, msg: errorText }, 200);
  }

  // Success (Requirement 5.2): parse and serialize.
  const jsonData = await upstreamResponse.json();
  const text = parseTranslation(jsonData);
  return jsonResponse({ code: 0, msg: 'ok', text }, 200);
}

/**
 * Generate a unique Request_ID for request tracing.
 *
 * Uses the Workers runtime built-in Web Crypto API to produce an RFC 4122
 * UUID v4. No third-party dependency is required.
 *
 * Requirement 4.1: each incoming request gets a unique Request_ID.
 *
 * @returns {string} a UUID v4 string
 */
export function generateRequestId() {
  return crypto.randomUUID();
}

/**
 * Build a structured log record (pure function) for a completed request.
 *
 * Extracts the method from `request.method` and the path from the request
 * URL's pathname, then assembles the record alongside the response status
 * and processing duration.
 *
 * Requirement 4.2: structured log includes Request_ID, method, path, status,
 * and processing duration.
 *
 * @param {string} requestId - the Request_ID for this request
 * @param {Request} request - the incoming request
 * @param {number} status - the response HTTP status code
 * @param {number} durationMs - processing duration in milliseconds
 * @returns {{requestId: string, method: string, path: string, status: number, durationMs: number}}
 */
export function buildLogRecord(requestId, request, status, durationMs) {
  const path = new URL(request.url).pathname;
  return {
    requestId,
    method: request.method,
    path,
    status,
    durationMs,
  };
}

/**
 * Emit a structured JSON request log line.
 *
 * Requirement 4.2: output a single-line structured JSON log on completion.
 *
 * @param {{requestId: string, method: string, path: string, status: number, durationMs: number}} record
 * @returns {void}
 */
export function logRequest(record) {
  console.log(JSON.stringify(record));
}

/**
 * Emit a structured JSON error log line.
 *
 * Requirement 4.4: on exception, output a structured JSON log containing the
 * Request_ID and the error information.
 *
 * @param {string} requestId - the Request_ID for this request
 * @param {Request} request - the incoming request
 * @param {Error} error - the thrown error
 * @returns {void}
 */
export function logError(requestId, request, error) {
  const url = new URL(request.url);
  console.error(
    JSON.stringify({
      requestId,
      level: 'error',
      method: request.method,
      path: url.pathname,
      error: error.message,
    })
  );
}

/**
 * CORS header set applied to responses leaving the Worker.
 *
 * Requirement 1.1: include `Access-Control-Allow-Origin`.
 * Requirement 1.3: include `Access-Control-Allow-Methods` / `Access-Control-Allow-Headers`.
 * Requirement 1.4: include `Access-Control-Max-Age` (preflight cache seconds).
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/**
 * Security header set applied to every response leaving the Worker.
 *
 * Requirement 2.1: `X-Content-Type-Options: nosniff`.
 * Requirement 2.2: `X-Frame-Options: DENY`.
 * Requirement 2.3: `Referrer-Policy`.
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Build the CORS preflight response.
 *
 * Returns a 204 No Content response with an empty body carrying the preflight
 * CORS headers (`Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`,
 * `Access-Control-Max-Age`). `Access-Control-Allow-Origin` is included as well.
 *
 * Requirement 1.2: OPTIONS -> 204 with no body.
 * Requirement 1.3 / 1.4: include preflight CORS headers.
 *
 * @returns {Response}
 */
export function buildPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS },
  });
}

/**
 * Single egress decoration. Clone the response preserving status, statusText,
 * body and existing headers (including `content-type`), then merge in
 * `Access-Control-Allow-Origin`, all `SECURITY_HEADERS`, and `X-Request-ID`.
 *
 * The body, status and any existing `content-type` are left untouched; only
 * new headers are added.
 *
 * Requirement 1.1: include `Access-Control-Allow-Origin`.
 * Requirement 2.1, 2.2, 2.3: include security headers.
 * Requirement 2.4: preserve `content-type: application/json`.
 * Requirement 4.3: include `X-Request-ID` carrying the Request_ID.
 *
 * @param {Response} response - the response to decorate
 * @param {string} requestId - the Request_ID for this request
 * @returns {Response} a new decorated Response
 */
export function decorateResponse(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', CORS_HEADERS['Access-Control-Allow-Origin']);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  headers.set('X-Request-ID', requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Validate the query parameters for a Translate_Endpoint request.
 *
 * The required parameter is `q`. When it is missing (absent) or an empty
 * string, validation fails with `{valid: false, missing: 'q'}`. Otherwise it
 * succeeds with `{valid: true}`. Optional parameters (`client`, `sl`, `tl`,
 * `dt`) are not enforced.
 *
 * Requirement 6.8: missing required `q` -> validation failure (later mapped to 400).
 *
 * @param {URL} url - the incoming request URL
 * @returns {{valid: boolean, missing?: string}}
 */
export function validateTranslateParams(url) {
  const q = url.searchParams.get('q');
  if (q === null || q === '') {
    return { valid: false, missing: 'q' };
  }
  return { valid: true };
}

/**
 * Resolve the current ENVIRONMENT identifier from the Worker env bindings.
 *
 * Falls back to `'unknown'` when `env` is absent or `env.ENVIRONMENT` is
 * unset, keeping backward compatibility with callers that do not pass `env`.
 *
 * Requirement 3.3: response includes the current ENVIRONMENT identifier.
 *
 * @param {object} [env] - Cloudflare env bindings; `env.ENVIRONMENT` optional
 * @returns {string}
 */
export function resolveEnvironment(env) {
  return env?.ENVIRONMENT ?? 'unknown';
}

/**
 * Health_Endpoint handler. Returns a 200 JSON response describing service
 * liveness and the current environment without contacting any upstream.
 *
 * Requirement 3.1: GET /health -> 200 JSON response.
 * Requirement 3.2: response body `status` field is `'ok'`.
 * Requirement 3.3: response body includes the current ENVIRONMENT identifier.
 * Requirement 3.4: returns without calling the upstream service (no `fetch`).
 *
 * @param {object} [env] - Cloudflare env bindings; `env.ENVIRONMENT` optional
 * @returns {Response}
 */
export function handleHealth(env) {
  return jsonResponse({ status: 'ok', environment: resolveEnvironment(env) }, 200);
}

/**
 * Build the OpenAPI 3.x document describing the Worker's HTTP API.
 *
 * Pure function: returns a plain object with no side effects. The document
 * declares the Translate_Endpoint (`/translate_a/single`), Health_Endpoint
 * (`/health`) and OpenAPI_Endpoint (`/openapi.json`), and a reusable
 * `StandardizedResponse` schema.
 *
 * Invariant (Requirement 6.5 / Property 11): EVERY response across all paths,
 * methods and status codes declares its `content` with exactly one key —
 * `application/json`.
 *
 * Requirement 6.1: OpenAPI 3.x version format.
 * Requirement 6.2: Translate_Endpoint with client/sl/tl/dt (optional) and q (required).
 * Requirement 6.3: Health_Endpoint with a 200 response.
 * Requirement 6.4: reusable StandardizedResponse schema (code:integer/msg:string/text:string).
 * Requirement 6.5: every response content-type is application/json.
 * Requirement 6.6: Translate_Endpoint declares 200/404/500 (and 400) responses.
 *
 * @returns {object} the OpenAPI 3.x document
 */
export function buildOpenApiSpec() {
  const jsonResponseRef = (description) => ({
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/StandardizedResponse' },
      },
    },
  });

  return {
    openapi: '3.0.3',
    info: {
      title: 'Google Translate Proxy API',
      version: '1.0.0',
    },
    paths: {
      '/translate_a/single': {
        get: {
          summary: 'Translate text via the Google Translate proxy',
          parameters: [
            { name: 'client', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'sl', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'tl', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'dt', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: jsonResponseRef('Successful translation'),
            400: jsonResponseRef('Missing required query parameter'),
            404: jsonResponseRef('Invalid path'),
            500: jsonResponseRef('Internal server error'),
          },
        },
      },
      '/health': {
        get: {
          summary: 'Service health check',
          responses: {
            200: {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      environment: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          summary: 'Retrieve this OpenAPI specification',
          responses: {
            200: {
              description: 'OpenAPI specification document',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        StandardizedResponse: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            msg: { type: 'string' },
            text: { type: 'string' },
          },
        },
      },
    },
  };
}

/**
 * OpenAPI_Endpoint handler. Returns the OpenAPI_Spec as a 200 JSON response.
 *
 * Because it routes through `jsonResponse`, the `content-type: application/json`
 * header is guaranteed (Requirement 6.7).
 *
 * @returns {Response}
 */
export function handleOpenApi() {
  return jsonResponse(buildOpenApiSpec(), 200);
}

/**
 * Routing core. Dispatches an incoming request to the matching endpoint
 * handler based on method and path, in order:
 *   - `GET /health`        -> handleHealth(env)
 *   - `GET /openapi.json`  -> handleOpenApi()
 *   - path startsWith `/translate_a/` -> handleTranslate(request)
 *   - otherwise            -> 404 {code:1, msg:'Invalid path'}
 *
 * This function does not perform cross-cutting concerns (request id, CORS,
 * security headers, logging, exception handling); those are owned by the
 * middleware shell. The `requestId` parameter is part of the signature so the
 * shell can thread it through, even though routing itself does not consume it.
 *
 * Requirement 3.1: GET /health -> health endpoint.
 * Requirement 6.7: GET /openapi.json -> OpenAPI endpoint.
 * Requirement 5.5: unknown path -> 404 Standardized_Response.
 *
 * @param {Request} request
 * @param {object} [env] - Cloudflare env bindings; `env.ENVIRONMENT` optional
 * @param {string} requestId - the Request_ID for this request
 * @returns {Promise<Response>}
 */
export async function routeRequest(request, env, requestId) {
  const url = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && url.pathname === '/health') {
    return handleHealth(env);
  }

  if (method === 'GET' && url.pathname === '/openapi.json') {
    return handleOpenApi();
  }

  if (url.pathname.startsWith(TRANSLATE_PATH_PREFIX)) {
    return handleTranslate(request);
  }

  return jsonResponse({ code: 1, msg: 'Invalid path' }, 404);
}

/**
 * Middleware shell. The single composition root that threads cross-cutting
 * concerns around the routing core:
 *   - generate a unique Request_ID and capture the start time;
 *   - short-circuit `OPTIONS` to the CORS preflight response;
 *   - otherwise route the request, catching any thrown error into a unified
 *     500 `{code:1, msg}` envelope and emitting a structured error log;
 *   - decorate the response once at the single egress (CORS + security headers
 *     + `X-Request-ID`);
 *   - emit a structured request log with the processing duration.
 *
 * Requirement 4.3: every response carries `X-Request-ID` via `decorateResponse`.
 * Requirement 5.4: unhandled exceptions map to a 500 Standardized_Response and
 *                  a structured error log.
 * Requirement 5.5: routing (including unknown-path 404) is owned by `routeRequest`.
 *
 * @param {Request} request
 * @param {object} [env] - Cloudflare env bindings; `env.ENVIRONMENT` optional
 * @returns {Promise<Response>}
 */
export async function handleRequestWithMiddleware(request, env) {
  const requestId = generateRequestId();
  const start = Date.now();
  let response;

  if (request.method === 'OPTIONS') {
    response = buildPreflightResponse();
  } else {
    try {
      response = await routeRequest(request, env, requestId);
    } catch (e) {
      response = jsonResponse({ code: 1, msg: e.message }, 500);
      logError(requestId, request, e);
    }
  }

  response = decorateResponse(response, requestId);
  logRequest(buildLogRecord(requestId, request, response.status, Date.now() - start));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    return handleRequestWithMiddleware(request, env);
  },
};
