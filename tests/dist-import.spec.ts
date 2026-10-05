import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The published files must load in Node's ESM resolver (relative imports need
// their .js extensions). Builds dist/ and imports it in plain Node, outside Vite,
// which would otherwise resolve extensionless imports for us.
describe('built package', () => {
  it('imports from dist/index.js in Node', () => {
    execSync('npm run build', { stdio: 'ignore' });
    const url = pathToFileURL(resolve('dist/index.js')).href;
    const out = execSync(
      `node --input-type=module -e "const m = await import('${url}'); console.log(Object.keys(m).sort().join(','))"`,
    )
      .toString()
      .trim();
    expect(out).toBe('captureAnnouncements,recordAnnouncements');
  }, 60_000);
});
