import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { handleRequest } from '../src/index.js';

// Feature: google-translate-proxy, Property 6: For any upstream response with an
// HTTP status other than 200 and any upstream body text, the Worker SHALL return
// {code: 1, msg: <upstream body text>} with HTTP status 200.

describe('Property 6: upstream-error serialization', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('non-200 upstream -> {code:1, msg:<body>} status 200', async () => {
    // Any status code other than 200, and any body text. Exclude null-body
    // statuses (204/205/304) since the test harness's Response constructor
    // forbids attaching a body to them; the Worker logic is status-agnostic.
    const statusArb = fc
      .integer({ min: 201, max: 599 })
      .filter((s) => s !== 200 && s !== 204 && s !== 205 && s !== 304);

    await fc.assert(
      fc.asyncProperty(statusArb, fc.string(), async (status, bodyText) => {
        globalThis.fetch.mockResolvedValueOnce(
          new Response(bodyText, { status })
        );

        const res = await handleRequest(
          new Request('https://proxy.example.com/translate_a/single?q=hi&tl=en')
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ code: 1, msg: bodyText });
      }),
      { numRuns: 200 }
    );
  });
});
