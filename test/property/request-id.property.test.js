// Feature: production-readiness, Property 3: 请求标识唯一且格式合规
//
// 对任意数量的连续请求，generateRequestId() 产生的 Request_ID 都应彼此唯一，
// 且每个都符合 RFC 4122 UUID v4 的格式。
//
// Validates: Requirements 4.1

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateRequestId } from '../../src/index.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Property 3: 请求标识唯一且格式合规', () => {
  it('generates N pairwise-unique IDs each matching the UUID v4 format', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        const ids = Array.from({ length: n }, () => generateRequestId());

        // Format: every generated ID matches the UUID v4 regex.
        for (const id of ids) {
          expect(id).toMatch(UUID_V4_REGEX);
        }

        // Uniqueness: all N IDs are pairwise unique.
        expect(new Set(ids).size).toBe(n);
      }),
      { numRuns: 100 }
    );
  });
});
