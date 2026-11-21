import fs from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import path from 'node:path';
const root=new URL('../../',import.meta.url);
const text=await fs.readFile(new URL('strategy.md',import.meta.url),'utf8');
const imageMap=new Map();
const imageRoot=new URL('public/submission/screenshots/',root);
await fs.mkdir(imageRoot,{recursive:true});
for(const source of [new URL('strategy.md',import.meta.url),new URL('docs/submission/work-description.md',root)]){
 const markdown=await fs.readFile(source,'utf8');
 for(const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)){
  const original=new URL(match[1],source);
  const allowed=await fs.realpath(new URL('docs/screenshots/',root));
  const resolved=await fs.realpath(original);
  if(!resolved.startsWith(allowed+path.sep)||!/^[-a-z0-9]+\.(jpg|png)$/i.test(path.basename(resolved)))throw Error('Unexpected screenshot path');
  const name=path.basename(resolved);
  await fs.copyFile(original,new URL(name,imageRoot));
  imageMap.set(match[1],'screenshots/'+name);
 }
}
const body=renderToStaticMarkup(React.createElement(Markdown,{remarkPlugins:[remarkGfm],skipHtml:true,components:{img:({src,alt})=>React.createElement('a',{href:imageMap.get(src)||src,target:'_blank',rel:'noopener',title:'Открыть исходный скриншот'},React.createElement('img',{src:imageMap.get(src)||src,alt,loading:'eager'}))}},text));
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Официальный бриф - Контур решения</title><style>body{margin:0;background:#f6f5f7;color:#26212b;font:17px/1.65 Arial,sans-serif}header{background:#fff;border-bottom:1px solid #e3dce8;padding:20px max(24px,calc((100% - 1050px)/2));color:#006f4b}header a{color:inherit}main{max-width:1050px;margin:40px auto;padding:38px;background:white;border-radius:12px}h1{font-size:38px;line-height:1.15}h2{color:#006f4b;margin-top:48px;font-size:28px}h3{color:#71378c;font-size:21px}table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.5}th,td{padding:10px;border:1px solid #e4dfe8;vertical-align:top}th{background:#f4eff7}a{color:#6e328a}code{font-size:14px}p{margin:18px 0}.notice{padding:14px;background:#edf7f2;border-left:3px solid #00885b}nav{display:flex;gap:24px;flex-wrap:wrap}@media(max-width:700px){main{margin:0;padding:22px}table{display:block;overflow:auto}}@media print{header{display:none}main{margin:0;padding:0}h2{break-after:avoid}table{font-size:10px}}</style><header><b>КОНТУР РЕШЕНИЯ</b> · Материалы демонстрации<nav><a href="/">К сервису</a><a href="official-strategy.pdf">Стратегия PDF</a><a href="work-description.pdf">Описание работы PDF</a><a href="official-brief.pdf">Исходный бриф</a></nav></header><main><p class="notice">Читаемая редакция фактического прогона с проверкой расчётов. Сырые ответы и исправления открыты в репозитории. Учебные данные не являются данными МегаФона.</p>${body}</main></html>`;
await fs.mkdir(new URL('public/submission/',root),{recursive:true});
await fs.writeFile(new URL('public/submission/official-strategy.html',root),html.replace('</style>','img{display:block;width:100%;height:auto;border:1px solid #e4dfe8;border-radius:8px;margin-block:16px}a:has(>img){display:block}a:has(>img):focus-visible{outline:3px solid #007b50;outline-offset:4px}</style>').replace('Учебные данные не являются данными МегаФона.</p>','Учебные данные не являются данными МегаФона. В каждой части есть скриншоты фактического прогона; нажмите изображение, чтобы открыть оригинал.</p>'));
await fs.copyFile(new URL('materials/official-brief.pdf',import.meta.url),new URL('public/submission/official-brief.pdf',root));
console.log('Static readable report exported.');
