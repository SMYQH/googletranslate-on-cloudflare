import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { handleRequest } from '../src/index.js';

// Feature: google-translate-proxy, Property 3: For any proxied translation
// request, the upstream request the Worker issues SHALL have its hostname set
// to `translate.googleapis.com`, SHALL preserve the original path and query
// string unchanged, and SHALL use the HTTP GET method.

describe('Property 3: forwarding preserves request shape', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([[['hi', 'hi']]]), { status: 200 })
    );
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rewrites hostname, preserves path+query, uses GET', async () => {
    await fc.assert(
      fc.asyncProperty(
        // path segment after the required prefix
        fc.webPath(),
        // arbitrary query parameters
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_]+$/.test(s)),
            fc.string()
          ),
          { maxLength: 6 }
        ),
        async (suffix, queryPairs) => {
          fetchMock.mockClear();

          const params = new URLSearchParams();
          for (const [k, v] of queryPairs) params.append(k, v);
          const search = params.toString();

          const cleanSuffix = suffix.replace(/^\//, '');
          const path = `/translate_a/single/${cleanSuffix}`;
          const incomingUrl =
            `https://proxy.example.com${path}` + (search ? `?${search}` : '');

          const incoming = new URL(incomingUrl);
          await handleRequest(new Request(incomingUrl));

          expect(fetchMock).toHaveBeenCalledTimes(1);
          const [calledUrl, options] = fetchMock.mock.calls[0];
          const forwarded = new URL(calledUrl);

          // hostname rewritten
          expect(forwarded.hostname).toBe('translate.googleapis.com');
          // path preserved
          expect(forwarded.pathname).toBe(incoming.pathname);
          // query preserved
          expect(forwarded.search).toBe(incoming.search);
          // GET method
          expect(options.method).toBe('GET');
        }
      ),
      { numRuns: 200 }
    );
  });
});
