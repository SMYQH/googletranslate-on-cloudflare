import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { routeRequest } from '../../src/index.js';

// Feature: production-readiness, Property 9: 未知路径返回 404
//
// 对任意既不以 `/translate_a/` 开头、也不匹配 `/health` 或 `/openapi.json`
// 的路径，GET 请求的响应都应为状态码 404 的 {code: 1, msg: <无效路径提示>}。
//
// Validates: Requirements 5.5

describe('Property 9: 未知路径返回 404', () => {
  let fetchMock;

  beforeEach(() => {
    // 守护：未知路径不应触发任何上游调用；若误触发则返回良性 200。
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([[['hi', 'hi']]]), { status: 200 })
    );
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET 未知路径 -> 404 + {code:1, msg:"Invalid path"}', async () => {
    await fc.assert(
      fc.asyncProperty(fc.webPath(), async (rawPath) => {
        // 规范化为以 '/' 开头的路径。
        const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

        // 跳过任何属于已定义端点或翻译前缀的路径。
        fc.pre(
          !path.startsWith('/translate_a/') &&
            path !== '/health' &&
            path !== '/openapi.json'
        );

        const request = new Request(`https://example.com${path}`, {
          method: 'GET',
        });
        const response = await routeRequest(request, undefined, 'test-request-id');

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.code).toBe(1);
        expect(body.msg).toBe('Invalid path');
      }),
      { numRuns: 100 }
    );
  });
});
