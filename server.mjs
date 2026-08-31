
import express from "express";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;
const TTL = 10 * 60 * 1000;
const cache = new Map();

const LEAGUES = {
  E0:{name:"Premier League",flag:"🇬🇧",hist:"E0"},
  D1:{name:"Bundesliga",flag:"🇩🇪",hist:"D1"},
  F1:{name:"Ligue 1",flag:"🇫🇷",hist:"F1"},
  I1:{name:"Serie A",flag:"🇮🇹",hist:"I1"},
  SP1:{name:"La Liga",flag:"🇪🇸",hist:"SP1"},
  N1:{name:"Eredivisie",flag:"🇳🇱",hist:"N1"},
  P1:{name:"Primeira Liga",flag:"🇵🇹",hist:"P1"},
  T1:{name:"Süper Lig",flag:"🇹🇷",hist:"T1"},
  BRA:{name:"Brasileirão",flag:"🇧🇷",hist:null}
};

const HIST_BASE="https://www.football-data.co.uk/mmz4281/2627/";
const FIXTURES="https://www.football-data.co.uk/matches/resources/fixtures.csv";
const TFF="https://www.tff.org/default.aspx?pageID=198";

async function cached(key, fn, ttl=TTL){
  const old=cache.get(key);
  if(old && Date.now()-old.t<ttl) return old.v;
  const v=await fn(); cache.set(key,{t:Date.now(),v}); return v;
}
async function getText(url){
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 FootballAnalysis/1.0","Accept":"text/html,text/csv,*/*"}});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.text();
}
function csv(text){
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const parseLine=s=>{let a=[],v="",q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c=='"'){if(q&&s[i+1]=='"'){v+='"';i++;}else q=!q;}else if(c==","&&!q){a.push(v);v="";}else v+=c;}a.push(v);return a;};
  const h=parseLine(lines[0]);
  return lines.slice(1).map(l=>{const z=parseLine(l),o={};h.forEach((k,i)=>o[k.trim()]=z[i]?.trim()??"");return o;});
}
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function poisson(k,l){let f=1;for(let i=2;i<=k;i++)f*=i;return Math.exp(-l)*Math.pow(l,k)/f}
function probs(lh,la){
  let h=0,d=0,a=0,over=0,btts=0;
  for(let i=0;i<=9;i++)for(let j=0;j<=9;j++){const p=poisson(i,lh)*poisson(j,la);if(i>j)h+=p;else if(i===j)d+=p;else a+=p;if(i+j>=3)over+=p;if(i>0&&j>0)btts+=p;}
  const home15=1-Math.exp(-lh)*(1+lh), away15=1-Math.exp(-la)*(1+la);
  const firstShare=.44, fhH=lh*firstShare, fhA=la*firstShare, shH=lh-fhH, shA=la-fhA;
  const fh05=1-Math.exp(-(fhH+fhA)), fh15=1-Math.exp(-(fhH+fhA))*(1+fhH+fhA);
  const sh05=1-Math.exp(-(shH+shA)), sh15=1-Math.exp(-(shH+shA))*(1+shH+shA);
  const fhBtts=(1-Math.exp(-fhH))*(1-Math.exp(-fhA));
  let first=.28, second=.54, equal=.18; // league prior; confidence is discounted for half markets
  return {H:h,D:d,A:a,O25:over,U25:1-over,BTTS:btts,NOBTTS:1-btts,H15:home15,A15:away15,FHBTTS:fhBtts,FH05:fh05,FH15:fh15,SH05:sh05,SH15:sh15,HALF1:first,HALF2:second,HALFEQ:equal};
}
function normalize(s){return (s||"").toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu,"").replace(/aş$/,"")}
function stats(rows){
  const m=new Map();
  const team=n=>{if(!m.has(n))m.set(n,{team:n,p:0,gf:0,ga:0,hp:0,hgf:0,hga:0,ap:0,agf:0,aga:0,fhgf:0,fhga:0,form:[]});return m.get(n)};
  for(const r of rows){
    if(!r.HomeTeam||!r.AwayTeam||num(r.FTHG)==null||num(r.FTAG)==null)continue;
    const H=team(r.HomeTeam),A=team(r.AwayTeam),hg=num(r.FTHG),ag=num(r.FTAG),hh=num(r.HTHG)??0,ha=num(r.HTAG)??0;
    H.p++;A.p++;H.gf+=hg;H.ga+=ag;A.gf+=ag;A.ga+=hg;H.hp++;H.hgf+=hg;H.hga+=ag;A.ap++;A.agf+=ag;A.aga+=hg;
    H.fhgf+=hh;H.fhga+=ha;A.fhgf+=ha;A.fhga+=hh;
    H.form.push(hg>ag?3:hg===ag?1:0);A.form.push(ag>hg?3:hg===ag?1:0);
  }
  return m;
}
function confidence(home,away,prob,half=false){
  const sample=Math.min(home?.p||0,away?.p||0);
  let q=Math.min(1,sample/8);
  let decisiveness=Math.abs(prob-.5)*2;
  let score=28+42*q+25*decisiveness;
  if(sample<5)score=Math.min(score,48);
  if(half)score-=10;
  return Math.round(clamp(score/100)*100);
}
function label(c){return c>=70?"İyi":c>=50?"Orta":"Düşük"}
function oddsOf(r){
  const pick=(...ks)=>{for(const k of ks){const v=num(r[k]);if(v&&v>1)return v}return null};
  return {H:pick("AvgH","B365H","MaxH"),D:pick("AvgD","B365D","MaxD"),A:pick("AvgA","B365A","MaxA"),O25:pick("Avg>2.5","B365>2.5","Max>2.5"),U25:pick("Avg<2.5","B365<2.5","Max<2.5")};
}
function prediction(home,away,S,row={}){
  const hs=S.get(home),as=S.get(away);
  const leagueTeams=[...S.values()].filter(x=>x.p);
  const avg=leagueTeams.length?leagueTeams.reduce((z,x)=>z+x.gf,0)/leagueTeams.reduce((z,x)=>z+x.p,0):1.35;
  const hAtt=hs?.hp?hs.hgf/hs.hp:hs?.p?hs.gf/hs.p:avg;
  const hDef=hs?.hp?hs.hga/hs.hp:hs?.p?hs.ga/hs.p:avg;
  const aAtt=as?.ap?as.agf/as.ap:as?.p?as.gf/as.p:avg;
  const aDef=as?.ap?as.aga/as.ap:as?.p?as.ga/as.p:avg;
  const lh=clamp((hAtt+aDef)/2*.0 + (hAtt+aDef)/2, .25, 3.2);
  const la=clamp((aAtt+hDef)/2, .2, 3.0);
  const p=probs(lh,la), odds=oddsOf(row);
  const halfKeys=new Set(["FHBTTS","FH05","FH15","SH05","SH15","HALF1","HALF2","HALFEQ"]);
  const markets={};
  for(const [k,v] of Object.entries(p)){
    const c=confidence(hs,as,v,halfKeys.has(k)),o=odds[k]||null;
    markets[k]={p:v,confidence:c,label:label(c),odds:o,ev:o? v*o-1:null};
  }
  return {lambdaHome:lh,lambdaAway:la,sample:Math.min(hs?.p||0,as?.p||0),markets};
}
function parseDate(s){
  if(!s)return null; const m=s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);if(!m)return null;
  let y=+m[3];if(y<100)y+=2000;return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
}
async function history(code){
  if(!LEAGUES[code]?.hist)return [];
  return cached("hist:"+code,async()=>csv(await getText(HIST_BASE+LEAGUES[code].hist+".csv")),30*60*1000);
}
async function fixtureRows(){
  return cached("fixtures",async()=>csv(await getText(FIXTURES)),15*60*1000);
}
function standingsFrom(rows){
  const t=new Map(),g=n=>{if(!t.has(n))t.set(n,{team:n,P:0,W:0,D:0,L:0,GF:0,GA:0,Pts:0});return t.get(n)};
  for(const r of rows){const hg=num(r.FTHG),ag=num(r.FTAG);if(hg==null||ag==null)continue;const h=g(r.HomeTeam),a=g(r.AwayTeam);h.P++;a.P++;h.GF+=hg;h.GA+=ag;a.GF+=ag;a.GA+=hg;if(hg>ag){h.W++;a.L++;h.Pts+=3}else if(hg<ag){a.W++;h.L++;a.Pts+=3}else{h.D++;a.D++;h.Pts++;a.Pts++}}
  return [...t.values()].map(x=>({...x,GD:x.GF-x.GA})).sort((a,b)=>b.Pts-a.Pts||b.GD-a.GD||b.GF-a.GF);
}
async function tff(){
  return cached("tff",async()=>{
    const html=await getText(TFF),$=cheerio.load(html),text=$("body").text().replace(/\s+/g," ");
    const teams=new Set(), fixtures=[];
    // TFF pages vary; harvest recognizable match rows without inventing data.
    $("tr").each((_,el)=>{
      const cells=$(el).find("td").map((_,x)=>$(x).text().replace(/\s+/g," ").trim()).get().filter(Boolean);
      const line=cells.join(" | ");
      const score=line.match(/(\d+)\s*-\s*(\d+)/);
      if(cells.length>=2 && (score || /-\s*$/.test(line))){
        const names=cells.filter(x=>/[A-ZÇĞİÖŞÜ]{3}/.test(x) && !/PUAN|HAFTA|SEZON|DETAY/i.test(x));
        if(names.length>=2){teams.add(names[0]);teams.add(names[1]);fixtures.push({home:names[0],away:names[1],raw:line});}
      }
    });
    return {teams:[...teams],fixtures,source:TFF};
  },15*60*1000);
}
app.get("/api/health",(req,res)=>res.json({ok:true,free:true,cacheMinutes:TTL/60000,sources:["Football-Data.co.uk","TFF"]}));
app.get("/api/leagues",(req,res)=>res.json(Object.entries(LEAGUES).map(([code,x])=>({code,...x}))));
app.get("/api/day",async(req,res)=>{
  try{
    const date=req.query.date||new Date().toISOString().slice(0,10);
    const all=await fixtureRows();
    const selected=all.filter(r=>parseDate(r.Date)===date && LEAGUES[r.Div]);
    const byLeague={};
    for(const r of selected){
      const code=r.Div, hist=await history(code), S=stats(hist);
      (byLeague[code]??=[]).push({league:LEAGUES[code],code,date,home:r.HomeTeam,away:r.AwayTeam,time:r.Time||"",prediction:prediction(r.HomeTeam,r.AwayTeam,S,r)});
    }
    res.json({date,source:"Football-Data.co.uk",matches:Object.values(byLeague).flat(),count:selected.length});
  }catch(e){res.status(502).json({error:e.message})}
});
app.get("/api/league/:code",async(req,res)=>{
  try{
    const code=req.params.code.toUpperCase();if(!LEAGUES[code])return res.status(404).json({error:"Lig bulunamadı"});
    const rows=await history(code), S=stats(rows), standings=standingsFrom(rows);
    res.json({code,league:LEAGUES[code],completed:rows.length,standings,teams:[...S.values()]});
  }catch(e){res.status(502).json({error:e.message})}
});
app.get("/api/turkey",async(req,res)=>{
  try{
    const rows=await history("T1"),S=stats(rows),base={completed:rows.length,standings:standingsFrom(rows),teams:[...S.values()]};
    try{base.tff=await tff()}catch(e){base.tff={error:e.message,source:TFF}}
    res.json(base);
  }catch(e){res.status(502).json({error:e.message})}
});
app.use(express.static("public/public"));
app.listen(PORT,()=>console.log(`Football Analysis running on ${PORT}`));
