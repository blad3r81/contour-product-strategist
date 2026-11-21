import { mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'runtime/cloud-voice');
await mkdir(destination, { recursive: true });
for (const name of ['Dockerfile', 'app.py', 'download.py', 'requirements.txt', 'README.md']) {
  await copyFile(join(root, 'voice/cloud', name), join(destination, name));
}
await copyFile(join(root, 'voice/qwen_voice.py'), join(destination, 'qwen_voice.py'));
await copyFile(join(root, 'agent/jury-runtime.json'), join(destination, 'jury-runtime.json'));
console.log(`Speech Docker build context prepared: ${destination}`);
