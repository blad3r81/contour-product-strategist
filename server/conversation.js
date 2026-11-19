import { readCase, saveCase } from './cases.js';

export async function persistConversation(data, result) {
  const id = data.caseId;
  let saved;
  try { saved = await readCase(id); } catch (error) {
    if (error.code !== 'ENOENT' && error.message !== 'У дела нет сохранённого состояния.') throw error;
  }
  const previous = saved?.state;
  const oldMessages = previous?.project?.messages ?? (Array.isArray(data.history) ? data.history.filter(item => item && ['assistant', 'user'].includes(item.role) && typeof item.content === 'string') : []);
  const history = [...oldMessages, { role: 'user', content: data.prompt }, { role: 'assistant', content: result.text, ...result }];
  const decision = data.decision ?? previous?.decision ?? {};
  const versions = data.project?.decisionVersions ?? previous?.project?.decisionVersions ?? [];
  const files = data.files ?? previous?.files ?? [];
  const title = previous?.project?.title ?? (data.project?.title && data.project.title !== 'Новый проект' ? data.project.title : data.prompt.slice(0, 65));
  const state = {
    ...previous,
    stage: decision.choice ? 'review' : result.validation?.status === 'proposal' ? 'options' : 'research',
    task: previous?.task ?? data.prompt,
    next: result.incomplete ? 'Повторить незавершённый анализ по сохранённым материалам.'
      : decision.choice ? 'Сверить новые данные с основаниями и условиями пересмотра.'
        : 'Согласовать с руководителем вариант, план проверки и ответственного.',
    files, decision,
    project: { id, caseId: id, title, messages: history, files: files.map(file => file.name), decision, decisionVersions: versions },
    evidence: result.sources?.filter(source => source.excerpt && !source.error).map(source => ({ source: source.name || source.url, quote: source.excerpt })) ?? [],
    execution: result.trace,
  };
  return saveCase(id, state, saved?.revision ?? null);
}
