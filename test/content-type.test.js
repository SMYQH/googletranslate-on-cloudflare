import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { handleRequest } from '../src/index.js';

// Feature: google-translate-proxy, Property 2: For any request, regardless of
// which branch handles it (success, invalid path, upstream error, or
// exception), the Worker's response SHALL carry the header
// `content-type: application/json`.

describe('Property 2: content-type invariant', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every branch returns content-type application/json', async () => {
    // Drive all four branches via a discriminator.
    const branchArb = fc.constantFrom('success', 'invalid', 'upstream-error', 'exception');

    await fc.assert(
      fc.asyncProperty(branchArb, fc.string(), async (branch, payload) => {
        let url;
        if (branch === 'invalid') {
          url = `https://proxy.example.com/not_translate/${encodeURIComponent(payload)}`;
        } else {
          url = 'https://proxy.example.com/translate_a/single?q=hi&tl=en';
          if (branch === 'success') {
            globalThis.fetch.mockResolvedValueOnce(
              new Response(JSON.stringify([[[payload, 'src']]]), { status: 200 })
            );
          } else if (branch === 'upstream-error') {
            globalThis.fetch.mockResolvedValueOnce(
              new Response(payload, { status: 500 })
            );
          } else {
            globalThis.fetch.mockImplementationOnce(async () => {
              throw new Error(payload);
            });
          }
        }

        const res = await handleRequest(new Request(url));
        expect(res.headers.get('content-type')).toBe('application/json');
      }),
      { numRuns: 200 }
    );
  });
});
