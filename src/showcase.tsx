import './showcase.css';

export type CaseSource = {label: string; url: string};
export type ResearchCase = {title: string; note: string; prompt: string; photo: number; sources: CaseSource[]};

export const researchCases: ResearchCase[] = [
  {
    title: 'Что говорят данные о рекламных каналах?',
    note: 'Разбор исследования МегаФон ПроБизнес',
    prompt: 'Разбери открытый индекс цифровой рекламы и коммуникаций МегаФон ПроБизнес. Какие данные помогают выбрать канал для нового сервиса? Отдели выводы отчёта от гипотез и предложи проверку.',
    photo: 2,
    sources: [{label: 'Видеообзор и отчёт', url: 'https://online-event.megafon.ru/adtechindex'}],
  },
  {
    title: 'Как объяснить пользу «Евы»?',
    note: 'Ценность помощника в конкретной ситуации',
    prompt: 'Разбери кампанию «Ева». Определи аудиторию и барьер, сформулируй обещание и укажи, чем оно подтверждено. Предложи два способа проверить, как зритель понимает пользу.',
    photo: 8,
    sources: [{label: 'Ролик и описание кампании', url: 'https://timerek.ru/2025/02/09/reklama-megafon-eva-guzeeva-2025/'}],
  },
  {
    title: 'Как связать разные предложения одной идеей?',
    note: 'Серия роликов с Ириной Горбачёвой',
    prompt: 'Разбери серию МегаФон × Ирина Горбачёва. Какие элементы связывают предложения и что меняется от ролика к ролику? Сравни подход с отдельными роликами и предложи критерий выбора.',
    photo: 4,
    sources: [{label: 'Видео и кейс SETTERS', url: 'https://www.setters.agency/cases/megafon-x-irina-gorbachyova'}],
  },
  {
    title: 'Какие ожидания создаёт название «Мега 5G»?',
    note: 'Сопоставление рекламы и условий услуги',
    prompt: 'Сопоставь ролик «Мега 5G» и официальные условия предложения. Раздели факты и возможные интерпретации зрителя. Предложи формулировку и способ проверить понимание.',
    photo: 10,
    sources: [
      {label: 'Ролик и описание кампании', url: 'https://timerek.ru/2026/09/21/reklama-megafon-mega-5g-aleksandr-petrov-2026/'},
      {label: 'Условия МегаФона', url: 'https://shop.megafon.ru/actions/vygoda-na-smartfony-so-svyazyu'},
    ],
  },
];

export function Cases({onStart}: {onStart: (item: ResearchCase) => void}) {
  return <section className="case-section" aria-labelledby="case-title">
    <div className="wrap section">
      <h2 id="case-title">Задачи на материалах МегаФона</h2>
      <div className="case-grid">
        {researchCases.map(item => <article className="case-card" key={item.title}>
          <img src={'/photo-' + item.photo + '.jpg'} alt="" loading="lazy"/>
          <div className="case-body">
            <p>{item.note}</p>
            <h3>{item.title}</h3>
            <ul>{item.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul>
            <button type="button" className="btn outline" onClick={() => onStart(item)}>Начать разбор</button>
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}

export function DecisionExample() {
  return <div className="decision-compare">
    <p className="compare-caption">Пример пересмотра решения</p>
    <dl>
      <div><dt>До проверки</dt><dd>Запустить пилот коротких видео.</dd></div>
      <div><dt>Новые сведения</dt><dd>В этом примере просмотры выросли, а целевых действий больше не стало.</dd></div>
      <div><dt>После проверки</dt><dd>Проверить переход из ролика в продукт перед масштабированием.</dd></div>
    </dl>
  </div>;
}

