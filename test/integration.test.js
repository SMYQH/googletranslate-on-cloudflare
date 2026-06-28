import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { handleRequest } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// End-to-end integration example (1-3 examples). Exercises the full handler
// against a RECORDED upstream fixture so the test is deterministic and does not
// depend on the live network. Confirms the proxy is wired correctly end-to-end
// and returns the success envelope.
describe('Worker end-to-end integration (recorded fixture)', () => {
  let capturedUrl;
  let capturedOptions;

  beforeEach(() => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'upstream-hello.json'), 'utf8');
    globalThis.fetch = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return new Response(fixture, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('proxies a real-shaped request and returns the success envelope', async () => {
    const incoming = new Request(
      'https://proxy.example.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=fr&q=Hello%20world'
    );
    const res = await handleRequest(incoming);

    // The Worker forwarded to the upstream host, preserving path + query, GET.
    const forwarded = new URL(capturedUrl);
    expect(forwarded.hostname).toBe('translate.googleapis.com');
    expect(forwarded.pathname).toBe('/translate_a/single');
    expect(forwarded.searchParams.get('q')).toBe('Hello world');
    expect(forwarded.searchParams.get('tl')).toBe('fr');
    expect(capturedOptions.method).toBe('GET');

    // The success envelope was returned with the parsed text.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({
      code: 0,
      msg: 'ok',
      text: 'Bonjour le monde',
    });
  });
});
