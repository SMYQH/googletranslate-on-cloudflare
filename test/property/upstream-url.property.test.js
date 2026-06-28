// Feature: production-readiness, Property 5: 上游 URL 保持路径与查询
//
// 对任意入站请求 URL，buildUpstreamUrl 的输出都应满足：hostname 等于
// translate.googleapis.com，且 pathname 与查询字符串（search）与入站 URL
// 逐字保持一致。
//
// Validates: Requirements 5.1

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildUpstreamUrl } from '../../src/index.js';

describe('Property 5: 上游 URL 保持路径与查询', () => {
  it('rewrites hostname to translate.googleapis.com while preserving pathname and search', () => {
    fc.assert(
      fc.property(
        // Random path segments (non-empty strings) -> a path like "/a/b/c".
        fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
        // Random query params as key/value pairs (keys non-empty).
        fc.array(
          fc.tuple(fc.string({ minLength: 1 }), fc.string()),
          { minLength: 0, maxLength: 5 }
        ),
        (segments, queryPairs) => {
          // Build the input URL via the URL API so encoding is handled for us
          // and we never feed an invalid URL string into buildUpstreamUrl.
          const url = new URL('https://worker.example.com');

          // Ensure pathname starts with '/'. encodeURIComponent each segment
          // so reserved characters do not break the path structure.
          url.pathname =
            '/' + segments.map((s) => encodeURIComponent(s)).join('/');

          // Build the query via URLSearchParams to get correct encoding.
          const params = new URLSearchParams();
          for (const [k, v] of queryPairs) {
            params.append(k, v);
          }
          url.search = params.toString();

          const inputUrlStr = url.toString();
          const out = new URL(buildUpstreamUrl(inputUrlStr));
          const input = new URL(inputUrlStr);

          // hostname rewritten to the upstream host.
          expect(out.hostname).toBe('translate.googleapis.com');

          // pathname and search preserved verbatim.
          expect(out.pathname).toBe(input.pathname);
          expect(out.search).toBe(input.search);
        }
      ),
      { numRuns: 100 }
    );
  });
});
