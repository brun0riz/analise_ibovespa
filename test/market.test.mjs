import test from "node:test";
import assert from "node:assert/strict";
import { normalizeYahoo, fetchHistory, saoPauloDate, validCache } from "../lib/market.mjs";
const timestamp=date=>Date.parse(date+"T18:00:00Z")/1000;
const payload=(dates,closes,granularity="1d")=>({chart:{result:[{meta:{dataGranularity:granularity},timestamp:dates.map(timestamp),indicators:{quote:[{close:closes,open:closes,volume:closes.map(()=>null)}]}}],error:null}});
test("o dia corrente e valores nulos/zero não entram como fechamentos",()=>{
  const data=payload(["2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-26","2026-10-27"],[100,null,0,105,106,107]);
  const points=normalizeYahoo(data,"2026-10-27");
  assert.deepEqual(points.map(p=>p.date),["2026-10-20","2026-10-23","2026-10-26"]);
  assert.equal(points[0].volume,null);
});
test("frequência mensal e erros da API são rejeitados",()=>{
  assert.throws(()=>normalizeYahoo(payload(["2026-10-20","2026-10-21"],[100,101],"1mo"),"2026-10-27"),/diária/);
  assert.throws(()=>normalizeYahoo({chart:{error:{description:"Limite excedido"}}}),/Limite/);
  assert.throws(()=>normalizeYahoo({}),/sem série/);
});
test("datas de pregão seguem São Paulo mesmo quando UTC já mudou de dia",()=>{
  assert.equal(saoPauloDate(new Date("2026-10-27T01:00:00Z")),"2026-10-26");
});
test("consulta usa intervalo explícito diário e tenta o host alternativo",async()=>{
  const urls=[];
  const fetcher=async url=>{
    urls.push(url);
    if(urls.length===1)return {ok:false,status:429};
    return {ok:true,json:async()=>payload(["2026-10-23","2026-10-26"],[100,101])};
  };
  const result=await fetchHistory({fetcher,now:new Date("2026-10-27T12:00:00Z")});
  assert.equal(urls.length,2);assert.match(urls[0],/period1=/);assert.match(urls[0],/interval=1d/);
  assert.match(urls[1],/query2/);assert.equal(result.points.length,2);assert.equal(validCache(result),true);
});
test("cache rejeita registros fora de ordem, duplicados e valores inválidos",()=>{
  const data={version:1,fetchedAt:"2026-10-27T12:00:00Z",points:[{date:"2026-10-23",close:100},{date:"2026-10-26",close:102}]};
  assert.equal(validCache(data),true);
  assert.equal(validCache({...data,points:[...data.points].reverse()}),false);
  assert.equal(validCache({...data,points:[data.points[0],data.points[0]]}),false);
  assert.equal(validCache({...data,points:[data.points[0],{date:"2026-10-26",close:0}]}),false);
});
