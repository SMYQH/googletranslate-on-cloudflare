import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseTranslation } from '../src/index.js';

// Feature: google-translate-proxy, Property 4: For any upstream response array,
// the Response_Parser SHALL produce the in-order concatenation of the first
// element of each segment in `jsonData[0]`, excluding segments whose first
// element is empty or absent.

describe('Property 4: parser concatenation', () => {
  it('concatenates first elements in order, excluding empty/absent', () => {
    // A "first element" of a segment may be: a non-empty string, an empty
    // string, null, or undefined (absent). Only truthy strings contribute.
    const firstElementArb = fc.oneof(
      fc.string(),
      fc.constant(''),
      fc.constant(null),
      fc.constant(undefined)
    );

    fc.assert(
      fc.property(
        fc.array(
          // Each segment: [firstElement, ...arbitrary trailing metadata]
          firstElementArb.chain((first) =>
            fc.array(fc.anything(), { maxLength: 3 }).map((rest) => [first, ...rest])
          ),
          { maxLength: 30 }
        ),
        (segments) => {
          const jsonData = [segments];
          const expected = segments
            .map((seg) => seg[0])
            .filter(Boolean)
            .join('');
          expect(parseTranslation(jsonData)).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });
});
