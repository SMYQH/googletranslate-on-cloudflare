import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleRequestWithMiddleware,
  parseTranslation,
  jsonResponse,
} from '../src/index.js';
import { installFetchMock } from './helpers/fetch-mock.js';

// Task 8.3: Regression + integration tests for the middleware shell.
//
// Every real path that flows through `handleRequestWithMiddleware` must leave
// the Worker carrying CORS headers, security headers and `X-Request-ID`
// (single-egress decoration). Alongside these integration checks we keep a
// couple of lightweight regression assertions for the unchanged pure helpers
// `parseTranslation` and `jsonResponse`.
//
// Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 4.3, 5.1, 5.2, 5.5

/**
 * Assert the four decoration header families + X-Request-ID + JSON content-type
 * + the expected status code on a decorated response.
 *
 * @param {Response} response
 * @param {number} expectedStatus
 */
function expectDecorated(response, expectedStatus) {
  expect(response.status).toBe(expectedStatus);
  // CORS (Requirement 1.1)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  // Security headers (Requirements 2.1, 2.2, 2.3)
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Referrer-Policy')).toBeTruthy();
  // Request tracing (Requirement 4.3)
  expect(response.headers.get('X-Request-ID')).toBeTruthy();
  // Content-type invariant (Requirement 2.4)
  expect(response.headers.get('content-type')).toBe('application/json');
}

describe('Middleware shell integration (handleRequestWithMiddleware)', () => {
  beforeEach(() => {
    // Silence request/error logging noise during the suite.
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translate success: returns decorated 200 success envelope (Req 5.1, 5.2, 1.1, 2.x, 4.3)', async () => {
    const restore = installFetchMock({ status: 200, body: [[['你好', 'hello']]] });
    try {
      const request = new Request('https://example.com/translate_a/single?q=hello');
      const response = await handleRequestWithMiddleware(request, {});

      expectDecorated(response, 200);
      expect(await response.json()).toEqual({ code: 0, msg: 'ok', text: '你好' });
    } finally {
      restore();
    }
  });

  it('unknown path: returns decorated 404 Invalid path envelope (Req 5.5)', async () => {
    const request = new Request('https://example.com/nope');
    const response = await handleRequestWithMiddleware(request, {});

    expectDecorated(response, 404);
    expect(await response.json()).toEqual({ code: 1, msg: 'Invalid path' });
  });

  it('health: returns decorated 200 status payload echoing environment (Req 1.1, 2.x, 4.3)', async () => {
    const request = new Request('https://example.com/health');
    const response = await handleRequestWithMiddleware(request, { ENVIRONMENT: 'test' });

    expectDecorated(response, 200);
    expect(await response.json()).toEqual({ status: 'ok', environment: 'test' });
  });

  it('openapi: returns decorated 200 OpenAPI 3.x document (Req 1.1, 2.x, 4.3)', async () => {
    const request = new Request('https://example.com/openapi.json');
    const response = await handleRequestWithMiddleware(request, {});

    expectDecorated(response, 200);
    const body = await response.json();
    expect(body.openapi.startsWith('3.')).toBe(true);
  });

  it('OPTIONS preflight: returns decorated 204 empty body with preflight headers (Req 1.x, 4.3)', async () => {
    const request = new Request('https://example.com/translate_a/single?q=hello', {
      method: 'OPTIONS',
    });
    const response = await handleRequestWithMiddleware(request, {});

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    // Decoration headers also present on the preflight response.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    // Preflight-specific headers.
    expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    expect(response.headers.get('Access-Control-Allow-Headers')).toBeTruthy();
    expect(Number(response.headers.get('Access-Control-Max-Age'))).toBeGreaterThan(0);
  });
});

describe('Backward-compat regression for unchanged pure helpers', () => {
  it('parseTranslation concatenates segment first-elements in order', () => {
    expect(parseTranslation([[['a', 'x'], ['b', 'y']]])).toBe('ab');
  });

  it('jsonResponse carries application/json content-type and the given status', () => {
    const response = jsonResponse({ code: 0 }, 200);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});
