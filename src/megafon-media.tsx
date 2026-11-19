import {useState} from 'react';
import './megafon-media.css';

const recordings = [
  {
    title: 'Как меняется стратегия бренда',
    detail: 'Татьяна Гура, директор по бренду и маркетинговым коммуникациям МегаФона и Yota',
    source: 'https://adindex.ru/tv/in_trend/344946.phtml',
    player: 'https://vkvideo.ru/video_ext.php?oid=-14899079&id=456246550&hash=172f12d1e1240ec5&hd=4',
  },
  {
    title: 'Как выбирают рекламные каналы',
    detail: 'Видеоподкаст МегаФон ПроБизнес о стратегии, медиамиксе и поведении аудитории',
    source: 'https://online-event.megafon.ru/podcast1',
  },
  {
    title: 'Как команды измеряют эффект',
    detail: 'Видеообзор исследования цифровизации малого бизнеса от МегаФон ПроБизнес и ORO',
    source: 'https://online-event.megafon.ru/indexmb',
  },
  {
    title: 'Цифровые коммуникации для роста продаж',
    detail: 'Выступление Юлии Кубеш, директора по рекламным продуктам МегаФон ПроБизнес, на мероприятии РБК',
    source: 'https://rutube.ru/video/d8177683f2e094e818846e6428a81104/',
    player: 'https://rutube.ru/play/embed/d8177683f2e094e818846e6428a81104/',
  },
];

export function MegafonRecordings() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = recordings[selected];
  return <div className="megafon-recordings" aria-label="Видео с экспертами МегаФона">
    <div className="recording-stage">
      {playing && current.player ? (
        <iframe key={current.player} src={current.player} title={current.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      ) : (
        <div className="recording-intro">
          <span>Практика МегаФона</span>
          <h2>{current.title}</h2>
          <p>{current.detail}</p>
          {current.player && <button type="button" className="btn recording-play" onClick={() => setPlaying(true)}>Смотреть здесь</button>}
        </div>
      )}
    </div>
    <div className="recording-selector" aria-label="Выбрать запись">
      {recordings.map((entry, index) => <button key={entry.title} type="button" className="btn" aria-pressed={index === selected} onClick={() => {setSelected(index);setPlaying(false)}}>{['Бренд', 'Каналы', 'Исследование', 'Продажи'][index]}</button>)}
    </div>
    <a href={current.source} target="_blank" rel="noreferrer">Открыть запись у источника</a>
  </div>;
}

export function MegafonWorkSources() {
  return <aside className="wrap work-sources" aria-label="Материалы о работе МегаФона">
    <h3>Как устроена работа в МегаФоне</h3>
    <div className="work-photos">
      <img src="https://static.tildacdn.com/tild3836-6366-4333-a233-366539623831/IMG-20210212-WA0010.jpg" alt="Обучение работе в видеостудии МегаФона" loading="lazy" referrerPolicy="no-referrer"/>
      <img src="https://static.tildacdn.com/tild3338-6336-4965-b332-373637616538/IMG-20210212-WA0007.jpg" alt="Видеостудия корпоративного университета МегаФона" loading="lazy" referrerPolicy="no-referrer"/>
    </div>
    <a href="https://jalinga.ru/blog/obuchenie-v-megafon" target="_blank" rel="noreferrer">Фото с обучения в корпоративном университете · Jalinga</a>
    <a href="https://chulakov.ru/work/megafon-job" target="_blank" rel="noreferrer">Офис и сотрудники в кейсе HR-портала</a>
    <a href="https://synergy.ru/about/blog/studentyi_fakulteta_informaczionnyix_texnologij_posetili_s_ekskursiej_ofis_kompanii_megafon" target="_blank" rel="noreferrer">Фоторепортаж из офиса</a>
    <a href="https://online-event.megafon.ru/adtechindex" target="_blank" rel="noreferrer">Материалы исследования цифровой рекламы</a>
  </aside>;
}


