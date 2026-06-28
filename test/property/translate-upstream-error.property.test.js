// Feature: production-readiness, Property 8: 上游错误包络
//
// 对任意上游返回的非 200 状态码与任意响应体文本，worker 的最终响应都应为状态码
// 200 的 {code: 1, msg: <上游响应体>}。
//
// Validates: Requirements 5.3

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { handleTranslate } from '../../src/index.js';
import { installFetchMock } from '../helpers/fetch-mock.js';

describe('Property 8: 上游错误包络', () => {
  it('wraps any upstream non-200 status + body into 200 {code:1, msg:<body>}', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Random non-200 status. Use 400..599 which is safe with a body for
        // the Response constructor (avoids 204/205/304 that forbid a body).
        fc.integer({ min: 400, max: 599 }),
        // Random body text, including special/non-ASCII characters. Passed as
        // a STRING so msg equals it verbatim (the mock returns strings as-is).
        fc.string(),
        async (status, body) => {
          // handleTranslate validates `q` BEFORE fetching, so use a valid q.
          const request = new Request('https://example.com/translate_a/single?q=test');

          const restore = installFetchMock({ status, body });
          try {
            const response = await handleTranslate(request);

            // Requirement 5.3: business error is surfaced with HTTP 200.
            expect(response.status).toBe(200);

            const data = JSON.parse(await response.text());

            // Requirement 5.3: code is 1 and msg is the upstream body verbatim.
            expect(data.code).toBe(1);
            expect(data.msg).toBe(body);
          } finally {
            restore();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
