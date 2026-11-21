import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatherLinks, MAX_FILE_BYTES, readDocument } from '../server/materials.js';
import { calculateRatio, ratioCandidates } from '../server/research.js';

const root = fileURLToPath(new URL('../cases/', import.meta.url));
const stages = new Set(['brief', 'materials', 'research', 'options', 'decision', 'review']);

async function inspect(target, query = '') {
  if (/^https?:\/\//i.test(target)) {
    const [source] = await gatherLinks('', [target]);
    if (!source || source.error) throw Error(source?.error || 'Источник недоступен.');
    return { ...source, checkedAt: new Date().toISOString() };
  }
  const info = await stat(target);
  if (!info.isFile() || info.size > MAX_FILE_BYTES) throw Error('Укажите файл размером до 2 МБ.');
  const material = await readDocument(basename(target), await readFile(target), query === '--full' ? '' : query, { full: process.argv.includes('--full') });
  const candidates = material.table ? ratioCandidates([{ id: 'Ф1', data: material.table }]) : [];
  return {
    path: target, ...material,
    ...(candidates.length === 1 ? { calculation: calculateRatio(material.table, candidates[0]) } : candidates.length ? { calculationCandidates: candidates } : {}),
    checkedAt: new Date().toISOString(),
  };
}

async function projectDirectory(id, create) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw Error('В имени дела используйте до 64 латинских строчных букв, цифр и дефисов.');
  if (create) await mkdir(root, { recursive: true });
  const directory = await realpath(root);
  const project = join(directory, id);
  if (create) await mkdir(project, { recursive: true });
  const projectPath = await realpath(project);
  if (dirname(projectPath) !== directory || basename(projectPath) !== id) throw Error('Дело должно находиться в папке cases.');
  return projectPath;
}

async function checkpoints(projectPath, create) {
  const target = join(projectPath, 'checkpoints');
  if (create) await mkdir(target, { recursive: true });
  const resolved = await realpath(target);
  if (resolved !== target) throw Error('Папка контрольных точек должна находиться внутри дела.');
  return resolved;
}

async function save(id, input) {
  if ((await stat(input)).size > 256_000) throw Error('Сократите контрольную точку до 256 КБ.');
  const raw = await readFile(input, 'utf8');
  if (Buffer.byteLength(raw) > 256_000) throw Error('Сократите контрольную точку до 256 КБ.');
  const state = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!state || !stages.has(state.stage) || typeof state.task !== 'string' || !state.task.trim() || typeof state.next !== 'string' || !state.next.trim()) {
    throw Error('Состояние требует stage, task и next.');
  }
  const directory = await checkpoints(await projectDirectory(id, true), true);
  const savedAt = new Date().toISOString();
  const name = `${savedAt.replace(/:/g, '-')}-${randomUUID()}.json`;
  const output = join(directory, name);
  await writeFile(`${output}.part`, JSON.stringify({ ...state, savedAt }, null, 2), { flag: 'wx' });
  await rename(`${output}.part`, output);
  return { case: id, stage: state.stage, savedAt, checkpoint: output };
}

async function resume(id) {
  const project = await projectDirectory(id, false);
  const directory = await checkpoints(project, false).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  const files = directory ? (await readdir(directory, { withFileTypes: true })).filter(item => item.isFile() && item.name.endsWith('.json')).map(item => item.name).sort() : [];
  const latest = files.at(-1);
  if (!latest) {
    const legacy = join(project, 'state.md');
    const resolved = await realpath(legacy).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      throw Error('В деле ещё нет сохранённой контрольной точки.');
    });
    if (resolved !== legacy) throw Error('Состояние должно находиться внутри дела.');
    return { case: id, checkpoint: legacy, legacyState: await readFile(legacy, 'utf8') };
  }
  return { case: id, checkpoint: join(directory, latest), state: JSON.parse(await readFile(join(directory, latest), 'utf8')) };
}

const [command, target, input] = process.argv.slice(2);
try {
  let result;
  if (command === 'inspect' && target) result = await inspect(target, input);
  else if (command === 'checkpoint' && target && input) result = await save(target, input);
  else if (command === 'resume' && target) result = await resume(target);
  else throw Error('Команды: inspect <файл или публичный URL> [вопрос] [--full], checkpoint <дело> <файл JSON>, resume <дело>.');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
