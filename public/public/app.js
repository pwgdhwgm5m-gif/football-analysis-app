
const $=s=>document.querySelector(s), pct=x=>`${Math.round(x*100)}%`, ev=x=>x==null?"":` · EV ${(x*100).toFixed(1)}%`;
const names={H:"1",D:"X",A:"2",O25:"2.5 Üst",U25:"2.5 Alt",BTTS:"KG Var",NOBTTS:"KG Yok",H15:"Ev 1.5+",A15:"Dep 1.5+",FHBTTS:"İY KG",FH05:"İY 0.5+",FH15:"İY 1.5+",SH05:"2Y 0.5+",SH15:"2Y 1.5+",HALF1:"İlk Yarı",HALF2:"İkinci Yarı",HALFEQ:"Eşit"};
let data=[],filter="ALL";
const today=new Date(); $("#date").value=today.toISOString().slice(0,10);
async function j(u){const r=await fetch(u);const x=await r.json();if(!r.ok)throw Error(x.error||r.status);return x}
function market(k,m){return `<div class="market ${m.confidence>=70?"good":""}"><b>${names[k]}</b><strong>${pct(m.p)}</strong><small>Güven ${m.confidence}/100 · ${m.label}${m.odds?` · ${m.odds.toFixed(2)}`:""}${m.ev!=null?` · EV ${(m.ev*100).toFixed(1)}%`:""}</small></div>`}
function card(x){const m=x.prediction.markets;return `<article class="card"><div class="teams">${x.home} – ${x.away}</div><div class="meta">${x.league.flag} ${x.league.name}${x.time?` · ${x.time}`:""} · örnek ${x.prediction.sample}</div><div class="markets">${["H","D","A","O25","U25","BTTS"].map(k=>market(k,m[k])).join("")}</div><details class="details"><summary>Detay</summary><div class="extra">${["NOBTTS","H15","A15","FHBTTS","FH05","FH15","SH05","SH15","HALF1","HALF2","HALFEQ"].map(k=>market(k,m[k])).join("")}</div></details></article>`}
function bestMarkets(){
 const a=[];for(const x of data)for(const [k,m] of Object.entries(x.prediction.markets))if(!["HALF1","HALF2","HALFEQ"].includes(k))a.push({x,k,m});
 return a;
}
function pickCard(z){return `<article class="card pick"><div><div class="teams">${z.x.home} – ${z.x.away}</div><div class="meta">${z.x.league.flag} ${z.x.league.name} · ${names[z.k]}</div></div><div class="right"><b>${pct(z.m.p)}</b><div class="meta">Güven ${z.m.confidence}/100${z.m.odds?` · Oran ${z.m.odds.toFixed(2)}`:""}${z.m.ev!=null?` · EV ${(z.m.ev*100).toFixed(1)}%`:""}</div></div></article>`}
function render(){
 const shown=filter==="ALL"?data:data.filter(x=>x.code===filter);
 $("#matches").innerHTML=shown.length?shown.map(card).join(""):`<div class="empty">Bu tarihte seçili lig için maç bulunamadı.</div>`;
 const all=bestMarkets();
 const evs=all.filter(z=>z.m.ev!=null&&z.m.ev>0).sort((a,b)=>b.m.ev-a.m.ev).slice(0,10);
 $("#ev").innerHTML=evs.length?evs.map(pickCard).join(""):`<div class="empty">Gerçek oranla pozitif EV eşleşmesi yok.</div>`;
 const trust=all.filter(z=>z.m.p>.5).sort((a,b)=>b.m.confidence-a.m.confidence||b.m.p-a.m.p).slice(0,10);
 $("#trusted").innerHTML=trust.length?trust.map(pickCard).join(""):`<div class="empty">Güvenilir seçim bulunamadı.</div>`;
}
async function load(){
 $("#status").textContent="Veri yükleniyor…";
 try{const x=await j(`/api/day?date=${$("#date").value}`);data=x.matches;$("#status").textContent=`${x.count} gerçek fikstür · ${x.source}`;render()}
 catch(e){$("#status").textContent="Veri alınamadı: "+e.message}
}
async function init(){
 const ls=await j("/api/leagues");$("#leagues").innerHTML=`<button class="active" data-c="ALL">Tümü</button>`+ls.map(l=>`<button data-c="${l.code}">${l.flag} ${l.name}</button>`).join("");
 $("#leagues").onclick=e=>{if(e.target.tagName!=="BUTTON")return;filter=e.target.dataset.c;document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b===e.target));render()};
 $("#date").onchange=load;$("#refresh").onclick=load;load();
}
init();
