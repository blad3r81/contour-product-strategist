import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { CaseSource } from './showcase';
import { AgentVisual } from './agent-visuals';
import { scenarios } from './landing';
import { base64, loadFile, removeFile, storeFile } from './chat-files';
import { useVoiceChat } from './voice-chat';
import './workspace-chat.css';

type Material = { id: string; url?: string; name?: string; error?: string; excerpt?: string; coverage?: string };
type Chart = { name: string; label: string; category: string; points: { label: string; value: number }[] };
type Trace = { seconds: number; checked: number; inaccessible: number; catalog: number; graphCount: number; local?: boolean; resumedFrom?: string; actions?: { tool: string; source?: string; status: string; detail: string; questions?: { question: string; source: string }[] }[] };
type Message = { role: 'user' | 'assistant'; content: string; provider?: string; model?: string; sources?: Material[]; charts?: Chart[]; warning?: string; reviewed?: boolean; trace?: Trace; usage?: { prompt_tokens?: number; completion_tokens?: number } };
export type Project = { id: string; title: string; messages: (string | Message)[]; files: string[]; sources?: CaseSource[]; decision: Record<string, string>; decisionVersions?: { savedAt: string; fields: Record<string, string> }[]; caseId?: string };
type Health = { local: boolean; ollama: boolean; modelLoaded?: boolean; online: boolean; speech: boolean; synthesis: boolean; voiceLoading?: boolean; gate: boolean };

const composerIcons = {
  attach: 'M12 5v14M5 12h14',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 10v1a7 7 0 0 0 14 0v-1m-7 8v4m-3 0h6',
  mute: 'M9 9v2a3 3 0 0 0 5 2m1-3V5a3 3 0 0 0-5.7-1.3M5 10v1a7 7 0 0 0 12 5m2-4.5V10m-7 8v4m-3 0h6M4 4l16 16',
  wave: 'M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4',
  stop: 'M8 8h8v8H8z',
  end: 'm7 7 10 10M17 7 7 17',
  send: 'M12 19V5m-6 6 6-6 6 6',
};

function ComposerIcon({ name }: { name: keyof typeof composerIcons }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={composerIcons[name]}/>
  </svg>;
}

function normalize(message: string | Message): Message {
  return typeof message === 'string' ? { role: 'user', content: message } : message;
}

function DataChart({ chart }: { chart: Chart }) {
  const min = Math.min(0, ...chart.points.map(point => point.value));
  const max = Math.max(0, ...chart.points.map(point => point.value));
  const range = max - min || 1;
  return <figure className="chat-chart">
    <figcaption>{chart.label} по полю «{chart.category}»<small>{chart.name}</small></figcaption>
    <ul>{chart.points.map((point, index) => <li key={index}>
      <span>{point.label}</span>
      <span className="chat-chart-track" aria-hidden="true"><i style={{ left: `${(Math.min(0, point.value) - min) * 100 / range}%`, width: `${Math.abs(point.value) * 100 / range}%` }}/></span>
      <strong>{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(point.value)}</strong>
    </li>)}</ul>
  </figure>;
}

