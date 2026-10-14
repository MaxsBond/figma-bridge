// Bundles the published @maxsbond/figma-bridge server (and its plugin) into
// ./server so the VSIX carries one file instead of the whole node_modules tree.
import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('@maxsbond/figma-bridge/package.json'));

await rm('server', { recursive: true, force: true });
await build({
  entryPoints: [path.join(pkgDir, 'server.js')],
  outfile: 'server/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // ws loads these native speedups optionally and falls back without them.
  external: ['bufferutil', 'utf-8-validate'],
  // CommonJS deps (ws) call require() for Node built-ins, which ESM lacks.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
// server.js reads its version from package.json next to it and serves ./plugin.
await cp(path.join(pkgDir, 'package.json'), 'server/package.json');
await cp(path.join(pkgDir, 'plugin'), 'server/plugin', { recursive: true });
