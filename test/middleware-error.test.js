import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleRequestWithMiddleware } from '../src/index.js';

// Unit tests for the middleware shell's exception path and error logging.
// Validates: Requirements 5.4 (unhandled exception -> 500 {code:1, msg:error.message})
//            Requirements 4.4 (logError outputs structured JSON with requestId + error)

describe('middleware exception path & error logging', () => {
  let errSpy;

  beforeEach(() => {
    // Silence and capture structured error logs emitted by logError.
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Silence the request log emitted by logRequest at the single egress.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetch rejects -> 500 {code:1, msg:error.message} and logError emits requestId + error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));

    const request = new Request('https://example.com/translate_a/single?q=test');
    const response = await handleRequestWithMiddleware(request, undefined);

    // Requirement 5.4: 500 Standardized_Response with the error message.
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe(1);
    expect(body.msg).toBe('network down');

    // Requirement 4.4: structured error log containing requestId + error.
    expect(errSpy).toHaveBeenCalled();
    const logged = JSON.parse(errSpy.mock.calls[0][0]);
    expect(typeof logged.requestId).toBe('string');
    expect(logged.requestId.length).toBeGreaterThan(0);
    expect(logged.level).toBe('error');
    expect(logged.error).toBe('network down');

    // The error log's requestId should match the response's X-Request-ID header.
    expect(response.headers.get('X-Request-ID')).toBe(logged.requestId);
  });

  it('upstream returns invalid JSON -> 500 {code:1} and logError emits requestId + error', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('not json{', { status: 200 }))
    );

    const request = new Request('https://example.com/translate_a/single?q=test');
    const response = await handleRequestWithMiddleware(request, undefined);

    // Requirement 5.4: malformed upstream JSON bubbles to the shell catch -> 500.
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe(1);
    expect(typeof body.msg).toBe('string');
    expect(body.msg.length).toBeGreaterThan(0);

    // Requirement 4.4: structured error log containing requestId + error.
    expect(errSpy).toHaveBeenCalled();
    const logged = JSON.parse(errSpy.mock.calls[0][0]);
    expect(typeof logged.requestId).toBe('string');
    expect(logged.requestId.length).toBeGreaterThan(0);
    expect(logged.level).toBe('error');
    expect(typeof logged.error).toBe('string');
    expect(logged.error.length).toBeGreaterThan(0);
  });
});
