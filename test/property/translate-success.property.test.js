// Feature: production-readiness, Property 7: 成功响应包络与译文拼接一致
//
// 对任意上游返回状态码 200 的数组响应，handleTranslate 的最终响应都应为状态码
// 200 的 {code: 0, msg: 'ok', text}，其中 text 等于对同一上游数据调用
// parseTranslation 的结果。
//
// Validates: Requirements 5.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { handleTranslate, parseTranslation } from '../../src/index.js';
import { installFetchMock } from '../helpers/fetch-mock.js';

describe('Property 7: 成功响应包络与译文拼接一致', () => {
  it('wraps upstream 200 arrays into {code:0,msg:ok,text} with text === parseTranslation(data)', async () => {
    // A single segment: a tuple whose first element [0] is sometimes a string
    // and sometimes falsy (null / '' / 0 / false), optionally followed by
    // extra elements. This covers nested segments and falsy first elements.
    const segment = fc.tuple(
      fc.oneof(fc.string(), fc.constantFrom(null, '', 0, false)),
      // Optional trailing elements to mimic the real upstream shape.
      fc.option(fc.string(), { nil: undefined }),
      fc.option(fc.string(), { nil: undefined })
    );

    // The upstream array is shaped like `[ segmentsArray, ... ]` so that
    // jsonData[0] is the list of segments.
    const upstreamArray = fc.array(segment).map((segments) => [segments]);

    await fc.assert(
      fc.asyncProperty(upstreamArray, async (data) => {
        // q must be non-empty so validation passes and we reach the proxy path.
        const request = new Request('https://example.com/translate_a/single?q=hello');

        const restore = installFetchMock({ status: 200, body: data });
        try {
          const response = await handleTranslate(request);

          // Requirement 5.2: 200 status with JSON content type.
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toBe('application/json');

          const body = JSON.parse(await response.text());

          // Requirement 5.2: success envelope.
          expect(body.code).toBe(0);
          expect(body.msg).toBe('ok');

          // Requirement 5.2: text equals parseTranslation over the same data.
          expect(body.text).toBe(parseTranslation(data));
        } finally {
          restore();
        }
      }),
      { numRuns: 100 }
    );
  });
});
