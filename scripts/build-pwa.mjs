// Builds the publishable PWA into dist/.
//   node scripts/build-pwa.mjs
// - copies the app shell (index.html, sync.js, sw.js, manifest, icons)
// - ships dados_curso.template.js as dados_curso.js (personal data never leaves the machine)
// - stamps the service worker with a content hash so installed apps pick up updates
// - refuses to finish if anything from the personal dados_curso.js leaked into dist/
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SHELL = ['index.html', 'sync.js', 'manifest.webmanifest', 'icons'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const item of SHELL) cpSync(join(root, item), join(dist, item), { recursive: true });
cpSync(join(root, 'dados_curso.template.js'), join(dist, 'dados_curso.js'));
writeFileSync(join(dist, '.nojekyll'), '');

const walk = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const hash = createHash('sha256');
for (const f of walk(dist).sort()) hash.update(relative(dist, f)).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 10);
const sw = readFileSync(join(root, 'sw.js'), 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
writeFileSync(join(dist, 'sw.js'), sw);

// Leak guard: no grade or exam from the personal data file may appear in dist/.
// (Plain subject names are public curriculum info and may appear as placeholders.)
const personalPath = join(root, 'dados_curso.js');
if (existsSync(personalPath)) {
  const src = readFileSync(personalPath, 'utf8').replace(/^\s*const DATA\s*=\s*/, '').replace(/;\s*$/, '');
  const personal = JSON.parse(src);
  const needles = [
    ...personal.historico.filter(h => typeof h.nota === 'number').map(h => `"nota": ${h.nota}, "semestre": "${h.semestre}"`),
    ...personal.provasOficiais.map(p => p.data),
    ...personal.provasOficiais.map(p => p.disciplina),
    ...(personal.aluno && !/preencha/i.test(personal.aluno) ? [personal.aluno] : []),
  ].filter(Boolean);
  const leaks = [];
  for (const f of walk(dist)) {
    if (!/\.(js|html|json|webmanifest)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const n of needles) if (text.includes(n)) leaks.push(`${relative(dist, f)}: ${n}`);
  }
  if (leaks.length) {
    console.error('ABORTED: personal data found in dist/:\n  ' + [...new Set(leaks)].slice(0, 20).join('\n  '));
    rmSync(dist, { recursive: true, force: true });
    process.exit(1);
  }
}

console.log(`dist/ ready (sw version ${version}, ${walk(dist).length} files)`);
