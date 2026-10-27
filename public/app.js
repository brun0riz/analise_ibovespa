import { analyzeMandates, metrics, normalizeMandate, ownerAt, previousDate, sample, stamp, daysBetween } from "./model.js";

const $ = selector => document.querySelector(selector);
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = value => value == null || !Number.isFinite(value) ? "—" : (value > 0 ? "+" : "") + decimal.format(value) + "%";
const dateLabel = date => date ? date.split("-").reverse().join("/") : "—";
const shortDate = date => date ? date.slice(0, 7).split("-").reverse().join("/") : "—";
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const tone = value => value == null ? "" : value < 0 ? "negative" : "positive";
const periodLabel = m => dateLabel(m.start) + " — " + dateLabel(previousDate(m.end));
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
};
const state = { data:null, mandates:[], analyses:[], view:[], mode:"points", selected:new Set(["temer","bolsonaro","lula-3"]), sort:null, descending:true, historyIndex:0, compareDay:0, busy:false };
let historyGeometry=null;
let compareGeometry=null;
let detailKey="";
let lastNotice="";

function emptyChart(element, message) {
  element.innerHTML = '<div class="chart-empty">' + escape(message) + "</div>";
}
function svgText(x,y,text,anchor="start",extra="") {
  return '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" fill="#8b998c" font-size="10" '+extra+'>'+escape(text)+'</text>';
}
function linePath(values, x, y) {
  return values.map((p,i)=>(i?"L":"M")+x(p).toFixed(2)+","+y(p).toFixed(2)).join(" ");
}
function nearestIndex(points,target,getValue) {
  let low=0,high=points.length-1;
  while(low<high){const mid=Math.floor((low+high)/2);if(getValue(points[mid])<target)low=mid+1;else high=mid;}
  return low>0&&Math.abs(getValue(points[low-1])-target)<Math.abs(getValue(points[low])-target)?low-1:low;
}
function dimensions(element, height) {
  return { width:Math.max(290,Math.round(element.getBoundingClientRect().width)), height, left:55, right:18, top:32, bottom:32 };
}
function renderSummary() {
  const points=state.data.points;
  const last=points.at(-1), prior=points.at(-2);
  $("#last-close").innerHTML=number.format(last.close)+'<small>pts</small>';
  $("#last-close-meta").innerHTML='<span class="'+tone((last.close/prior.close-1)*100)+'">'+percent((last.close/prior.close-1)*100)+'</span> no dia · '+dateLabel(last.date);
  const first=state.view[0],base=first&&points.findLast(p=>p.date<first.date);
  const usable=base&&daysBetween(base.date,first.date)<=10;
  const stats=usable?metrics(state.view,base):null;
  $("#range-return").textContent=percent(stats?.total);
  $("#range-return").className="stat-value "+tone(stats?.total);
  $("#range-return-meta").textContent=first?shortDate(first.date)+" — "+shortDate(state.view.at(-1).date)+" · nominal em R$":"Sem pregões neste recorte";
  $("#range-drawdown").textContent=percent(stats?.drawdown);
  $("#range-drawdown").className="stat-value "+(stats?"negative":"");
  const available=state.analyses.filter(m=>m.stats);
  $("#mandate-count").innerHTML=available.length+'<small>períodos</small>';
  $("#coverage").textContent=available.filter(m=>!m.partial).length+" concluídos · "+available.filter(m=>m.partial).length+" parcial";
}

