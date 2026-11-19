import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const destination = resolve(process.argv[2] || `${root}-jury-release`);
if (destination === root || destination.startsWith(root + sep)) throw Error('Выберите отдельную папку вне рабочего репозитория.');
await mkdir(destination, { recursive: true });
const names = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const permittedRoot = new Set(['AGENTS.md', 'README.md', 'megafon-sources.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.js', 'vercel.json', 'index.html', '.gitignore', '.vercelignore']);
const secretValues = [];
for (const file of ['.env.local', process.env.CONTOUR_CREDENTIALS_FILE].filter(Boolean)) {
  const text = await readFile(resolve(root, file), 'utf8').catch(() => '');
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_]*(?:KEY|TOKEN|SECRET|ACCESS_CODE))\s*=\s*(.+)$/.exec(line);
    if (match && match[2].trim().length >= 16) secretValues.push(Buffer.from(match[2].trim().replace(/^["']|["']$/g, '')));
  }
}
const included = [];
for (const name of names.sort()) {
  const top = name.split('/')[0];
  if (!permittedRoot.has(name) && !['src', 'server', 'agent', 'voice', 'api', 'public', 'examples', '.github', 'config', 'docs'].includes(top)) continue;
  if (/^(?:docs\/development-notes\.md|agent\/(?:jury-handover|readiness-2026-11-19)\.md)$/.test(name)) continue;
  if (/(^|\/)(?:\.env[^/]*|cases|node_modules|__pycache__|models|\.venv)(\/|$)|\.(?:pem|key|part|log|pyc)$/i.test(name)) continue;
  const input = resolve(root, name);
  if (!(await realpath(input)).startsWith(root + sep) || !(await stat(input)).isFile()) throw Error(`Необычный исходный файл: ${name}`);
  const bytes = await readFile(input);
  if (secretValues.some(value => bytes.includes(value))) throw Error(`Возможный секрет в ${name}; публикация остановлена.`);
  const output = resolve(destination, name);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(input, output);
  included.push({ path: relative(destination, output).split(sep).join('/'), bytes: bytes.length });
}
await writeFile(resolve(destination, 'release-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: included }, null, 2));
console.log(JSON.stringify({ destination, files: included.length, bytes: included.reduce((sum, item) => sum + item.bytes, 0), secretsChecked: secretValues.length, historyIncluded: false }));