export function WorkspaceChat({ project, onChange }: { project: Project; onChange: (value: Project) => void }) {
  const { id } = project;
  const current = useRef(project);
  current.current = project;
  const draftKey = `draft:${id}`;
  const [draft, setDraft] = useState(() => sessionStorage.getItem(draftKey) || '');
  const draftValue = useRef(draft);
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState<Health>();
  const [access, setAccess] = useState(() => sessionStorage.getItem('contour-access') || '');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ prompt: string; status: string; preview?: string }>();
  const active = useRef<{ abort: AbortController; spoken: boolean } | undefined>(undefined);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function saveDraft(text: string) {
    draftValue.current = text;
    setDraft(text);
    sessionStorage.setItem(draftKey, text);
  }

  function change(next: Project) { current.current = next; onChange(next); }

  async function request(action: string, body: object, signal?: AbortSignal, onPreview?: (text: string) => void, onProgress?: (text: string) => void, onSpeechStatus?: (text: string) => void) {
    const response = await fetch(`/api/${action}`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(access ? { 'x-contour-access': access } : {}) }, body: JSON.stringify(body) });
    if (response.ok && onPreview && response.body && response.headers.get('content-type')?.includes('application/x-ndjson')) {
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let remainder = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const lines = (remainder + value).split('\n');
          remainder = lines.pop() || '';
          for (const line of lines) {
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.error) throw Error(event.error);
            if (event.progress) onProgress?.(event.progress);
            if (event.speechStatus) onSpeechStatus?.(event.speechStatus);
            if (event.preview) onPreview(event.preview);
            if (event.result) return event.result;
          }
        }
      } finally { reader.releaseLock(); }
      throw Error('Голосовой ответ прервался. Повторите запрос.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || `Ошибка сервера (${response.status}).`);
    return result;
  }

  function cancel(spokenOnly = false) {
    if (spokenOnly && !active.current?.spoken) return;
    active.current?.abort.abort();
    active.current = undefined;
    setPending(undefined);
    setBusy(false);
  }

  async function send(text: string, spoken: boolean, onPreview?: (text: string) => void, onSpeechStatus?: (text: string) => void) {
    const prompt = text.trim();
    if (!prompt) return;
    if (active.current) {
      if (spoken) saveDraft([draftValue.current, prompt].filter(Boolean).join('\n'));
      return;
    }
    const task = { abort: new AbortController(), spoken };
    active.current = task;
    setNotice(''); setBusy(true);
    setPending({ prompt, status: 'Готовлю запрос…' });
    const p = current.current;
    const inCall = Boolean(onPreview);
    const deadline = inCall ? AbortSignal.timeout(150000) : undefined;
    const signal = deadline ? AbortSignal.any([task.abort.signal, deadline]) : task.abort.signal;
    try {
      const stored = (await Promise.all(p.files.map(name => loadFile(id, name)))).filter((file): file is File => Boolean(file));
      if (stored.reduce((bytes, file) => bytes + file.size, 0) > 2_650_000) throw Error('Суммарный размер файлов превышает 2,65 МБ. Удалите часть вложений.');
      const files = await Promise.all(stored.map(async file => ({ name: file.name, base64: await base64(file) })));
      const history = p.messages.map(normalize);
      const recentUrls = history.slice(-8).reverse().flatMap(message => message.sources?.flatMap(source => source.url && !source.error ? [source.url] : []) || []);
      const urls = [...new Set([...recentUrls, ...(p.sources?.map(source => source.url) || [])])].slice(0, 3);
      const result = await request('chat', {
        prompt, spoken: spoken || inCall, stream: true, history: history.map(({ role, content }) => ({ role, content })),
        files, urls, decision: p.decision, caseId: p.caseId ?? p.id, persist: true,
        project: { id: p.id, title: p.title, decisionVersions: p.decisionVersions },
      }, signal, preview => {
        if (active.current !== task) return;
        setPending(previous => previous && { ...previous, preview });
        onPreview?.(preview);
      }, status => {
        if (active.current === task) setPending(previous => previous && { ...previous, status });
      }, status => {
        if (active.current === task) onSpeechStatus?.(status);
      });
      if (task.abort.signal.aborted) return;
      const updated = current.current;
      const { text: answer, provider, model, sources, charts, usage, warning, reviewed, trace } = result;
      const user: Message = { role: 'user', content: prompt };
      const assistant: Message = { role: 'assistant', content: answer, provider, model, sources, charts, usage, warning, reviewed, trace };
      change({ ...updated, title: updated.messages.length ? updated.title : (prompt.length > 65 ? prompt.slice(0, 62) + '…' : prompt), messages: [...updated.messages, user, assistant] });
      if (!spoken && draftValue.current.trim() === prompt) saveDraft('');
      return (result.spokenText || answer) as string;
    } catch (error) {
      if (!task.abort.signal.aborted) {
        setNotice(deadline?.aborted ? 'Сервер не успел закончить ответ. Повторите запрос или сократите материалы.' : error instanceof Error ? error.message : 'Не удалось отправить запрос.');
        if (spoken) saveDraft([draftValue.current, prompt].filter(Boolean).join('\n'));
        if (inCall) return 'Ответ прервался. Запрос сохранён в поле ввода. Его можно отправить ещё раз.';
      }
    } finally {
      if (active.current === task) { active.current = undefined; setBusy(false); setPending(undefined); }
    }
  }

  const voice = useVoiceChat({ request, onDictation: text => {
    saveDraft([draftValue.current, text].filter(Boolean).join(' '));
    setNotice('Расшифровка добавлена в запрос.');
  }, onTurn: (text, preview, status) => send(text, true, preview, status), cancelTurn: () => cancel(true), report: setNotice });

  useEffect(() => {
    let warming = false;
    const update = () => void fetch('/api/status').then(response => response.json()).then((status: Health) => {
      setHealth(status);
      if (!warming && status.local && status.ollama && !status.online && !status.modelLoaded) {
        warming = true;
        void request('warm', {}).catch(() => {});
      }
    }).catch(() => setHealth(undefined));
    update();
    const interval = window.setInterval(update, 8000);
    return () => { clearInterval(interval); active.current?.abort.abort(); };
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [project.messages.length, pending]);

  async function attach(files: FileList | null) {
    if (!files?.length) return;
    setNotice('');
    try {
      const selected = Array.from(files);
      const names = new Set([...current.current.files, ...selected.map(file => file.name)]);
      if (names.size > 5 || selected.some(file => file.size > 2_000_000)) throw Error('Можно прикрепить до пяти файлов по 2 МБ каждый.');
      await Promise.all(selected.map(file => storeFile(id, file)));
      change({ ...current.current, files: [...new Set([...current.current.files, ...selected.map(file => file.name)])] });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось сохранить файлы.'); }
  }

  return <>
    <div className="work-grid conversation-grid">
      <section className={`chat${voice.mode === 'call' ? ' chat-with-call' : ''}`}>
        <div className="messages" ref={messagesRef} aria-live="polite">
          {project.messages.map(normalize).map((message, index) => <article key={index} className={`chat-message chat-${message.role}`}>
            <small>{message.role === 'user' ? 'Вы' : 'Агент'}</small>
            {message.role === 'user' ? <p>{message.content}</p> : <Markdown skipHtml>{message.content}</Markdown>}
            {message.warning && <p role="status">{message.warning}</p>}
            {message.charts?.map((chart, chartIndex) => <DataChart chart={chart} key={chartIndex}/>)}
          </article>)}
          {!project.messages.length && !pending && voice.mode !== 'call' && <div className="chat-empty"><AgentVisual/><h2>Что нужно решить?</h2><p>Опишите, что изменилось и какой выбор предстоит сделать.</p>{!draft && <div className="chat-suggestions">{scenarios.slice(0, 3).map(([title,, prompt]) => <button type="button" className="btn outline" key={title} onClick={() => { saveDraft(prompt); inputRef.current?.focus(); }}>{title}</button>)}</div>}</div>}
          {pending && <>
            <article className="chat-message chat-user"><small>Вы</small><p>{pending.prompt}</p></article>
            {pending.preview
              ? <article className="chat-message chat-assistant"><small>Агент</small><Markdown skipHtml>{pending.preview}</Markdown></article>
              : <p className="chat-processing" role="status">Готовлю ответ…</p>}
          </>}
        </div>
        {voice.mode === 'call' && <section className="voice-panel voice-call" aria-label="Голосовой разговор" data-phase={voice.phase === 'Отвечаю' ? 'speaking' : voice.phase === 'Слушаю' ? 'listening' : 'working'}>
          <div className="voice-orb" ref={voice.orb} aria-hidden="true">
            <div className="voice-wave voice-wave-left"><i/><i/><i/><i/><i/></div>
            <div className="voice-sphere"><i/><i/></div>
            <div className="voice-wave voice-wave-right"><i/><i/><i/><i/><i/></div>
          </div>
          <p role="status">{voice.muted && voice.phase === 'Слушаю' ? 'Микрофон выключен' : voice.phase}</p>
        </section>}
        <form className="composer chat-composer" onSubmit={event => {
          event.preventDefault();
          if (!busy && draft.trim()) voice.submitInCall((preview, status) => send(draft, false, preview, status));
        }}>
          {health?.gate && <label className="chat-access">Код доступа<input type="password" value={access} autoComplete="off" onChange={event => { const value = event.target.value; setAccess(value); sessionStorage.setItem('contour-access', value); }}/></label>}
          {!!project.files.length && <ul className="composer-attachments">{project.files.map(name => <li key={name}><span>{name}</span><button type="button" aria-label={`Удалить ${name}`} onClick={() => void removeFile(id, name).then(() => change({ ...current.current, files: current.current.files.filter(file => file !== name) })).catch(() => setNotice('Не удалось удалить файл.'))}>×</button></li>)}</ul>}
          <input type="file" hidden multiple accept=".pdf,.docx,.csv,.xlsx,.txt,.md,.srt,.vtt,.jpg,.jpeg,.png,.webp" id="files" onChange={event => { void attach(event.target.files); event.target.value = ''; }}/>
          <div className="composer-field">
            <textarea ref={inputRef} id="draft" aria-label="Запрос" rows={1} value={draft} maxLength={80000} onChange={event => saveDraft(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(pointer:fine)').matches) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} placeholder={voice.mode === 'call' ? 'Сообщение или ссылка' : 'Напишите запрос'}/>
            <div className="chat-actions">
            <button type="button" className="composer-icon" aria-label="Добавить файлы" title="Добавить файлы" onClick={() => document.getElementById('files')?.click()}><ComposerIcon name="attach"/></button>
            {health?.speech && !voice.mode && <button type="button" className="composer-icon" aria-label="Диктовать" title="Диктовать" onClick={() => void voice.start('dictation')}><ComposerIcon name="mic"/></button>}
            {voice.mode === 'dictation' && <button type="button" className="composer-icon is-active" aria-label="Расшифровать" title="Расшифровать" onClick={voice.stop}><ComposerIcon name="stop"/></button>}
            {health?.speech && health.synthesis && !voice.mode && <button type="button" className="composer-icon is-primary" aria-label="Начать разговор" title="Начать разговор" onClick={() => {
              void voice.start('call');
            }}><ComposerIcon name="wave"/></button>}
            {voice.mode === 'call' && <>
              <button type="button" className={`composer-icon${voice.muted ? ' is-active' : ''}`} aria-label={voice.muted ? 'Включить микрофон' : 'Выключить микрофон'} title={voice.muted ? 'Включить микрофон' : 'Выключить микрофон'} aria-pressed={voice.muted} onClick={voice.toggleMute}><ComposerIcon name={voice.muted ? 'mute' : 'mic'}/></button>
              <button type="button" className="composer-icon is-end" aria-label="Завершить разговор" title="Завершить разговор" onClick={voice.stop}><ComposerIcon name="end"/></button>
              {!busy && ['Распознаю речь', 'Готовлю голосовой ответ', 'Отвечаю'].includes(voice.phase) && <button type="button" className="composer-icon" aria-label="Прервать ответ" title="Прервать ответ" onClick={voice.stopAnswer}><ComposerIcon name="stop"/></button>}
            </>}
            {busy
              ? <button type="button" className="composer-icon is-active" aria-label="Остановить запрос" title="Остановить запрос" onClick={() => { voice.stopAnswer(); cancel(); setNotice('Запрос остановлен.'); }}><ComposerIcon name="stop"/></button>
              : (draft.trim() || (!health?.speech && !voice.mode)) && <button className="composer-icon is-primary" aria-label="Отправить" title="Отправить" disabled={!draft.trim()}><ComposerIcon name="send"/></button>}
            </div>
          </div>
          {voice.mode === 'dictation' && <p role="status">{voice.phase === 'Слушаю' ? 'Диктовка' : voice.phase}</p>}
          {!!notice && <p role="status">{notice}</p>}
          {!notice && health?.voiceLoading && !voice.mode && <p role="status">Голос станет доступен после загрузки речевой модели.</p>}
        </form>
      </section>

    </div>
  </>;
}