function renderHistory() {
  const element=$("#history-chart");
  historyGeometry=null;
  if(!state.view.length){emptyChart(element,"Não há pregões no período selecionado.");$("#detail").innerHTML='<p class="detail-placeholder">Amplie o período para explorar os dados.</p>';renderSummary();return;}
  const {width:w,height:h,left:l,right:r,top:t,bottom:b}=dimensions(element,window.innerWidth<760?270:330);
  const first=state.view[0],last=state.view.at(-1);
  const rangeBase=state.data.points.findLast(p=>p.date<first.date);
  if(state.mode==="return"&&(!rangeBase||daysBetween(rangeBase.date,first.date)>10)){
    emptyChart(element,"A fonte não contém um fechamento anterior próximo para calcular o retorno deste recorte.");
    $("#detail").innerHTML='<p class="detail-placeholder">Base anterior indisponível. Selecione a visão em pontos ou outro período.</p>';
    renderSummary();return;
  }
  const base=rangeBase||first;
  const log=state.mode==="points"&&$("#log-scale").checked;
  const value=p=>state.mode==="return"?(p.close/base.close-1)*100:p.close;
  const start=stamp(first.date),end=Math.max(start+86400000,stamp(last.date));
  const x=p=>l+(stamp(p.date)-start)/(end-start)*(w-l-r);
  const values=state.view.map(value);
  let lo=Math.min(...values),hi=Math.max(...values);
  const spread=hi-lo||Math.max(Math.abs(hi)*.1,1);
  if(log){lo=Math.max(.001,lo*.83);hi*=1.15;}
  else{lo=state.mode==="points"?Math.max(0,lo-spread*.1):Math.min(0,lo-spread*.1);hi+=spread*.12;}
  const yValue=v=>h-b-(log?(Math.log(v)-Math.log(lo))/(Math.log(hi)-Math.log(lo)):(v-lo)/(hi-lo))*(h-t-b);
  const y=p=>yValue(value(p));
  let svg='<svg viewBox="0 0 '+w+" "+h+'" aria-hidden="true"><defs><clipPath id="history-clip"><rect x="'+l+'" y="'+t+'" width="'+(w-l-r)+'" height="'+(h-t-b)+'"/></clipPath></defs>';
  for(const m of state.analyses){
    const sx=Math.max(l,x({date:m.start})),ex=Math.min(w-r,x({date:m.end}));
    if(ex<=sx)continue;
    svg+='<rect x="'+sx+'" y="'+t+'" width="'+(ex-sx)+'" height="'+(h-t-b)+'" fill="'+m.color+'" opacity=".055"/>';
    svg+='<line x1="'+sx+'" x2="'+sx+'" y1="'+t+'" y2="'+(h-b)+'" stroke="'+m.color+'" opacity=".15"/>';
    if(ex-sx>29)svg+=svgText((sx+ex)/2,18,m.short,"middle",'style="font-size:9px"');
  }
  for(let i=0;i<=4;i++){
    const fraction=i/4;
    const v=log?Math.exp(Math.log(lo)+fraction*(Math.log(hi)-Math.log(lo))):lo+fraction*(hi-lo);
    const yy=yValue(v);
    svg+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+yy+'" y2="'+yy+'" stroke="#dfe7db" stroke-dasharray="3 5"/>';
    svg+=svgText(l-10,yy+3,state.mode==="return"?Math.round(v)+"%":v>=1000?number.format(v/1000)+"k":number.format(v),"end");
  }
  const ticks=Math.max(2,Math.floor((w-l-r)/95));
  for(let i=0;i<=ticks;i++){
    const time=start+(end-start)*i/ticks;
    const label=new Date(time).toISOString().slice(0,10);
    svg+=svgText(l+(w-l-r)*i/ticks,h-8,end-start>86400000*730?label.slice(0,4):shortDate(label),i===0?"start":i===ticks?"end":"middle");
  }
  svg+='<g clip-path="url(#history-clip)">';
  for(const m of state.analyses){
    let segment=state.view.filter(p=>p.date>=m.start&&p.date<m.end);
    if(!segment.length)continue;
    const prior=state.view.findLast(p=>p.date<segment[0].date);
    if(prior)segment=[prior,...segment];
    svg+='<path d="'+linePath(sample(segment,1100),x,y)+'" fill="none" stroke="'+m.color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  svg+='</g><g id="history-cursor" pointer-events="none"><line id="history-hair" y1="'+t+'" y2="'+(h-b)+'" stroke="#7b8d79" stroke-dasharray="3 3"/><circle id="history-dot" r="4" fill="#fff" stroke="#355a43" stroke-width="2"/></g></svg>';
  element.innerHTML=svg;
  historyGeometry={w,l,r,x,y,start,end};
  state.historyIndex=Math.min(state.historyIndex,state.view.length-1);
  showHistoryPoint(state.historyIndex);
  $("#chart-range").textContent=dateLabel(first.date)+" — "+dateLabel(last.date);
  $("#chart-unit").textContent=state.mode==="points"?"IBOVESPA · PONTOS"+(log?" · LOG":""):"VARIAÇÃO DESDE A BASE ANTERIOR · %";
  $("#log-scale").disabled=state.mode==="return";
  $("#history-legend").innerHTML=state.analyses.map(m=>'<button type="button" data-select-mandate="'+m.id+'" class="'+($("#mandate-filter").value===m.id?"selected":"")+'" style="--mandate-color:'+m.color+'"><span class="legend-dot"></span>'+escape(m.short)+'</button>').join("");
  renderSummary();
}

function dailyReturn(point) {
  const index=state.data.points.findIndex(p=>p.date===point.date);
  const previous=state.data.points[index-1];
  return previous?(point.close/previous.close-1)*100:null;
}
function pointDetails(point) {
  const m=state.analyses.find(a=>point.date>=a.start&&point.date<a.end);
  const total=m?.stats?(point.close/m.base.close-1)*100:null;
  return {m,total,daily:dailyReturn(point)};
}
function tooltipHtml(point) {
  const {m,total,daily}=pointDetails(point);
  if(!m)return "";
  let rows='<dt>Fechamento</dt><dd>'+decimal.format(point.close)+' pts</dd><dt>Variação diária</dt><dd class="'+tone(daily)+'">'+percent(daily)+'</dd>';
  for(const [key,label] of [["open","Abertura"],["high","Máxima do dia"],["low","Mínima do dia"]]){
    if(Number.isFinite(point[key]))rows+='<dt>'+label+'</dt><dd>'+decimal.format(point[key])+'</dd>';
  }
  if(Number.isFinite(point.volume))rows+='<dt>Volume informado¹</dt><dd>'+number.format(point.volume)+'</dd>';
  return '<div class="tooltip-title"><span>'+dateLabel(point.date)+'</span><span>'+escape(m.short)+'</span></div><strong class="tooltip-name">'+escape(m.name)+'</strong><p>'+escape(m.party)+'</p><p>'+escape(m.election)+'</p><dl>'+rows+'</dl><div class="tooltip-total"><span>No mandato até este dia</span><strong class="'+tone(total)+'">'+percent(total)+'</strong></div>';
}
function renderDetail(point) {
  const key=point.date;
  if(detailKey===key)return;
  detailKey=key;
  const {m,total,daily}=pointDetails(point);
  if(!m)return;
  const card=$("#detail");
  card.style.setProperty("--mandate-color",m.color);
  const badge=m.status+(m.outdated?" · dados atrasados":"");
  card.innerHTML='<div class="detail-label">'+escape(m.short.toUpperCase())+' · '+escape(badge.toUpperCase())+'</div>'+
    '<div class="president-head"><span class="avatar">'+escape(m.initials)+'</span><div><strong>'+escape(m.name)+'</strong><small>'+escape(m.party)+'</small></div></div>'+
    '<p class="detail-period">'+escape(periodLabel(m))+'</p><div class="detail-label">NO MANDATO ATÉ '+dateLabel(point.date)+'</div>'+
    '<div class="detail-return '+tone(total)+'">'+percent(total)+'</div><p class="detail-caption">Retorno nominal desde a base anterior à posse</p>'+
    '<div class="detail-grid"><div><small>FECHAMENTO DO DIA</small><strong>'+number.format(point.close)+' pts</strong></div><div><small>VARIAÇÃO DO DIA</small><strong class="'+tone(daily)+'">'+percent(daily)+'</strong></div><div><small>MAIOR QUEDA²</small><strong>'+percent(m.stats?.drawdown)+'</strong></div><div><small>RETORNO ANUALIZADO²</small><strong>'+percent(m.stats?.annualized)+'</strong></div></div>'+
    '<p class="detail-observation">'+escape(m.partyDetail)+' '+escape(m.note)+'</p><p class="detail-observation">² Considera todo o período disponível do mandato. '+(m.base?'Base: '+dateLabel(m.base.date)+', '+decimal.format(m.base.close)+' pts.':"Base indisponível.")+'</p>';
}
function showHistoryPoint(index,event) {
  if(!historyGeometry||!state.view[index])return;
  state.historyIndex=index;
  const point=state.view[index];
  const {x,y}=historyGeometry;
  const hair=$("#history-hair"),dot=$("#history-dot");
  hair.setAttribute("x1",x(point));hair.setAttribute("x2",x(point));
  dot.setAttribute("cx",x(point));dot.setAttribute("cy",y(point));
  renderDetail(point);
  if(event){
    const tooltip=$("#tooltip");
    tooltip.innerHTML=tooltipHtml(point);
    tooltip.hidden=false;
    const box=tooltip.getBoundingClientRect();
    let left=event.clientX+16,top=event.clientY-box.height/2;
    if(left+box.width>window.innerWidth-10)left=event.clientX-box.width-16;
    tooltip.style.left=Math.max(8,left)+"px";
    tooltip.style.top=Math.max(8,Math.min(window.innerHeight-box.height-8,top))+"px";
  }
}
function historyPointer(event) {
  if(!historyGeometry)return;
  const box=$("#history-chart").getBoundingClientRect(),g=historyGeometry;
  const mouseX=(event.clientX-box.left)*g.w/box.width;
  const target=g.start+(mouseX-g.l)/(g.w-g.l-g.r)*(g.end-g.start);
  const index=nearestIndex(state.view,target,p=>stamp(p.date));
  showHistoryPoint(index,event);
}
function renderComparison() {
  const element=$("#compare-chart");
  compareGeometry=null;
  const selected=state.analyses.filter(m=>m.stats&&state.selected.has(m.id));
  $("#compare-legend").innerHTML=state.analyses.map(m=>'<button type="button" data-toggle-mandate="'+m.id+'" aria-pressed="'+state.selected.has(m.id)+'" '+(!m.stats?'disabled ':"")+'style="--mandate-color:'+m.color+'"><span class="legend-dot"></span>'+escape(m.short)+(m.partial?" *":"")+'</button>').join("");
  if(!selected.length){emptyChart(element,"Selecione ao menos um mandato na legenda.");$("#compare-readout").textContent="Clique nos nomes para mostrar ou ocultar as curvas.";return;}
  const {width:w,height:h,left:l,right:r,top:t,bottom:b}=dimensions(element,280);
  const curves=selected.map(m=>({m,points:normalizeMandate(m)}));
  const maxDay=Math.max(...curves.map(c=>c.points.at(-1).day));
  let min=100,max=100;
  for(const curve of curves)for(const p of curve.points){min=Math.min(min,p.value);max=Math.max(max,p.value);}
  const span=max-min||10;
  min=Math.max(0,min-span*.13);max+=span*.12;
  const x=p=>l+p.day/maxDay*(w-l-r);
  const y=p=>h-b-(p.value-min)/(max-min)*(h-t-b);
  let svg='<svg viewBox="0 0 '+w+" "+h+'" aria-hidden="true">';
  for(let i=0;i<=4;i++){
    const value=min+i/4*(max-min),yy=y({value});
    svg+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+yy+'" y2="'+yy+'" stroke="#e5eade" stroke-dasharray="3 4"/>'+svgText(l-8,yy+3,number.format(value),"end");
  }
  const baseY=y({value:100});
  svg+='<line x1="'+l+'" x2="'+(w-r)+'" y1="'+baseY+'" y2="'+baseY+'" stroke="#9cab8e" stroke-dasharray="5 3"/>';
  for(let month=0;month<=Math.ceil(maxDay/30.4375);month+=12){
    const xx=x({day:month*30.4375});
    if(xx<=w-r+1)svg+=svgText(xx,h-8,month+"m",month===0?"start":"middle");
  }
  for(const curve of curves)svg+='<path d="'+linePath(curve.points,x,y)+'" fill="none" stroke="'+curve.m.color+'" stroke-width="2" stroke-linejoin="round"/>';
  svg+='<line id="compare-hair" x1="'+l+'" x2="'+l+'" y1="'+t+'" y2="'+(h-b)+'" stroke="#8d9c82" stroke-dasharray="3 4"/></svg>';
  element.innerHTML=svg;
  compareGeometry={w,l,r,maxDay,x,curves};
  $("#compare-readout").textContent="100 = fechamento anterior à posse. As curvas terminam no último dado de cada mandato.";
}
function comparisonPoint(day) {
  if(!compareGeometry)return;
  const g=compareGeometry;
  state.compareDay=Math.max(0,Math.min(g.maxDay,day));
  const xx=g.x({day:state.compareDay}),hair=$("#compare-hair");
  hair.setAttribute("x1",xx);hair.setAttribute("x2",xx);
  const labels=g.curves.map(({m,points})=>{
    if(state.compareDay>points.at(-1).day)return '<span>'+escape(m.short)+': período encerrado</span>';
    const point=points.findLast(p=>p.day<=state.compareDay)||points[0];
    return '<span style="color:'+m.color+'">'+escape(m.short)+': '+decimal.format(point.value)+' ('+percent(point.value-100)+')</span>';
  });
  $("#compare-readout").innerHTML='<strong>Mês '+Math.floor(state.compareDay/30.4375)+'</strong> · '+labels.join("");
}
function renderRanking() {
  const metric=$("#rank-metric").value;
  const all=state.analyses.filter(m=>m.stats&&Number.isFinite(m.stats[metric])).sort((a,b)=>b.stats[metric]-a.stats[metric]);
  const max=Math.max(1,...all.map(m=>Math.abs(m.stats[metric])));
  $("#ranking").innerHTML=all.map(m=>'<button class="rank-row" type="button" data-select-mandate="'+m.id+'" style="--mandate-color:'+m.color+'" title="'+escape(m.name)+' · '+escape(m.status)+'"><span class="rank-name">'+escape(m.short)+(m.partial?" *":"")+'</span><span class="rank-track"><span class="rank-bar" style="width:'+Math.max(1,Math.abs(m.stats[metric])/max*100)+'%"></span></span><span class="rank-number '+tone(m.stats[metric])+'">'+percent(m.stats[metric])+'</span></button>').join("");
}
function renderTable() {
  const rows=[...state.analyses];
  if(state.sort)rows.sort((a,b)=>{
    const av=a.stats?.[state.sort],bv=b.stats?.[state.sort];
    if(av==null)return bv==null?0:1;if(bv==null)return -1;
    return (state.descending?-1:1)*(av-bv);
  });
  $("#mandates-table").innerHTML=rows.map(m=>{
    const stats=m.stats;
    const observed=m.observations.length?shortDate(m.observations[0].date)+" — "+shortDate(m.observations.at(-1).date):"Sem observações";
    return '<tr><td><div class="table-person"><span class="legend-dot" style="--mandate-color:'+m.color+'"></span><button type="button" data-select-mandate="'+m.id+'"><strong>'+escape(m.short)+'</strong><small>'+escape(m.name)+'</small></button></div></td><td>'+escape(m.party)+'</td><td>'+observed+'</td><td class="'+tone(stats?.total)+'">'+percent(stats?.total)+'</td><td class="'+tone(stats?.annualized)+'">'+percent(stats?.annualized)+'</td><td class="'+(stats?"negative":"")+'">'+percent(stats?.drawdown)+'</td><td>'+percent(stats?.volatility).replace(/^\+/,"")+'</td><td><span class="status-badge '+(m.partial?"partial":"")+'">'+escape(m.status)+'</span></td></tr>';
  }).join("");
  document.querySelectorAll("[data-sort]").forEach(button=>button.closest("th").setAttribute("aria-sort",button.dataset.sort===state.sort?(state.descending?"descending":"ascending"):"none"));
}
function applyFilters() {
  const start=$("#start-date").value,end=$("#end-date").value;
  const error=$("#filter-error");
  if(!start||!end||start>end||start<"1995-01-01"||end>state.data.points.at(-1).date){
    error.textContent="Informe um período válido desde 01/01/1995 até o último fechamento disponível, com o início anterior ou igual ao fim.";
    error.hidden=false;return;
  }
  error.hidden=true;
  state.view=state.data.points.filter(p=>p.date>=start&&p.date<=end);
  state.historyIndex=state.view.length-1;
  detailKey="";
  $("#tooltip").hidden=true;
  renderHistory();
}
function selectMandate(id) {
  if(!state.data)return;
  const m=state.analyses.find(m=>m.id===id);
  if(!m||!m.observations.length)return;
  $("#mandate-filter").value=id;
  $("#start-date").value=m.start;
  $("#end-date").value=m.observations.at(-1).date;
  applyFilters();
}
function resetFilters() {
  $("#mandate-filter").value="all";
  $("#start-date").value="1995-01-01";
  $("#end-date").value=state.data.points.at(-1).date;
  applyFilters();
}
function csvCell(value) {
  return '"'+String(value??"").replace(/"/g,'""')+'"';
}
function exportCsv() {
  const header=["mandato","presidente","partido","inicio_exercicio","fim_exclusivo","status","data_base","pontos_base","primeiro_pregao","ultimo_pregao","ultimo_fechamento","retorno_acumulado_pct","retorno_anualizado_pct","maior_queda_pct","volatilidade_anualizada_pct","pregoes","fonte","consulta_em"];
  const rows=state.analyses.map(m=>[m.short,m.name,m.party,m.start,m.end,m.status,m.base?.date,m.base?.close,m.observations[0]?.date,m.observations.at(-1)?.date,m.stats?.last.close,m.stats?.total,m.stats?.annualized,m.stats?.drawdown,m.stats?.volatility,m.observations.length,state.data.source,state.data.fetchedAt]);
  const content="\ufeff"+[header,...rows].map(row=>row.map(value=>csvCell(typeof value==="number"?String(value).replace(".",","):value)).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="ibovespa-por-mandato-"+state.data.points.at(-1).date+".csv";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindEvents() {
  $("#filters").addEventListener("submit",event=>{event.preventDefault();applyFilters();});
  $("#mandate-filter").addEventListener("change",()=>$("#mandate-filter").value==="all"?resetFilters():selectMandate($("#mandate-filter").value));
  for(const id of ["start-date","end-date"])$("#"+id).addEventListener("input",()=>$("#mandate-filter").value="all");
  $("#reset").addEventListener("click",()=>state.data&&resetFilters());
  $("#log-scale").addEventListener("change",()=>state.data&&renderHistory());
  document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>{
    state.mode=button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(b=>{b.classList.toggle("selected",b===button);b.setAttribute("aria-pressed",String(b===button));});
    if(state.data)renderHistory();
  }));
  document.addEventListener("click",event=>{
    const target=event.target.closest("[data-select-mandate],[data-toggle-mandate],[data-sort]");
    if(!target||!state.data)return;
    if(target.dataset.selectMandate){selectMandate(target.dataset.selectMandate);$("#historico").scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
    if(target.dataset.toggleMandate){const id=target.dataset.toggleMandate;if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);renderComparison();}
    if(target.dataset.sort){const key=target.dataset.sort;state.descending=state.sort===key?!state.descending:true;state.sort=key;renderTable();}
  });
  $("#rank-metric").addEventListener("change",()=>state.data&&renderRanking());
  $("#export").addEventListener("click",()=>state.data&&exportCsv());
  $("#refresh").addEventListener("click",()=>load(true));
  $("#retry").addEventListener("click",()=>load(true));
  const history=$("#history-chart");
  history.addEventListener("pointermove",historyPointer);
  history.addEventListener("pointerdown",historyPointer);
  history.addEventListener("pointerleave",()=>$("#tooltip").hidden=true);
  history.addEventListener("blur",()=>$("#tooltip").hidden=true);
  history.addEventListener("keydown",event=>{
    if(!state.view.length)return;
    if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
      event.preventDefault();
      const step=event.shiftKey?20:1;
      const next=event.key==="Home"?0:event.key==="End"?state.view.length-1:state.historyIndex+(event.key==="ArrowLeft"?-step:step);
      showHistoryPoint(Math.max(0,Math.min(state.view.length-1,next)));
    }
    if(event.key==="Escape")$("#tooltip").hidden=true;
  });
  const compare=$("#compare-chart");
  compare.addEventListener("pointermove",event=>{
    if(!compareGeometry)return;
    const g=compareGeometry,rect=compare.getBoundingClientRect();
    comparisonPoint(((event.clientX-rect.left)*g.w/rect.width-g.l)/(g.w-g.l-g.r)*g.maxDay);
  });
  compare.addEventListener("pointerdown",()=>$("#tooltip").hidden=true);
  compare.addEventListener("keydown",event=>{
    if(!compareGeometry)return;
    if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){
      event.preventDefault();comparisonPoint(event.key==="Home"?0:event.key==="End"?compareGeometry.maxDay:state.compareDay+(event.key==="ArrowLeft"?-30:30));
    }
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape")$("#tooltip").hidden=true;});
  window.addEventListener("scroll",()=>$("#tooltip").hidden=true,{passive:true});
  let resizeTimer;
  window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.data){renderHistory();renderComparison();}},120);});
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible)document.querySelectorAll(".nav-link").forEach(a=>a.classList.toggle("active",a.hash==="#"+visible.target.id));
  },{rootMargin:"-10% 0px -40% 0px",threshold:[0,.1,.3]});
  for(const id of ["historico","comparar","metodologia"])observer.observe($("#"+id));
}
async function load(force=false) {
  if(state.busy)return;
  state.busy=true;
  $("#refresh").disabled=true;$("#retry").disabled=true;
  $("#loading").hidden=false;$("#error").hidden=true;
  try {
    const responses=await Promise.all([fetch("/api/history"+(force?"?refresh=1":""),{signal:AbortSignal.timeout(50000)}),fetch("/api/mandates")]);
    const [data,mandates]=await Promise.all(responses.map(async response=>{
      const body=await response.json();if(!response.ok)throw new Error(body.error||"Falha na consulta.");return body;
    }));
    const firstLoad=!state.data;
    state.data=data;state.mandates=mandates;state.analyses=analyzeMandates(data.points,mandates,today());
    $("#dashboard").setAttribute("aria-busy","false");
    $("#mandate-filter").innerHTML='<option value="all">Todos os mandatos</option>'+state.analyses.map(m=>'<option value="'+m.id+'" '+(!m.observations.length?"disabled":"")+'>'+escape(m.short)+" · "+m.start.slice(0,4)+(m.partial?" (parcial)":"")+'</option>').join("");
    $("#start-date").max=data.points.at(-1).date;$("#end-date").max=data.points.at(-1).date;
    if(firstLoad)resetFilters();else{if($("#end-date").value>data.points.at(-1).date)$("#end-date").value=data.points.at(-1).date;applyFilters();}
    $("#freshness").textContent="Dados até "+dateLabel(data.points.at(-1).date);
    const warnings=[...(data.warnings||[])];
    const incomplete=state.analyses.filter(m=>m.observations.length&&!m.complete);
    if(incomplete.length)warnings.push("Cobertura incompleta: "+incomplete.map(m=>m.short).join(", ")+". Os indicadores desses períodos foram omitidos.");
    lastNotice=warnings.join(" ");
    $("#notice").textContent=lastNotice;$("#notice").hidden=!lastNotice;
    $("#footer-source").textContent=data.source+" · consulta em "+new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(new Date(data.fetchedAt))+" (Brasília)";
    renderComparison();renderRanking();renderTable();
  }catch(error){
    if(state.data){
      $("#notice").textContent=(lastNotice?lastNotice+" ":"")+"A nova consulta falhou; os dados anteriores continuam visíveis. "+error.message;$("#notice").hidden=false;
    }else{
      $("#error").hidden=false;$("#error-message").textContent=error.message;
      $("#freshness").textContent="Fonte indisponível";
      $("#dashboard").setAttribute("aria-busy","false");
      for(const id of ["history-chart","compare-chart"])emptyChart($("#"+id),"Aguardando dados reais da API. Use “Tentar novamente”.");
    }
  }finally{state.busy=false;$("#loading").hidden=true;$("#refresh").disabled=false;$("#retry").disabled=false;}
}
bindEvents();
load();
