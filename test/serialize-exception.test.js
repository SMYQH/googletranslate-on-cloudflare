import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { handleRequest } from '../src/index.js';

// Feature: google-translate-proxy, Property 7: For any exception thrown while
// processing a request, the Worker SHALL return {code: 1, msg: <exception
// message>} with HTTP status 500.

describe('Property 7: exception serialization', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('thrown error -> {code:1, msg:e.message} status 500', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (message) => {
        globalThis.fetch.mockImplementationOnce(async () => {
          throw new Error(message);
        });

        const res = await handleRequest(
          new Request('https://proxy.example.com/translate_a/single?q=hi&tl=en')
        );

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).toEqual({ code: 1, msg: message });
      }),
      { numRuns: 200 }
    );
  });
});
