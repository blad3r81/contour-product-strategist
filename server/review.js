const clean = value => value?.trim() ?? '';
const number = value => Number(value?.replace(',', '.'));
const format = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(value);

export function tableReview(trigger, ratios) {
  const rule = clean(trigger).match(/^(.+?)\s+(выше|ниже|[<>])\s*(\d+(?:[,.]\d+)?)\s*%[.!]?$/iu);
  if (!rule) return;
  const [, metric, operator, raw] = rule;
  const threshold = number(raw);
  if (threshold > 100) return;
  const normalized = value => clean(value.replace(/\s*\(%\)$/, '')).toLowerCase();
  const samples = ratios.filter(entry => normalized(entry.label) === normalized(metric));
  if (samples.length !== 1) return;
  const { part, total, source, row } = samples[0];
  const share = part / total * 100;
  const higher = operator === '>' || operator.toLowerCase() === 'выше';
  const crossed = higher ? share > threshold : share < threshold;
  return {
    crossed,
    summary: `${metric}, [${source}], строка данных ${row}: ${part} / ${total} = ${format(share)}%. Порог пересмотра — ${higher ? 'выше' : 'ниже'} ${format(threshold)}%. ${crossed ? 'Условие пересмотра сработало.' : 'Условие пересмотра пока не сработало.'}`,
    check: 'Сверить правила подсчёта, период и сопоставимость групп с исходным замером.',
  };
}
