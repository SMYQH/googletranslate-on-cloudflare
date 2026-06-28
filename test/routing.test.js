import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { handleRequest } from '../src/index.js';

// Feature: google-translate-proxy, Property 1: For any request URL path, the
// Worker SHALL forward the request to the upstream service when (and only when)
// the path begins with `/translate_a/`; otherwise it SHALL return exactly
// {code: 1, msg: "Invalid path"} with HTTP status 404.

describe('Property 1: path routing decision', () => {
  let fetchMock;

  beforeEach(() => {
    // Mock fetch so a "forwarded" request resolves to a benign 200 array.
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([[['hi', 'hi']]]), { status: 200 })
    );
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards iff path starts with /translate_a/, else 404 Invalid path', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary path segments, plus an explicit flag to force the
        // translate prefix so both branches are well covered.
        fc.webPath(),
        fc.boolean(),
        async (rawPath, forcePrefix) => {
          fetchMock.mockClear();
          let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          if (forcePrefix) {
            path = `/translate_a/single${path}`;
          }
          const request = new Request(`https://proxy.example.com${path}`);
          const res = await handleRequest(request);

          if (path.startsWith('/translate_a/')) {
            // Forwarded: upstream fetch invoked, success envelope returned.
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(200);
          } else {
            // Rejected: no forwarding, exact Invalid path body, status 404.
            expect(fetchMock).not.toHaveBeenCalled();
            expect(res.status).toBe(404);
            const body = await res.json();
            expect(body).toEqual({ code: 1, msg: 'Invalid path' });
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
