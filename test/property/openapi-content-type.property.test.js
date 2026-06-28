// Feature: production-readiness, Property 11: OpenAPI 响应内容类型不变量
//
// 对任意 buildOpenApiSpec() 所产生文档中的端点、HTTP 方法与响应状态码，
// 其声明的响应 content 都应以 application/json 作为唯一的内容类型键。
//
// Validates: Requirements 6.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildOpenApiSpec } from '../../src/index.js';

// HTTP method keys that may appear inside a path item object.
const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];

// Build the spec once: it is deterministic, so we can flatten its response
// objects ahead of the property and select from that flattened list.
const spec = buildOpenApiSpec();

// Flatten every [path, method, statusCode] -> response object entry.
const responseEntries = [];
for (const [path, pathItem] of Object.entries(spec.paths)) {
  for (const method of HTTP_METHODS) {
    const operation = pathItem[method];
    if (!operation || !operation.responses) continue;
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      responseEntries.push({ path, method, statusCode, response });
    }
  }
}

describe('Property 11: OpenAPI 响应内容类型不变量', () => {
  it('flattened spec contains at least one response entry', () => {
    // Guard: a random-selection property over an empty list would be vacuous.
    expect(responseEntries.length).toBeGreaterThan(0);
  });

  it('every randomly selected response declares application/json as its sole content type', () => {
    fc.assert(
      fc.property(
        // Pick a random index into the flattened response list.
        fc.nat(),
        (n) => {
          const { response } = responseEntries[n % responseEntries.length];
          expect(response.content).toBeDefined();
          expect(Object.keys(response.content)).toEqual(['application/json']);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('exhaustively, every response content has exactly the application/json key', () => {
    // Full-coverage guarantee complementing the randomized property above.
    for (const { path, method, statusCode, response } of responseEntries) {
      expect(response.content, `${method.toUpperCase()} ${path} ${statusCode}`).toBeDefined();
      expect(
        Object.keys(response.content),
        `${method.toUpperCase()} ${path} ${statusCode}`
      ).toEqual(['application/json']);
    }
  });
});
