/* The signature chart (window.InsidirChart). Daily closes as a 1.5px line over a fill that fades from 16% to nothing;
   no axis lines; at most four price and four date labels (12px, muted) with faint dotted gridlines at the price ones;
   a crosshair with a glass tooltip; a soft pulsing dot at the latest close; and every open-market insider trade on the
   line: a green dot for a buy, a coral dot for a sale, a gray ring for a 10b5-1 plan sale, sized by the amount, each a
   link to its SEC filing that says who, their role and how much on hover. TradingView Lightweight Charts draws the
   line (Apache-2.0; attribution on each page); the labels, markers and dot are an HTML layer above it.
   mount(el, {closes:[[day,close]], markers:[{day,kind,planned,value,owner,role,url}]}, {range}) → {setRange, destroy} */
(()=>{"use strict";
const LW=window.LightweightCharts, UI=window.InsidirUI, M=window.Motion||null;
if(!LW||!UI){console.error("chart.js needs lightweight-charts and ui.js");return;}
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const RANGES={"1M":31,"3M":92,"6M":183,"1Y":366,"5Y":1830};
const GUTTER_R=48, GUTTER_B=24;          // room for the price labels on the right and the dates below

/* Three or four round price levels inside [lo, hi]: the smallest round step that gives at most four. */
function ticks(lo,hi){
 if(!(hi>lo))return [lo];
 const mag=10**Math.floor(Math.log10((hi-lo)/4));
 const count=s=>Math.floor(hi/s+1e-9)-Math.ceil(lo/s-1e-9)+1;
 const step=[1,2,2.5,5,10,20,25,50].map(f=>f*mag).find(s=>count(s)<=4);
 const out=[];for(let v=Math.ceil(lo/step-1e-9)*step;v<=hi+1e-9;v+=step)out.push(+v.toFixed(6));
 return out;
}
const priceLabel=v=>"$"+v.toLocaleString("en-US",{minimumFractionDigits:v<10&&v%1?2:0,maximumFractionDigits:2});

function mount(el,data,{range="6M"}={}){
 el.classList.add("chart");
 el.innerHTML=`<div class="chart__plot"></div><div class="chart__grid" aria-hidden="true"></div><div class="chart__x" aria-hidden="true"></div><div class="chart__marks"></div><span class="chart__now" aria-hidden="true" hidden></span><div class="tip chart__tip" hidden></div>`;
 const plot=el.querySelector(".chart__plot"),grid=el.querySelector(".chart__grid"),xax=el.querySelector(".chart__x"),marks=el.querySelector(".chart__marks"),now=el.querySelector(".chart__now"),tip=el.querySelector(".chart__tip");
 plot.style.right=GUTTER_R+"px";plot.style.bottom=GUTTER_B+"px";
 // The line and fill take the design tokens (ui.css --text, --bg), so the chart has no colours of its own.
 const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),TEXT=tok("--text")||"rgb(240,238,232)",BG=tok("--bg")||"rgb(12,12,11)";
 const chart=LW.createChart(plot,{autoSize:true,
  layout:{background:{type:"solid",color:"transparent"},textColor:"rgba(0,0,0,0)",fontFamily:"Geist, system-ui, sans-serif",fontSize:12,attributionLogo:false},
  grid:{vertLines:{visible:false},horzLines:{visible:false}},
  rightPriceScale:{visible:false,scaleMargins:{top:.12,bottom:.06}},leftPriceScale:{visible:false},
  timeScale:{visible:false,borderVisible:false,fixLeftEdge:true,fixRightEdge:true,lockVisibleTimeRangeOnResize:true},
  crosshair:{mode:LW.CrosshairMode.Magnet,vertLine:{color:"rgba(240,238,232,0.2)",width:1,style:LW.LineStyle.Dashed,labelVisible:false},horzLine:{visible:false,labelVisible:false}},
  handleScroll:false,handleScale:false});
 const series=chart.addSeries(LW.AreaSeries,{lineColor:TEXT,lineWidth:1.5,topColor:"rgba(240,238,232,0.16)",bottomColor:"rgba(240,238,232,0)",
  priceLineVisible:false,lastValueVisible:false,crosshairMarkerRadius:4,crosshairMarkerBorderColor:BG,crosshairMarkerBorderWidth:2,crosshairMarkerBackgroundColor:TEXT});
 const all=(data.closes||[]).map(([d,v])=>({time:d,value:v}));
 const byDay=new Map(all.map(p=>[p.time,p.value]));
 const onLine=day=>{if(byDay.has(day))return {time:day,value:byDay.get(day)};let best=null;for(const p of all){if(p.time<=day)best=p;else break;}return best;};
 let shown=[];
 function setRange(r){
  range=RANGES[r]?r:"6M";const last=all.at(-1)?.time;if(!last){shown=[];series.setData([]);return;}
  const from=new Date(Date.parse(last+"T00:00:00Z")-RANGES[range]*864e5).toISOString().slice(0,10);
  shown=all.filter(p=>p.time>=from);series.setData(shown);chart.timeScale().fitContent();
  drawMarks(true);soon();
 }
 // diameter from 8px for a small trade to 18px for $10M or more
 const size=v=>Math.max(4,Math.min(9,4+Math.sqrt((Number(v)||0)/1e6)*1.6));
 function drawMarks(animate){
  const from=shown[0]?.time;marks.innerHTML="";
  const list=(data.markers||[]).filter(m=>from&&m.day>=from).map(m=>({m,p:onLine(m.day)})).filter(x=>x.p);
  list.sort((a,b)=>(b.m.value||0)-(a.m.value||0));
  for(const {m,p} of list){
   const a=document.createElement(m.url?"a":"span");
   a.className="mk mk--"+(m.planned?"plan":m.kind==="buy"?"buy":"sell");
   a.style.setProperty("--d",(size(m.value)*2)+"px");a.dataset.time=p.time;a.dataset.value=p.value;
   if(m.url){a.href=m.url;a.target="_blank";a.rel="nofollow noopener";}
   a.setAttribute("aria-label",`${UI.fmt.person(m.owner)}, ${UI.fmt.role(m.role)}, ${m.kind==="buy"?"bought":"sold"} ${UI.fmt.money(m.value)} on ${UI.fmt.date(m.day)}${m.planned?", pre-scheduled 10b5-1 plan":""}. Open the SEC filing.`);
   a.addEventListener("pointerenter",()=>showMark(a,m));a.addEventListener("pointerleave",()=>{tip.hidden=true;});a.addEventListener("focus",()=>showMark(a,m));a.addEventListener("blur",()=>{tip.hidden=true;});
   marks.append(a);
  }
  if(animate&&!reduce&&M?.animate)[...marks.children].forEach((n,i)=>M.animate(n,{opacity:[0,1],transform:["translate(-50%,-50%) scale(.4)","translate(-50%,-50%) scale(1)"]},{type:"spring",stiffness:380,damping:24,delay:.25+Math.min(i,12)*.025}));
 }
 // labels, gridlines, markers and the latest-close dot, positioned from the chart's own scales
 function layout(){
  if(!shown.length)return;
  const vals=shown.map(p=>p.value),lo=Math.min(...vals),hi=Math.max(...vals),W=plot.clientWidth;
  grid.innerHTML=ticks(lo,hi).map(v=>{const y=series.priceToCoordinate(v);return y==null?"":`<span style="top:${y}px"><i style="width:${W}px"></i><b style="left:${W+12}px">${priceLabel(v)}</b></span>`;}).join("");
  const n=shown.length,idx=[...new Set([0,1,2,3].map(k=>Math.round(k*(n-1)/3)))];
  xax.innerHTML=idx.map((i,k)=>{const x=chart.timeScale().timeToCoordinate(shown[i].time);return x==null?"":`<span style="left:${x}px" class="${k===0?"is-first":k===idx.length-1?"is-last":""}">${UI.fmt.date(shown[i].time,false)}</span>`;}).join("");
  for(const a of marks.children){const x=chart.timeScale().timeToCoordinate(a.dataset.time),y=series.priceToCoordinate(Number(a.dataset.value));
   if(x==null||y==null){a.style.display="none";continue;}a.style.display="";a.style.left=x+"px";a.style.top=y+"px";}
  const last=shown.at(-1),lx=chart.timeScale().timeToCoordinate(last.time),ly=series.priceToCoordinate(last.value);
  if(lx!=null&&ly!=null){now.style.left=lx+"px";now.style.top=ly+"px";now.hidden=false;}
 }
 function showMark(a,m){
  tip.innerHTML=`<div class="chart__tip-h">${UI.monogram(m.owner)}<b>${UI.esc(UI.fmt.person(m.owner))}</b></div><div>${UI.esc(UI.fmt.role(m.role))} · <span class="${m.planned?"plan":m.kind==="buy"?"up":"down"}">${m.kind==="buy"?"bought":"sold"} ${UI.fmt.money(m.value)}</span>${m.planned?" · 10b5-1 plan":""}</div><div>${UI.fmt.date(m.day)}${m.url?" · open filing":""}</div>`;
  tip.hidden=false;position(parseFloat(a.style.left),parseFloat(a.style.top));
 }
 function position(x,y){const w=tip.offsetWidth,h=tip.offsetHeight,Wd=el.clientWidth;tip.style.left=Math.max(0,Math.min(Wd-w,x-w/2))+"px";tip.style.top=Math.max(0,y-h-14)+"px";}
 chart.subscribeCrosshairMove(p=>{if(marks.matches(":hover"))return;
  if(!p.point||!p.time){tip.hidden=true;return;}const v=p.seriesData.get(series)?.value;if(v==null){tip.hidden=true;return;}
  tip.innerHTML=`<div><b>${UI.fmt.price(v)}</b></div><div>${UI.fmt.date(p.time)}</div>`;tip.hidden=false;position(p.point.x,series.priceToCoordinate(v));});
 // The chart re-fits its price scale on its own next paint: place the overlay after that (two frames), and once more
 // shortly after, so labels and markers always sit on the line that is drawn.
 function soon(){requestAnimationFrame(()=>requestAnimationFrame(layout));clearTimeout(soon.t);soon.t=setTimeout(layout,120);}
 chart.timeScale().subscribeVisibleLogicalRangeChange(soon);
 chart.timeScale().subscribeSizeChange(soon);
 const ro=new ResizeObserver(soon);ro.observe(el);
 setRange(range);
 if(!reduce)el.animate?.([{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0 0 0)"}],{duration:400,easing:"cubic-bezier(.2,.9,.25,1)"});
 return {setRange,destroy(){ro.disconnect();chart.remove();},chart,series};
}
window.InsidirChart=Object.freeze({mount,ticks,RANGES:Object.keys(RANGES)});
})();
