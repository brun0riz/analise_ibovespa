import test from "node:test";
import assert from "node:assert/strict";
import { metrics, analyzeMandates, normalizeMandate, ownerAt, sample, daysBetween } from "../public/model.js";
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,actual+" != "+expected);
const base={date:"2019-12-31",close:100};
const points=[{date:"2020-01-02",close:110},{date:"2020-01-03",close:88},{date:"2020-01-06",close:121}];

test("retorno composto, maior queda e volatilidade usam a base anterior",()=>{
  const stats=metrics(points,base);
  near(stats.total,21);
  near(stats.drawdown,-20);
  near(stats.annualized,(Math.pow(1.21,365.2425/6)-1)*100);
  near(stats.bestDay.value,37.5);
  near(stats.worstDay.value,-20);
  assert.equal(stats.sessions,3);
  assert.equal(stats.high,121);
  assert.equal(stats.low,88);
  assert.ok(stats.volatility>0);
});
test("sem observações não há indicadores e sem variação não há volatilidade",()=>{
  assert.equal(metrics([],base),null);
  const stats=metrics([{date:"2020-01-02",close:100},{date:"2020-01-03",close:100}],base);
  assert.equal(stats.total,0);assert.equal(stats.drawdown,0);assert.equal(stats.volatility,0);
  assert.equal(metrics([points[0]],base).volatility,null);
});
test("cada pregão pertence a um único mandato e a base da sucessão é compartilhada",()=>{
  const mandates=[{id:"a",start:"2020-01-01",end:"2020-01-06"},{id:"b",start:"2020-01-06",end:"2020-01-08"}];
  const all=[base,...points,{date:"2020-01-07",close:132}];
  const analyzed=analyzeMandates(all,mandates,"2020-01-07");
  assert.equal(ownerAt(mandates,"2020-01-06").id,"b");
  assert.equal(analyzed[0].observations.at(-1).date,"2020-01-03");
  assert.equal(analyzed[1].base.date,"2020-01-03");
  assert.equal(analyzed[1].partial,true);
  near((1+analyzed[0].stats.total/100)*(1+analyzed[1].stats.total/100)-1,.32);
});
test("cobertura incompleta, ausência de base e lacunas não viram ranking enganoso",()=>{
  const mandate={id:"x",start:"2020-01-01",end:"2020-02-01"};
  assert.equal(analyzeMandates(points,[mandate],"2020-02-02")[0].stats,null);
  assert.equal(analyzeMandates([base,...points],[mandate],"2020-02-02")[0].status,"Cobertura incompleta");
  const gap=[base,points[0],{date:"2020-01-30",close:123}];
  assert.equal(analyzeMandates(gap,[mandate],"2020-02-02")[0].stats,null);
});
test("base 100 preserva o primeiro pregão e termina na data real disponível",()=>{
  const m=analyzeMandates([base,...points],[{start:"2020-01-01",end:"2020-01-10"}],"2020-01-07")[0];
  const normalized=normalizeMandate(m);
  assert.deepEqual(normalized[0],{day:0,date:"2020-01-01",value:100});
  near(normalized[1].value,110);
  near(normalized.at(-1).value,121);
  assert.equal(normalized.at(-1).date,"2020-01-06");
  assert.equal(daysBetween("2020-02-28","2020-03-01"),2);
});
test("a redução visual mantém os extremos e as pontas, sem mudar as métricas",()=>{
  const many=Array.from({length:100},(_,i)=>({date:String(i).padStart(3,"0"),close:i===42?999:i===45?1:100+i}));
  const reduced=sample(many,20);
  assert.equal(reduced[0],many[0]);assert.equal(reduced.at(-1),many.at(-1));
  assert.ok(reduced.includes(many[42]));assert.ok(reduced.includes(many[45]));
});
