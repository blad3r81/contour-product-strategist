import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const manifest = JSON.parse(await readFile(new URL('./jury-runtime.json', import.meta.url), 'utf8'));
const root = resolve(process.argv[2] || './models');
const checks = [];
for (const item of manifest.files) {
  const file = resolve(root, item.path);
  try {
    if (!file.startsWith(root + sep)) throw Error('Путь выходит из папки весов.');
    if ((await stat(file)).size !== item.bytes) throw Error('Размер отличается от проверочного профиля.');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== item.sha256) throw Error('Контрольная сумма отличается от проверочного профиля.');
    checks.push({ component: item.component, file: item.path, ok: true });
  } catch (error) { checks.push({ component: item.component, file: item.path, ok: false, error: error.message }); }
}
console.log(JSON.stringify({ profile: manifest.profile, node: process.version, platform: process.platform, checks,
  note: 'Проверены файлы весов. Проверка не подтверждает установку Python-зависимостей, качество распознавания и доступ к GigaChat.' }, null, 2));
if (checks.some(item => !item.ok)) process.exitCode = 1;
