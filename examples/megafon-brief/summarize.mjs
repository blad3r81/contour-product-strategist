import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('./',import.meta.url);
// Сводка берётся из фактических ответов, а не из заранее заданных метрик.
const records=[];
for(const name of (await fs.readdir(new URL('results/',root))).filter(n=>n.endsWith('.json')).sort()){
 const r=JSON.parse(await fs.readFile(new URL('results/'+name,root),'utf8'));
 records.push({step:name.replace('.json',''),started:r.started,ended:r.ended,seconds:r.seconds,model:r.model,blocked:!!r.blocked || (r.text || r.content) === 'Провайдер ограничил ответ.',usage:r.usage,coverage:r.sources?.filter(s=>s.name).map(s=>({name:s.name,coverage:s.coverage})),resumedFrom:r.trace?.resumedFrom,checkpoint:r.checkpoint});
}
const sum=key=>records.reduce((n,r)=>n+(r.usage?.[key]||0),0);
const summary={date:'2026-11-21',sourceSha256:createHash('sha256').update(await fs.readFile(new URL('materials/official-brief.pdf',root))).digest('hex'),records,calls:records.length,seconds:records.reduce((n,r)=>n+(r.seconds||0),0),usage:{prompt_tokens:sum('prompt_tokens'),completion_tokens:sum('completion_tokens'),total_tokens:sum('total_tokens')},cost:{newPaidPurchasesRub:0,apiRub:'unknown:existing quota; provider did not return price',electricity:'not_measured',humanWork:'not_measured'},note:'Сумма времени запросов не равна длительности всей разработки. Заблокированные попытки сохранены; повтор после паузы не содержит history.'};
await fs.writeFile(new URL('run-summary.json',root),JSON.stringify(summary,null,2));
console.log(JSON.stringify({calls:summary.calls,seconds:summary.seconds,usage:summary.usage,sourceSha256:summary.sourceSha256},null,2));
