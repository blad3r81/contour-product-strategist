import {useState,useSyncExternalStore} from 'react';
import ImageFlipper from './originkit/ImageFlipper';
import NetworkLines from './originkit/NetworkLines';

const motionQuery='(prefers-reduced-motion: reduce)';
function subscribeMotion(update:()=>void){
  const query=matchMedia(motionQuery);
  query.addEventListener('change',update);
  return ()=>query.removeEventListener('change',update);
}
function reducedMotion(){return matchMedia(motionQuery).matches}

export function AgentVisual(){
  const reduced=useSyncExternalStore(subscribeMotion,reducedMotion);
  return <div className="agent-visual" aria-hidden="true">
    {!reduced&&<NetworkLines background="#211630" baseColor="#c6a5de" accentColor="#8ee9ad" density={29} speed={23} hover={65} linkDistance={48} network={{halo:110,pulse:22,lineWidth:74}} style={{minWidth:0,minHeight:0}}/>}
    <svg className="agent-core" viewBox="0 0 56 56" fill="none">
      <path d="M28 5 48 16v24L28 51 8 40V16Z M8 16l20 12 20-12 M28 28v23 M18 10l20 12" stroke="currentColor" strokeWidth="2"/>
      <circle cx="28" cy="28" r="4" fill="#8ee9ad"/>
    </svg>
  </div>;
}

export function SourceFlip(){
  const reduced=useSyncExternalStore(subscribeMotion,reducedMotion);
  const [showMap,setShowMap]=useState(false);
  const [hasInteracted,setHasInteracted]=useState(false);
  const image=showMap?'/megafon/decision-map.svg':'/megafon/tv.jpg';
  return <figure className="source-flip">
    <div className="source-flip-media">
      <img src={image} alt={showMap?'Охват ведёт к трём вариантам: запуск, пилот или пауза.':'Кадр из кейса МегаФон ТВ о подборе блогеров.'} width="640" height="360" loading="lazy"/>
      {!reduced&&hasInteracted&&<div className="source-flip-canvas" aria-hidden="true">
        <ImageFlipper key={image} mode="single" singleImage={image} singleFocusY={50} cardWidth={640} cardHeight={360} tiles={14} transition={{duration:.65,ease:'easeOut'}}/>
      </div>}
    </div>
    <figcaption>
      <span>{showMap?'Схема вариантов':'Кадр из кейса Digital Info'}</span>
      <button className="btn" type="button" onClick={()=>{setShowMap(value=>!value);setHasInteracted(true)}}>{showMap?'Показать источник':'Показать схему'}</button>
    </figcaption>
  </figure>;
}

