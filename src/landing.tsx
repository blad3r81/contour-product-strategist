import {useState} from 'react';
import {films} from './megafon-editorial';
import {SourceFlip} from './agent-visuals';
export type Card=[string,string,string,number];
export const process:Card[]=[
 ['Уточнить задачу','Сформулируйте вопрос, от которого зависит решение.','Помоги уточнить продуктовую задачу, цель и ограничения.',0],
 ['Собрать материалы','Добавьте документы, таблицы и открытые источники.','Помоги понять, какие материалы нужны для исследования.',1],
 ['Проверить выводы','Отделите факты и расчёты от гипотез.','Помоги проверить, какие выводы подтверждаются источниками.',2],
 ['Сравнить варианты','Сопоставьте пользу, затраты и возражения.','Помоги сравнить варианты, включая сохранение текущего подхода и закрытие направления.',3],
 ['Зафиксировать выбор','Запишите основания, ответственного и срок.','Помоги зафиксировать решение, основания и план проверки.',4],
 ['Пересмотреть решение','Проверьте, меняют ли новые данные рекомендацию.','Помоги понять, какие выводы затронуты новыми данными.',5]
];
export const scenarios:Card[]=[
 ['Почему падает удержание?','Найдите этап, на котором уходят пользователи.','Новые пользователи стали реже возвращаться. Помоги понять, где возникает проблема и какие данные это проверят.',6],
 ['Для кого запускать сервис?','Сравните аудитории и выберите, где проверить спрос.','Помоги сравнить аудитории нового сервиса и выбрать, для кого проверить спрос.',7],
 ['Как объяснить ценность?','Свяжите сообщение с тем, что даёт продукт.','Помоги определить барьер понимания и сформулировать проверяемое обещание.',8],
 ['Где пользователи застревают?','Разберите путь до первого полезного действия.','Помоги найти барьеры между первым входом и первым полезным действием.',9],
 ['Как проверить гипотезу?','Определите метрику, сравнение и срок.','Помоги спланировать проверку гипотезы и выбрать метрики.',10],
 ['Стоит ли продолжать направление?','Сопоставьте пользу, затраты и альтернативы.','Помоги определить, стоит ли продолжать, менять или закрывать направление.',11]
];



type Start = (prompt:string,sources?:{label:string;url:string}[])=>void;

const taskVisuals = [
  'M12 23 34 32 52 28 70 46 91 57 M12 43 34 46 52 41 70 43 91 40',
  'M14 47H43 M43 47 68 18H94 M43 47H94 M43 47 68 75H94',
  'M15 16H90V59H49L33 74V59H15Z M29 31H75 M29 43H62',
  'M12 25H91 M20 45H77 M31 65H63 M75 56 86 67 M86 56 75 67',
  'M13 45H38 M38 45 59 22H94 M38 45 59 68H94 M70 14V30 M83 60V76',
  'M14 44H45 M45 44 68 19H92 M45 44 68 69H92 M83 10 92 19 83 28',
];

const caseExamples = [
  {
    label:'МегаФон ТВ',
    film:films[1],
    question:'Повторять кампанию в другом регионе?',
    evidence:'В Поволжье кампания охватила 4,14 млн при плане 3,5 млн.',
    options:['Повторить кампанию','Запустить ограниченный пилот','Отложить расширение'],
    tradeoffs:['Быстрый запуск, но охват не показывает, сколько людей включили концерт.','Пилот даст данные о просмотрах до масштабирования.','Сохраняет бюджет, но откладывает проверку в новом регионе.'],
    check:'Сравнить стоимость просмотра концерта по каналам.',
  },
  {
    label:'Бренд',
    film:films[0],
    question:'Как объяснить пользу продукта в рекламе?',
    evidence:'В интервью команда обсуждает, как сделать рекламу человечнее.',
    options:['Показать знакомую ситуацию','Объяснить выгоду напрямую','Сохранить текущий ролик'],
    tradeoffs:['Ситуация помогает узнать себя, но пользу могут не считать.','Пользу легче понять, но сообщение может запомниться хуже.','Текущий ролик подходит как контроль для сравнения.'],
    check:'Проверить, как зрители своими словами объясняют предложение.',
  },
  {
    label:'ПроБизнес',
    film:films[2],
    question:'Как выбрать канал для первой кампании?',
    evidence:'В выступлении перечислены факторы, которые влияют на выбор стратегии продвижения.',
    options:['Начать с одного канала','Сравнить два канала','Сначала уточнить аудиторию'],
    tradeoffs:['Проще запустить, но сравнивать результат будет не с чем.','Можно сравнить стоимость результата, если аудитории и предложения сопоставимы.','Уточнение сегмента снижает риск потратить бюджет на широкую аудиторию.'],
    check:'Сравнить стоимость целевого действия при одинаковом бюджете.',
  },
];

