import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Feature: production-readiness, Task 10.4: smoke test for configuration artifacts.
// Validates: Requirements 7.1, 7.2, 7.3, 7.4

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

describe('config artifacts smoke test', () => {
  it('package.json declares wrangler dev dependency and dev/deploy/test scripts', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

    // Requirement 7.1: wrangler declared as a dev dependency.
    expect(pkg.devDependencies).toBeDefined();
    expect(pkg.devDependencies.wrangler).toBeDefined();

    // Requirement 7.2 & 7.3: dev, deploy and test scripts present.
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.deploy).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();

    expect(pkg.scripts.dev).toContain('wrangler dev');
    expect(pkg.scripts.deploy).toContain('wrangler deploy');
    expect(pkg.scripts.test).toBe('vitest run');
  });

  it('.gitignore ignores the .wrangler/ directory', () => {
    // Requirement 7.4
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.wrangler/');
  });

  it('wrangler.toml exists and declares the ENVIRONMENT variable', () => {
    // Requirement 7.2
    const wranglerPath = join(root, 'wrangler.toml');
    expect(existsSync(wranglerPath)).toBe(true);

    const wrangler = readFileSync(wranglerPath, 'utf8');
    expect(wrangler).toContain('ENVIRONMENT');
    expect(wrangler).toContain('ENVIRONMENT = "production"');
  });
});
