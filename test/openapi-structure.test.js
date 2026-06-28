import { describe, it, expect } from 'vitest';
import { buildOpenApiSpec } from '../src/index.js';

describe('OpenAPI static structure', () => {
  const spec = buildOpenApiSpec();

  // Normalize response keys to strings so numeric and string keys both match.
  const responseKeys = (responses) => Object.keys(responses).map(String);

  it('declares an OpenAPI 3.x version', () => {
    expect(typeof spec.openapi).toBe('string');
    expect(spec.openapi.startsWith('3.')).toBe(true);
  });

  it('defines /translate_a/single with five query parameters and required q', () => {
    const params = spec.paths['/translate_a/single'].get.parameters;
    expect(Array.isArray(params)).toBe(true);
    expect(params).toHaveLength(5);

    const byName = Object.fromEntries(params.map((p) => [p.name, p]));

    // q must be required.
    expect(byName.q).toBeDefined();
    expect(byName.q.required).toBe(true);

    // client/sl/tl/dt must exist and be optional.
    for (const name of ['client', 'sl', 'tl', 'dt']) {
      expect(byName[name]).toBeDefined();
      expect(byName[name].required).toBeFalsy();
    }
  });

  it('declares 200/400/404/500 responses for the translate endpoint', () => {
    const responses = spec.paths['/translate_a/single'].get.responses;
    const keys = responseKeys(responses);
    for (const status of ['200', '400', '404', '500']) {
      expect(keys).toContain(status);
    }
  });

  it('declares a 200 response for /health', () => {
    const responses = spec.paths['/health'].get.responses;
    expect(responseKeys(responses)).toContain('200');
  });

  it('defines StandardizedResponse with correct field types', () => {
    const schema = spec.components.schemas.StandardizedResponse;
    expect(schema.properties.code.type).toBe('integer');
    expect(schema.properties.msg.type).toBe('string');
    expect(schema.properties.text.type).toBe('string');
  });
});
