import test from "node:test";
import assert from "node:assert/strict";
import { createApp, createHistoryService } from "../server.mjs";
const fixture={version:1,fetchedAt:"2026-10-27T12:00:00Z",source:"Teste",points:[{date:"2026-10-23",close:100},{date:"2026-10-26",close:102}]};
test("consultas simultâneas compartilham download e renovação respeita o cache",async()=>{
  let count=0;
  const service=createHistoryService({cacheFile:null,clock:()=>new Date("2026-10-27T12:00:00Z"),loader:async()=>{count++;await new Promise(resolve=>setTimeout(resolve,10));return fixture;}});
  const [a,b]=await Promise.all([service(),service()]);
  assert.equal(count,1);assert.deepEqual(a.points,b.points);
  await service();await service(true);assert.equal(count,1);
});
test("falha de rede preserva o último histórico e avisa sobre o cache",async()=>{
  let now=new Date("2026-10-27T12:00:00Z"),fail=false;
  const service=createHistoryService({cacheFile:null,clock:()=>now,loader:async()=>{if(fail)throw new Error("offline");return fixture;}});
  await service();now=new Date("2026-10-27T14:00:00Z");fail=true;
  const result=await service();assert.equal(result.stale,true);assert.match(result.warnings[0],/última cópia/);assert.deepEqual(result.points,fixture.points);
});
test("a fonte não pode substituir silenciosamente o cache por uma série mais antiga",async()=>{
  let now=new Date("2026-10-27T12:00:00Z"),first=true;
  const service=createHistoryService({cacheFile:null,clock:()=>now,loader:async()=>{
    if(first){first=false;return fixture;}
    return {...fixture,points:[{date:"2026-10-20",close:99},{date:"2026-10-21",close:100}]};
  }});
  await service();now=new Date("2026-10-27T14:00:00Z");
  const result=await service();assert.equal(result.points.at(-1).date,"2026-10-26");assert.equal(result.stale,true);
});
test("servidor entrega os recursos, a API e erros explícitos sem expor arquivos locais",async t=>{
  const server=createApp({historyService:async()=>fixture});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin="http://127.0.0.1:"+server.address().port;
  for(const route of ["/","/style.css","/app.js","/model.js","/api/mandates","/api/history"]){
    const response=await fetch(origin+route);assert.equal(response.status,200,route);
    if(route==="/"){assert.match(await response.text(),/Histórico do Ibovespa/);assert.match(response.headers.get("content-security-policy"),/script-src 'self'/);}
    else await response.text();
  }
  assert.equal((await fetch(origin+"/data/mandates.json")).status,404);
  assert.equal((await fetch(origin+"/server.mjs")).status,404);
  assert.equal((await fetch(origin+"/api/history",{method:"POST"})).status,405);
});
test("sem cache, uma falha da fonte vira 503 e não números de demonstração",async t=>{
  const server=createApp({historyService:async()=>{throw new Error("offline");}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/history");
  assert.equal(response.status,503);assert.match((await response.json()).error,/Yahoo Finance/);
});
