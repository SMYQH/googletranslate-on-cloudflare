import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Smoke / existence test for the CI/CD GitHub Actions workflows.
// Validates: Requirements 8.1, 8.3, 8.4

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(__dirname, '..', '.github', 'workflows');
const ciPath = join(workflowsDir, 'ci.yml');
const deployPath = join(workflowsDir, 'deploy.yml');

describe('CI/CD workflow smoke checks', () => {
  it('ci.yml exists', () => {
    expect(existsSync(ciPath)).toBe(true);
  });

  it('ci.yml installs dependencies and runs npm test', () => {
    const ci = readFileSync(ciPath, 'utf8');
    // Dependency install step: either `npm install` or `npm ci`.
    expect(/npm (install|ci)\b/.test(ci)).toBe(true);
    // Test execution step.
    expect(ci).toContain('npm test');
  });

  it('deploy.yml exists', () => {
    expect(existsSync(deployPath)).toBe(true);
  });

  it('deploy.yml references the CLOUDFLARE_API_TOKEN secret', () => {
    const deploy = readFileSync(deployPath, 'utf8');
    expect(deploy).toContain('CLOUDFLARE_API_TOKEN');
  });
});
