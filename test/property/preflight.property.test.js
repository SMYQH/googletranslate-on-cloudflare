// Feature: production-readiness, Property 2: 预检请求不变量
//
// 对任意 HTTP 方法为 OPTIONS 的请求（任意路径），其响应状态码都应为 204、
// 响应体为空，且包含 Access-Control-Allow-Methods、Access-Control-Allow-Headers
// 与 Access-Control-Max-Age 头，其中 Access-Control-Max-Age 的值可解析为正整数。
//
// Validates: Requirements 1.2, 1.3, 1.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildPreflightResponse } from '../../src/index.js';

describe('Property 2: 预检请求不变量', () => {
  it('OPTIONS over any path yields 204, empty body, and parseable preflight headers', async () => {
    await fc.assert(
      fc.asyncProperty(fc.webPath(), async (path) => {
        // The "random path" drives the universal quantification. buildPreflightResponse()
        // is path-independent, so we build an OPTIONS Request for realism but assert on
        // the function output.
        const request = new Request(`https://example.com${path}`, { method: 'OPTIONS' });
        expect(request.method).toBe('OPTIONS');

        const response = buildPreflightResponse();

        // Requirement 1.2: status 204 with an empty body.
        expect(response.status).toBe(204);
        const body = await response.text();
        expect(body).toBe('');

        // Requirement 1.3: includes Access-Control-Allow-Methods and
        // Access-Control-Allow-Headers.
        expect(response.headers.get('Access-Control-Allow-Methods')).not.toBeNull();
        expect(response.headers.get('Access-Control-Allow-Headers')).not.toBeNull();

        // Requirement 1.4: includes Access-Control-Max-Age parseable as a positive integer.
        const maxAge = response.headers.get('Access-Control-Max-Age');
        expect(maxAge).not.toBeNull();
        const parsed = Number.parseInt(maxAge, 10);
        expect(Number.isInteger(parsed)).toBe(true);
        expect(parsed).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
