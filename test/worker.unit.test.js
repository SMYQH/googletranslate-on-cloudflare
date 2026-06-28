import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleRequest, parseTranslation, jsonResponse } from '../src/index.js';

describe('Worker unit tests - known examples and edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseTranslation', () => {
    it('concatenates a known multi-segment upstream array', () => {
      // Typical translate.googleapis.com shape for "Hello world".
      const upstream = [
        [
          ['你好', 'Hello', null, null, 1],
          ['世界', 'world', null, null, 1],
        ],
        null,
        'en',
      ];
      expect(parseTranslation(upstream)).toBe('你好世界');
    });

    it('returns empty string for an empty segment list', () => {
      expect(parseTranslation([[]])).toBe('');
    });

    it('returns empty string when jsonData[0] is missing', () => {
      expect(parseTranslation([])).toBe('');
    });

    it('skips segments with empty/absent first elements', () => {
      const upstream = [[['A'], [''], [null], ['B']]];
      expect(parseTranslation(upstream)).toBe('AB');
    });
  });

  describe('jsonResponse', () => {
    it('always sets content-type application/json', () => {
      const res = jsonResponse({ code: 0 }, 200);
      expect(res.headers.get('content-type')).toBe('application/json');
      expect(res.status).toBe(200);
    });
  });

  describe('handleRequest routing', () => {
    it('returns the Invalid path 404 body for non-translate paths', async () => {
      const res = await handleRequest(new Request('https://proxy.example.com/foo'));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ code: 1, msg: 'Invalid path' });
    });
  });

  describe('handleRequest success envelope', () => {
    it('wraps parsed text in the success envelope', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify([[['Bonjour', 'Hello']]]), { status: 200 })
      );
      const res = await handleRequest(
        new Request('https://proxy.example.com/translate_a/single?q=Hello&tl=fr')
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ code: 0, msg: 'ok', text: 'Bonjour' });
    });
  });
});
