import {useLayoutEffect,useRef,useState} from 'react';
import './megafon-editorial.css';

export const films = [
  {
    title: 'Как меняется реклама МегаФона',
    credit: 'Татьяна Гура и Александр Петров · AdIndex',
    image: '/megafon/brand.png',
    source: 'https://adindex.ru/tv/in_trend/344946.phtml',
    player: 'https://vkvideo.ru/video_ext.php?oid=-14899079&id=456246550&hash=172f12d1e1240ec5&hd=4&autoplay=1',
  },
  {
    title: 'Как продвигали концерты МегаФон ТВ',
    credit: 'Кейс команды Digital Info',
    image: '/megafon/tv.jpg',
    source: 'https://rutube.ru/video/f4c3cff8d7fd7a7e75faf0ba30efc3f6/',
    player: 'https://rutube.ru/play/embed/f4c3cff8d7fd7a7e75faf0ba30efc3f6/?autoplay=1',
  },
  {
    title: 'Как коммуникации помогают продажам',
    credit: 'Юлия Кубеш · МегаФон ПроБизнес и РБК',
    image: '/megafon/sales.jpg',
    source: 'https://rutube.ru/video/d8177683f2e094e818846e6428a81104/',
    player: 'https://rutube.ru/play/embed/d8177683f2e094e818846e6428a81104/?autoplay=1',
  },
];

export function FilmPlayer({film, startPlaying=false}: {film: typeof films[number]; startPlaying?: boolean}) {
  const [playing, setPlaying] = useState(startPlaying);
  return <div className="film-player">
    <div className="film-frame">
      {playing ? <iframe title={film.title} src={film.player} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen/> :
        <button type="button" className="film-cover" onClick={()=>setPlaying(true)} aria-label={'Смотреть: '+film.title}>
          <img src={film.image} alt=""/><span className="film-play" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M6 3.5 14 9l-8 5.5Z" fill="currentColor"/></svg></span>
        </button>}
    </div>
    <div className="film-credit"><span>{film.credit}</span><a href={film.source} target="_blank" rel="noreferrer">У источника</a></div>
  </div>;
}

export function HeroFilms(){
  const backdrop = useRef<HTMLDivElement>(null);

  useLayoutEffect(()=>{
    const host = backdrop.current;
    const buffer = document.getElementById('hero-video-buffer');
    const video = document.querySelector<HTMLVideoElement>('#hero-video');
    if (!host || !buffer || !video) return;

    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    function resumePlayback(){
      if (video && !preference.matches && !document.hidden && video.paused) void video.play().catch(()=>{});
    }
    function updatePlayback(){
      if (!host || !buffer || !video) return;
      if (preference.matches) {
        video.pause();
        buffer.append(video);
        if (video.hasAttribute('src')) {
          video.removeAttribute('src');
          video.load();
        }
        return;
      }
      if (video.parentElement !== host) host.append(video);
      video.muted = true;
      if (!video.hasAttribute('src') && video.dataset.src) video.src = video.dataset.src;
      resumePlayback();
    }

    updatePlayback();
    preference.addEventListener('change',updatePlayback);
    video.addEventListener('canplay',resumePlayback);
    document.addEventListener('visibilitychange',resumePlayback);
    window.addEventListener('pageshow',resumePlayback);
    return ()=>{
      preference.removeEventListener('change',updatePlayback);
      video.removeEventListener('canplay',resumePlayback);
      document.removeEventListener('visibilitychange',resumePlayback);
      window.removeEventListener('pageshow',resumePlayback);
      video.pause();
      buffer.append(video);
    };
  },[]);

  return <div ref={backdrop} className="hero-backdrop" aria-hidden="true"/>;
}
export function ScrollTrace(){
  const route="M354 12 H303 L269 82 H220 L188 162 H149 L115 254 H78 L44 348 H24 L5 431";
  return <svg className="scroll-trace" viewBox="0 0 360 440" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <path className="trace-track" d={route} vectorEffect="non-scaling-stroke"/>
    <path className="trace-progress" d={route} pathLength="1" vectorEffect="non-scaling-stroke"/>
  </svg>;
}
export const processNotes = [
  {image:films[0].image, note:'МегаФон и AdIndex', text:'Какая задача стоит за изменением тона рекламы?', film:films[0]},
  {image:films[2].image, note:'МегаФон ПроБизнес и РБК', text:'Какие источники помогут проверить связь коммуникаций с продажами?', film:films[2]},
  {image:films[1].image, note:'Digital Info · МегаФон ТВ', text:'Сопоставьте план и факт. Уточните, чего охват не объясняет.', film:films[1]},
  {image:'/megafon/tariff-a.png', note:'Каталог МегаФона', text:'Мега5G обещает ускорение интернета, МегаСемья позволяет делиться тарифом. Сравните задачи аудитории и условия.', source:'https://shop.megafon.ru/connect/tariffs'},
  {image:films[2].image, note:'МегаФон ПроБизнес и РБК', text:'Зафиксируйте, какую метрику и за какой срок проверит команда.', film:films[2]},
  {image:films[1].image, note:'Digital Info · МегаФон ТВ', text:'Определите, какие новые данные могут изменить решение о масштабировании.', film:films[1]},
];



const reviewBranches = [
  {label:'Повторить',path:'M38 80H144Q165 80 180 62L205 30H324',y:30,check:'Проверить, повторяется ли доля просмотров в новом регионе.'},
  {label:'Пилот',path:'M38 80H324',y:80,check:'На одной аудитории сравнить стоимость просмотра по двум каналам.'},
  {label:'Пауза',path:'M38 80H144Q165 80 180 98L205 130H324',y:130,check:'Уточнить, сколько зрителей включили концерт после рекламы.'},
];

export function ReviewDecision({onStart}: {onStart:(direction:string,check:string)=>void}){
  const [selected,setSelected]=useState(1);
  const branch=reviewBranches[selected];
  return <section className="follow-new"><div className="wrap section review-layout">
    <div className="review-copy">
      <h2>Решение остаётся в работе</h2>
      <p>У кампании МегаФон ТВ есть данные об охвате. Перед повторным запуском нужно понять, сколько людей после рекламы включили концерт.</p>
      <button type="button" className="btn outline" onClick={()=>onStart(branch.label,branch.check)}>Разобрать решение</button>
    </div>
    <figure className="review-chart decision-graph">
      <figcaption>Как проверить следующий шаг</figcaption>
      <svg className="decision-branches" viewBox="0 0 362 160" fill="none" aria-hidden="true">
        {reviewBranches.map(item=><path key={item.label} className="branch-track" d={item.path}/>)}
        <path className="branch-active" key={branch.label} d={branch.path} pathLength="1"/>
        <circle className="branch-origin" cx="38" cy="80" r="7"/>
        {reviewBranches.map(item=><circle key={item.label} className="branch-end" cx="324" cy={item.y} r="5"/>)}
        <circle className="branch-cursor" cx="324" cy="80" r="8" style={{transform:'translateY('+(branch.y-80)+'px)'}}/>
      </svg>
      <div className="branch-actions" aria-label="Выбрать направление">
        {reviewBranches.map((item,index)=><button type="button" key={item.label} className="btn outline" aria-pressed={index===selected} onClick={()=>setSelected(index)}>{item.label}</button>)}
      </div>
      <div className="branch-check" aria-live="polite"><strong>Что проверить</strong><p>{branch.check}</p></div>
      <a href={films[1].source} target="_blank" rel="noreferrer">Исходный кейс Digital Info</a>
    </figure>
  </div></section>;
}

