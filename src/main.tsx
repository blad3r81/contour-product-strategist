import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useNavigate,useParams} from 'react-router-dom';
import '@fontsource-variable/manrope';
import '@fontsource-variable/golos-text';
import './style.css';
import {DecisionOutputs,HeroDecisionPreview,ResearchProcess,TaskExamples} from './landing';
import type {CaseSource} from './showcase';
import {films,HeroFilms,ReviewDecision,ScrollTrace} from './megafon-editorial';
import './product-review.css';
import {WorkspaceChat, type Project} from './workspace-chat';
import {SavedCase} from './saved-case';


const key='contour-projects-v2';
function read():Project[]{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}}
function save(p:Project){localStorage.setItem(key,JSON.stringify([p,...read().filter(x=>x.id!==p.id)]))}
function Mark(){return <svg width="28" height="28" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M15 2.5 27 9v12l-12 6.5L3 21V9L15 2.5Z" stroke="currentColor" strokeWidth="1.7"/><path d="m3 9 12 6.5L27 9m-12 6.5v12M9 5.8l12 6.4" stroke="currentColor" strokeWidth="1.7"/></svg>}
function Header({home=false,onDialog}:{home?:boolean;onDialog?:()=>void}){const nav=useNavigate();function go(id:string){if(!home){nav('/#'+id);return}document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}return <header className={home?'header dark hero-header':'header'}><div className="wrap nav"><button className="brand" onClick={()=>home?window.scrollTo({top:0,behavior:'instant'}):nav('/')}><Mark/>Контур решения</button>{home&&<nav aria-label="Разделы сайта" className="header-sections"><button onClick={()=>go('process')}>Разборы</button><button onClick={()=>go('scenarios')}>С чего начать</button><button onClick={()=>go('projects')}>Мои проекты</button></nav>}<button className="btn subtle" onClick={home?onDialog:()=>go('projects')}>{home?'К диалогу':'Мои проекты'}</button></div></header>}
function projectDisplayTitle(project:Project){
  const draft=sessionStorage.getItem('draft:'+project.id)?.trim();
  if(project.title!=='Новый проект' || !draft) return project.title;
  return draft.length>65 ? draft.slice(0,62)+'…' : draft;
}
function isBlankProject(project:Project){
  return project.title==='Новый проект' && !project.messages.length && !project.files.length &&
    !project.sources?.length && !Object.values(project.decision).some(value=>value.trim()) &&
    !sessionStorage.getItem('draft:'+project.id)?.trim();
}
function Home(){const nav=useNavigate(),hero=useRef<HTMLElement>(null);
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const [projects,setProjects]=useState(read);
const blank=projects.find(isBlankProject);
const start=(prompt='',sources:CaseSource[]=[])=>{
  if(!prompt && sources.length===0 && blank){
    nav('/projects/'+blank.id);
    return;
  }
  const project={id:crypto.randomUUID(),title:'Новый проект',messages:[],files:[],sources,decision:{}};
  save(project);
  if(prompt) sessionStorage.setItem('draft:'+project.id,prompt);
  nav('/projects/'+project.id);
};
useEffect(()=>{if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView();else scrollTo(0,0);const el=hero.current;if(!el||reduced())return;let f=0;const update=()=>{f=0;el.style.setProperty('--p',String(Math.min(1,Math.max(0,scrollY/(el.offsetHeight*.8)))))};const onScroll=()=>{if(!f)f=requestAnimationFrame(update)};window.addEventListener('scroll',onScroll,{passive:true});update();return()=>{window.removeEventListener('scroll',onScroll);cancelAnimationFrame(f)}},[]);
const items=projects.filter(project=>project===blank || !isBlankProject(project));
return <><Header home onDialog={()=>start()}/><main className="landing">
<section ref={hero} className="hero new-hero editorial-hero"><div className="wrap hero-grid"><div className="hero-copy"><h1>От вопроса<br/><span>к <strong>стратегии</strong></span></h1><p className="intro">ИИ-помощник руководителя продукта. От первых вводных до стратегии, которую можно проверить.</p><div className="hero-actions"><button className="btn primary" onClick={()=>start()}>Начать исследование</button><button className="btn hero-preview" type="button" onClick={()=>document.getElementById('process')?.scrollIntoView({behavior:reduced()?'instant':'smooth'})}>Посмотреть разбор</button></div><HeroDecisionPreview/></div><HeroFilms/></div><ScrollTrace/></section>
<ResearchProcess onPick={start}/>
<TaskExamples onPick={start}/>
<ReviewDecision onStart={(direction,check)=>start("Разбери кампанию МегаФон ТВ в Поволжье. Рассмотри вариант «"+direction+"». "+check, [{label:films[1].title,url:films[1].source}])}/>
<DecisionOutputs/>
<section className="projects" id="projects"><div className="wrap section"><div className="projects-panel"><div className="project-art" aria-hidden="true"/><div className="projects-content"><div className="projects-heading"><h2>Мои проекты</h2>{items.length>0&&<button className="btn subtle" onClick={()=>{localStorage.setItem('contour-projects-trash',JSON.stringify(projects));localStorage.removeItem(key);setProjects([])}}>Очистить историю</button>}</div>{items.length?<div className="project-list">{items.map(p=><button className="project-item" key={p.id} onClick={()=>nav('/projects/'+p.id)} >{projectDisplayTitle(p)}<span>{p.messages.length?'Открыть проект':'Черновик'}</span></button>)}</div>:<p>Вернитесь сюда, чтобы продолжить исследование или проверить решение.</p>}</div></div></div></section>
</main><footer className="wrap footer"><Mark/> Контур решения</footer></>}

const fields=[['choice','Выбранный вариант'],['why','Основания решения'],['product','Продуктовая стратегия'],['communication','Коммуникационная стратегия'],['check','План проверки'],['owner','Ответственный'],['date','Дата проверки'],['trigger','Условие пересмотра'],['updates','Новые сведения']];
function Workspace({decision=false}:{decision?:boolean}) {
  const { id } = useParams();
  const nav = useNavigate();
  const project = read().find(item => item.id === id);
  const [updated, setUpdated] = useState<Project>();
  const p = updated?.id === id ? updated : project;
  useEffect(() => { window.scrollTo(0, 0); }, [id, decision]);
  function change(next: Project) { save(next); setUpdated(next); }
  if (!p) return <><Header/><main className="wrap section"><h1>Проект не найден</h1><button className="btn" onClick={() => nav('/')}>На главную</button></main></>;
  const path = '/projects/' + p.id;
  const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
  const checkDue = Boolean(p.decision.choice?.trim() && p.decision.date && p.decision.date <= today);
  const versions = p.decisionVersions ?? [];
  const versionSaved = JSON.stringify(versions.at(-1)?.fields) === JSON.stringify(p.decision);
  return <><Header/><main className={decision ? 'wrap workspace' : 'wrap workspace conversation'}>
    <div className="work-heading"><div><p className="eyebrow">{decision ? 'Сопровождение' : 'Исследование'}</p><h1>{decision ? 'Карточка решения' : p.title}</h1></div>
      <button className="btn outline" onClick={() => nav(decision ? path : path + '/decision')}>{decision ? 'К диалогу' : 'Карточка решения'}</button></div>
    {decision ? <div className="form-grid">{checkDue && <p role="status">Наступила дата проверки решения. Добавьте новые сведения и запустите пересмотр.</p>}{fields.map(([key,label]) =>
      <label key={key}>{label}{['date','owner'].includes(key) ?
        <input type={key === 'date' ? 'date' : 'text'} value={p.decision[key] || ''} onChange={e => change({...p,decision:{...p.decision,[key]: e.target.value}})}/> :
        <textarea rows={key === 'choice' ? 2 : 3} value={p.decision[key] || ''} onChange={e => change({...p,decision:{...p.decision,[key]: e.target.value}})}/>}
      </label>)}
      <button className="btn primary" disabled={!p.decision.choice?.trim()} onClick={() => {
        const key = `draft:${p.id}`;
        const previous = sessionStorage.getItem(key);
        const request = 'Пересмотри сохранённое решение. Сопоставь новые сведения с основаниями и условием пересмотра. Укажи, что подтверждено, чего не хватает, какое действие следует выполнить и кто за него отвечает.';
        if (!previous?.includes(request)) sessionStorage.setItem(key, [previous, request].filter(Boolean).join('\n\n').slice(0, 80000));
        nav(path);
      }}>Проверить решение</button>
      <button className="btn outline" disabled={!p.decision.choice?.trim() || versionSaved} onClick={() => {
        change({ ...p, decisionVersions: [...versions, { savedAt: new Date().toISOString(), fields: { ...p.decision } }] });
      }}>{versionSaved ? 'Версия сохранена' : 'Сохранить версию решения'}</button>
      <p className="muted">Изменения и версии сохраняются в этом браузере.</p>
      {versions.length > 0 && <details>
        <summary>История решений ({versions.length})</summary>
        <ol reversed>{[...versions].reverse().map(version => <li key={version.savedAt}>
          <details><summary>{new Date(version.savedAt).toLocaleString('ru-RU')} · {version.fields.choice}</summary>
            <dl>{fields.filter(([key]) => version.fields[key]?.trim()).map(([key, label]) => <div key={key}>
              <dt>{label}</dt><dd>{version.fields[key]}</dd>
            </div>)}</dl>
          </details>
        </li>)}</ol>
      </details>}
    </div> : <WorkspaceChat key={p.id} project={p} onChange={change}/>}
  </main></>;
}
function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/projects/:id" element={<Workspace/>}/><Route path="/projects/:id/decision" element={<Workspace decision/>}/><Route path="/cases/:id" element={<SavedCase/>}/><Route path="*" element={<Home/>}/></Routes>}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);























