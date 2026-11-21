import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { route } from '../server/routes.js';
// Invalid input must stop before a model call, including installations with no key.
const server=createServer((req,res)=>route('chat',req,res,true));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 for (const readAll of [true,false]) {
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'Прочитай файл и назови числовые показатели.',readAll,files:[{name:'empty.txt',base64:''}]})});
 const result=await response.json();
 assert.equal(response.status,422);
 assert.match(result.error,/не выполнено/);
 assert.match(result.error,/Анализ по непрочитанным материалам остановлен/);
 assert.equal(result.text,undefined,'Ошибку нельзя выдавать за содержательный ответ модели.');
 }
 console.log('PASS. Unread full-document and all-unread requests stop before model inference.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
