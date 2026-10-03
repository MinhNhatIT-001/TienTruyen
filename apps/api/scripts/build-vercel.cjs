const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'serverless');
fs.rmSync(output, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('@vercel/ncc/dist/ncc/cli.js'), 'build', 'dist/main.js', '-e', 'sharp', '-e', 'argon2', '-e', '@prisma/client', '-o', output], { cwd: root, stdio: 'inherit' });

// Native dependencies and Prisma must retain their files beside the bundle.
const copied = new Set();
function copyPackage(name, from, optional = false) {
  if (copied.has(name)) return;
  let manifest;
  try {
    const resolve = createRequire(path.join(from, 'package.json'));
    manifest = resolve.resolve.paths(name).map(dir => path.join(dir, name, 'package.json')).find(file => fs.existsSync(file));
    if (!manifest) throw new Error(`Missing package ${name}`);
    manifest = fs.realpathSync(manifest);
  } catch (error) { if (optional) return; throw error; }
  copied.add(name);
  const source = path.dirname(manifest);
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  fs.cpSync(source, path.join(output, 'node_modules', name), { recursive: true, dereference: true, filter: file => !file.startsWith(path.join(source, 'node_modules')) });
  for (const dep of Object.keys(pkg.dependencies || {})) copyPackage(dep, source);
  for (const dep of Object.keys(pkg.optionalDependencies || {})) copyPackage(dep, source, true);
}
for (const name of ['sharp', 'argon2', '@prisma/client']) copyPackage(name, root);
const prismaDir = path.join(path.dirname(require.resolve('@prisma/client/package.json')), '..', '..', '.prisma', 'client');
fs.cpSync(prismaDir, path.join(output, 'node_modules', '.prisma', 'client'), { recursive: true, dereference: true });
