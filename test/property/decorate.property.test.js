import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decorateResponse, jsonResponse } from '../../src/index.js';

// Feature: production-readiness, Property 1: 单一出口装饰不变量（CORS + 安全头 + 请求追踪）
//
// 对任意经 worker 处理的非预检响应（任意 status/body），其最终响应都应同时满足：
// 含 Access-Control-Allow-Origin、X-Content-Type-Options: nosniff、X-Frame-Options: DENY、
// Referrer-Policy；含 X-Request-ID 等于传入 Request_ID；content-type 仍为 application/json，
// 且 body 与 status 相对未装饰前保持不变。
//
// Validates: Requirements 1.1, 2.1, 2.2, 2.3, 2.4, 4.3

describe('Property 1: 单一出口装饰不变量（CORS + 安全头 + 请求追踪）', () => {
  it('decorated response carries all headers and preserves content-type/body/status', async () => {
    // Statuses that are allowed to carry a body (exclude 204/205/304 which forbid bodies).
    const statusArb = fc.constantFrom(200, 201, 400, 404, 500);
    const bodyArb = fc.record({
      code: fc.integer(),
      msg: fc.string(),
      text: fc.string(),
    });
    const requestIdArb = fc.uuid();

    await fc.assert(
      fc.asyncProperty(bodyArb, statusArb, requestIdArb, async (body, status, requestId) => {
        const base = jsonResponse(body, status);
        const decorated = decorateResponse(base, requestId);

        // CORS header present.
        expect(decorated.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
        // Security headers.
        expect(decorated.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(decorated.headers.get('X-Frame-Options')).toBe('DENY');
        expect(decorated.headers.get('Referrer-Policy')).not.toBeNull();
        // Request tracing.
        expect(decorated.headers.get('X-Request-ID')).toBe(requestId);
        // content-type preserved.
        expect(decorated.headers.get('content-type')).toContain('application/json');
        // status preserved.
        expect(decorated.status).toBe(status);
        // body preserved.
        const text = await decorated.text();
        expect(text).toBe(JSON.stringify(body));
      }),
      { numRuns: 100 }
    );
  });
});