export function TaskExamples({onPick}:{onPick:Start}){
  return <section className="wrap section task-section" id="scenarios">
    <div className="visual-section-heading"><h2>С чего начать</h2><p>Выберите задачу. Черновик запроса уже готов.</p></div>
    <div className="visual-tasks">{scenarios.map(([title,description,prompt],index)=><button className="visual-task" type="button" key={title} onClick={()=>onPick(prompt)}>
      <svg className="task-diagram" viewBox="0 0 106 88" fill="none" aria-hidden="true">
        <path className="diagram-grid" d="M10 17H96 M10 44H96 M10 71H96 M25 10V79 M53 10V79 M81 10V79"/>
        <path className="diagram-mark" d={taskVisuals[index]}/>
      </svg>
      <span><strong>{title}</strong><small>{description}</small></span>
    </button>)}</div>
  </section>;
}

export function ResearchProcess({onPick}:{onPick:Start}){
  const [active,setActive]=useState(0);
  const [option,setOption]=useState(1);
  const current=caseExamples[active];
  const source={label:current.film.title,url:current.film.source};

  return <section className="case-lab" id="process"><div className="wrap section">
    <div className="visual-section-heading">
      <div><p className="lab-kicker">Примеры на открытых материалах МегаФона</p><h2>От материалов к рекомендациям</h2></div>
      <p>Выберите кейс и посмотрите весь ход разбора прямо здесь.</p>
    </div>
    <div className="case-switcher" aria-label="Выбрать кейс">
      {caseExamples.map((item,index)=><button className="case-switch" type="button" key={item.label} aria-pressed={active===index} aria-controls="case-analysis" onClick={()=>{setActive(index);setOption(1)}}>
        <img src={item.film.image} alt="" loading="lazy" width="160" height="90"/><span>{item.label}</span>
      </button>)}
    </div>
    <div className="case-analysis" id="case-analysis" key={current.label} aria-live="polite">
      <div className="case-question">
        <span>Продуктовый вопрос</span><h3>{current.question}</h3>
        <button className="btn primary" type="button" onClick={()=>onPick('Разбери этот кейс: '+current.question+' Сравни варианты и предложи проверку.',[source])}>Открыть как задачу</button>
        {active===0&&<SourceFlip/>}
      </div>
      <ol className="analysis-path">
        <li><span className="analysis-node" aria-hidden="true">1</span><div><h4>Что известно</h4><p>{current.evidence}</p><a href={source.url} target="_blank" rel="noreferrer">Открыть источник</a></div></li>
        <li><span className="analysis-node" aria-hidden="true">2</span><div><h4>Что сравнить</h4><ul>{current.options.map((label,index)=><li key={label}><button type="button" aria-pressed={option===index} onClick={()=>setOption(index)}>{label}</button></li>)}</ul><p className="option-tradeoff" aria-live="polite">{current.tradeoffs[option]}</p></div></li>
        <li><span className="analysis-node" aria-hidden="true">3</span><div><h4>Что проверить дальше</h4><p>{current.check}</p></div></li>
      </ol>
    </div>
  </div></section>;
}


const previewSteps = [
  {label:'Вопрос',title:'Почему падает удержание?',text:'Уточнить, какая группа пользователей стала реже возвращаться и на каком шаге.'},
  {label:'Основания',title:'Где теряем пользователей?',text:'Сравнить когорты и интервью. Проверить, связаны ли потери с первым запуском.'},
  {label:'Решение',title:'Проверить новый первый шаг',text:'Сравнить пилот, текущий сценарий и отказ от направления. Пересмотреть выбор по удержанию на 7-й день.'},
];

export function HeroDecisionPreview(){
  const [step,setStep]=useState(0);
  const current=previewSteps[step];

  return <aside className="hero-decision" aria-label="Пример исследования">
    <div className="hero-decision-caption"><span aria-hidden="true"/>Пример исследования</div>
    <div className="hero-decision-steps" aria-label="Выбрать этап исследования">
      {previewSteps.map(({label},index)=><button type="button" key={label} aria-pressed={step===index} onClick={()=>setStep(index)}>{label}</button>)}
    </div>
    <div className="hero-decision-result" aria-live="polite">
      <div className="hero-decision-copy" key={step}>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
      </div>
    </div>
  </aside>;
}

export function DecisionOutputs(){
  return <section className="wrap section decision-outputs" aria-labelledby="decision-outputs-heading">
    <h2 id="decision-outputs-heading">Что остаётся после выбора</h2>
    <div className="decision-output-grid">
      <article><h3>Продуктовая стратегия</h3><p>Кому помогаем, что меняем и почему выбрали этот вариант.</p></article>
      <article><h3>Коммуникационная стратегия</h3><p>Как объясняем ценность и чем подтверждаем обещание.</p></article>
      <article><h3>Условия пересмотра</h3><p>Кто проверяет результат, по какой метрике и когда возвращаемся к выбору.</p></article>
    </div>
  </section>;
}


