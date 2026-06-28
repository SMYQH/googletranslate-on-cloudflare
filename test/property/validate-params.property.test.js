import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateTranslateParams } from '../../src/index.js';

// Feature: production-readiness, Property 10: q 参数校验
//
// 对任意指向 Translate_Endpoint 的请求 URL：当必填查询参数 `q` 缺失或为空字符串时，
// validateTranslateParams 都应返回 {valid: false, missing: 'q'}；当 `q` 存在且非空时，
// 都应返回 {valid: true}（请求将继续进入代理流程，不因参数校验失败）。
//
// Validates: Requirements 6.8

const BASE_URL = 'https://example.com/translate_a/single';

describe('Property 10: q 参数校验', () => {
  it('reports missing=q when q is absent', () => {
    fc.assert(
      fc.property(
        // Arbitrary set of OTHER (optional) params, never including q.
        fc.dictionary(
          fc.constantFrom('client', 'sl', 'tl', 'dt'),
          fc.string()
        ),
        (params) => {
          const url = new URL(BASE_URL);
          for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
          }
          // Ensure q is genuinely absent.
          expect(url.searchParams.has('q')).toBe(false);

          const result = validateTranslateParams(url);
          expect(result).toEqual({ valid: false, missing: 'q' });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reports missing=q when q is present but empty', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom('client', 'sl', 'tl', 'dt'),
          fc.string()
        ),
        (params) => {
          const url = new URL(BASE_URL);
          for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
          }
          // Empty q value (?q=). URLSearchParams handles encoding.
          url.searchParams.set('q', '');
          expect(url.searchParams.get('q')).toBe('');

          const result = validateTranslateParams(url);
          expect(result).toEqual({ valid: false, missing: 'q' });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reports valid=true when q is present and non-empty', () => {
    fc.assert(
      fc.property(
        // Non-empty strings, possibly containing special / non-ASCII chars.
        fc.string({ minLength: 1 }),
        fc.dictionary(
          fc.constantFrom('client', 'sl', 'tl', 'dt'),
          fc.string()
        ),
        (q, params) => {
          const url = new URL(BASE_URL);
          for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
          }
          // Use URLSearchParams so encoding is handled correctly.
          url.searchParams.set('q', q);

          // A generated string could URL-encode but must still be non-empty.
          // Guard: only assert valid=true when the round-tripped value is
          // genuinely non-empty (excludes the empty string for this branch).
          fc.pre(url.searchParams.get('q') !== '');

          const result = validateTranslateParams(url);
          expect(result).toEqual({ valid: true });
        }
      ),
      { numRuns: 100 }
    );
  });
});
