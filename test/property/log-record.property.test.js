import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildLogRecord } from '../../src/index.js';

// Feature: production-readiness, Property 4: 结构化日志记录完整性
//
// 对任意请求方法、请求路径、响应状态码与非负处理耗时，
// buildLogRecord(requestId, request, status, durationMs) 返回的对象都应包含
// requestId、method、path、status、durationMs 全部字段，字段类型正确
// （durationMs 为非负数），且整体可被 JSON.stringify 序列化。
//
// Validates: Requirements 4.2

describe('Property 4: 结构化日志记录完整性', () => {
  it('builds a complete, well-typed, serializable log record for any inputs', () => {
    fc.assert(
      fc.property(
        // requestId: any non-empty string (UUID-like in practice).
        fc.uuid(),
        // method: a realistic HTTP method.
        fc.constantFrom('GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'HEAD', 'PATCH'),
        // path: arbitrary URL path, normalized to start with '/'.
        fc.webPath(),
        // status: HTTP status code range.
        fc.integer({ min: 100, max: 599 }),
        // durationMs: non-negative processing duration.
        fc.double({ min: 0, max: 1e9, noNaN: true, noDefaultInfinity: true }),
        (requestId, method, rawPath, status, durationMs) => {
          const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          const url = `https://example.com${path}`;
          const request = new Request(url, { method });

          const record = buildLogRecord(requestId, request, status, durationMs);

          // All required fields present.
          expect(record).toHaveProperty('requestId');
          expect(record).toHaveProperty('method');
          expect(record).toHaveProperty('path');
          expect(record).toHaveProperty('status');
          expect(record).toHaveProperty('durationMs');

          // Correct types.
          expect(typeof record.requestId).toBe('string');
          expect(typeof record.method).toBe('string');
          expect(typeof record.path).toBe('string');
          expect(typeof record.status).toBe('number');
          expect(typeof record.durationMs).toBe('number');

          // durationMs is a non-negative number.
          expect(Number.isFinite(record.durationMs)).toBe(true);
          expect(record.durationMs).toBeGreaterThanOrEqual(0);

          // Field values reflect the inputs.
          expect(record.requestId).toBe(requestId);
          expect(record.method).toBe(method);
          expect(record.status).toBe(status);
          expect(record.path).toBe(new URL(url).pathname);

          // JSON.stringify does not throw and round-trips.
          let serialized;
          expect(() => {
            serialized = JSON.stringify(record);
          }).not.toThrow();
          expect(JSON.parse(serialized)).toEqual(record);
        }
      ),
      { numRuns: 100 }
    );
  });
});
