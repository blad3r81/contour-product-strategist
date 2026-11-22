import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base64, loadFile, loadVideoEvidence, storeFile, storeVideoEvidence, type VideoEvidence } from './chat-files';
import { WorkspaceChat, type Project } from './workspace-chat';

type Checkpoint = {
  revision: string;
  state: {
    stage: string; task: string; next: string; project: Project;
    files?: { name: string; base64: string; video?: VideoEvidence }[];
    decision?: Record<string, string>;
  };
};

async function caseRequest(data: object): Promise<Checkpoint> {
  const response = await fetch('/api/case', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Не удалось прочитать дело.');
  return result;
}

export function SavedCase() {
  const { id } = useParams();
  const [saved, setSaved] = useState<Checkpoint>();
  const [project, setProject] = useState<Project>();
  const [notice, setNotice] = useState('');
  const current = useRef<Checkpoint | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void caseRequest({ operation: 'read', id }).then(async checkpoint => {
      if (!checkpoint.state.project) throw Error('В этом деле пока нет диалога для просмотра.');
      const next = { ...checkpoint.state.project, id: id ?? checkpoint.state.project.id, caseId: id };
      for (const file of checkpoint.state.files ?? []) {
        const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
        await storeFile(next.id, new File([bytes], file.name));
        if (file.video) {
          await storeVideoEvidence(next.id, file.name, file.video);
          next.files = next.files.map(name => name === file.video!.name ? file.name : name);
        }
      }
      if (active) { current.current = checkpoint; setSaved(checkpoint); setProject(next); }
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [id]);

  function update(next: Project) {
    setProject(next);
    setNotice('Сохраняю продолжение…');
    queue.current = queue.current.then(async () => {
      const checkpoint = current.current;
      if (!checkpoint) return;
      const latest = await caseRequest({ operation: 'read', id });
      if (latest.revision !== checkpoint.revision) {
        const last = next.messages.at(-1);
        const savedLast = latest.state.project.messages.at(-1);
        const sameReply = typeof last === 'object' && typeof savedLast === 'object' && last.role === savedLast.role && last.content === savedLast.content;
        if (!sameReply) throw Error('Дело обновлено в другом окне. Перезагрузите страницу перед продолжением. Ваш ввод остаётся в этом окне.');
      }
      const files = await Promise.all(next.files.map(async name => {
        const file = await loadFile(next.id, name);
        if (!file) throw Error(`Материал «${name}» не найден. Прикрепите его снова.`);
        return { name, base64: await base64(file), video: await loadVideoEvidence(next.id, name) };
      }));
      const result = await caseRequest({
        operation: 'save', id, revision: latest.revision,
        state: { ...latest.state, files, project: next, decision: next.decision },
      });
      current.current = result;
      setSaved(result);
      setNotice('Продолжение сохранено на диске.');
    }).catch(error => setNotice(error.message));
  }
  return <main className="wrap workspace conversation">
    <div className="work-heading"><div><p className="eyebrow">Сохранённое исследование</p>
      <h1>{project?.title ?? 'Открываю дело…'}</h1></div><a className="btn outline" href="/">На главную</a></div>
    {saved && <details><summary>Где остановились</summary><p>{saved.state.task}</p><p>Следующий шаг. {saved.state.next}</p>
      <p>Дело сохраняется в локальной папке cases. Открытие этой ссылки восстанавливает материалы и диалог.</p></details>}
    {notice && <p role="status">{notice}</p>}
    {project && <WorkspaceChat key={project.id} project={project} onChange={update}/>}
  </main>;
}
