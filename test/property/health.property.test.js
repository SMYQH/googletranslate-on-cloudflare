// Feature: production-readiness, Property 6: 健康端点行为
//
// 对任意注入的 env.ENVIRONMENT 取值（含缺省），GET /health 的响应都应为状态码 200
// 的 JSON，响应体 status 字段为 'ok'，environment 字段等于注入的 ENVIRONMENT
// （缺省时为 'unknown'），且处理过程中不发起任何对上游的 fetch 调用。
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { handleHealth } from '../../src/index.js';
import { installFetchMock } from '../helpers/fetch-mock.js';

describe('Property 6: 健康端点行为', () => {
  it('returns 200 status:ok, echoes ENVIRONMENT (or unknown), and never calls upstream', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Cover both the random-ENVIRONMENT case and the default case where
        // ENVIRONMENT is absent. fc.option(..., { nil: undefined }) yields
        // either a random string or undefined; we then map undefined into one
        // of the "no ENVIRONMENT" env shapes (undefined env or {}).
        fc.option(fc.string(), { nil: undefined }),
        fc.boolean(),
        async (environment, useEmptyEnv) => {
          let env;
          let expectedEnvironment;
          if (environment === undefined) {
            // Default case: no ENVIRONMENT provided -> expect 'unknown'.
            env = useEmptyEnv ? {} : undefined;
            expectedEnvironment = 'unknown';
          } else {
            env = { ENVIRONMENT: environment };
            // resolveEnvironment uses ?? so empty string is preserved as-is.
            expectedEnvironment = environment;
          }

          // Requirement 3.4: install a fetch mock and assert zero upstream calls.
          const restore = installFetchMock({ status: 200, body: 'should not be called' });
          try {
            const response = handleHealth(env);

            // Requirement 3.1: 200 JSON response.
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('application/json');

            const data = JSON.parse(await response.text());

            // Requirement 3.2: status field is 'ok'.
            expect(data.status).toBe('ok');

            // Requirement 3.3: environment echoes injected ENVIRONMENT (or 'unknown').
            expect(data.environment).toBe(expectedEnvironment);

            // Requirement 3.4: no upstream fetch was made.
            expect(restore.mock.callCount).toBe(0);
          } finally {
            restore();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
