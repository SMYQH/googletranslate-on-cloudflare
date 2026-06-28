import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { handleRequest, parseTranslation } from '../src/index.js';

// Feature: google-translate-proxy, Property 5: For any upstream response with
// HTTP status 200, the Worker SHALL return {code: 0, msg: "ok", text: <parsed
// text>} with HTTP status 200, where <parsed text> equals the Response_Parser
// output for that upstream array.

describe('Property 5: success serialization', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns {code:0, msg:"ok", text:<parsed>} status 200 for upstream 200', async () => {
    const segmentArb = fc.array(
      fc.string().map((s) => [s, 'src']),
      { maxLength: 20 }
    );

    await fc.assert(
      fc.asyncProperty(segmentArb, async (segments) => {
        const jsonData = [segments];
        globalThis.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(jsonData), { status: 200 })
        );

        const res = await handleRequest(
          new Request('https://proxy.example.com/translate_a/single?q=hi&tl=en')
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
          code: 0,
          msg: 'ok',
          text: parseTranslation(jsonData),
        });
      }),
      { numRuns: 200 }
    );
  });
});
