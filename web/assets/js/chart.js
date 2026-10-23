/* The signature chart (window.InsidirChart): daily closes as a 1.5px line over a fill that fades from 18% to nothing,
   faint dotted horizontal gridlines, Geist Mono 11px axis labels, a crosshair with a glass tooltip, and every
   open-market insider trade sitting on the line: a green dot for a buy, a coral dot for a sale, a gray ring for a
   sale under a 10b5-1 plan. A dot's size follows the dollar amount; it is a link to the SEC filing, and hovering it
   says who, their role and how much. Drawn with TradingView Lightweight Charts (Apache-2.0; attribution in the page
   footer and on /design), the markers in an HTML layer above it.
   mount(el, {closes:[[day,close]], markers:[{day,kind,planned,value,owner,role,url}]}, {range}) → {setRange, destroy} */
(()=>{"use strict";
const LW=window.LightweightCharts, UI=window.InsidirUI, M=window.Motion||null;
if(!LW||!UI){console.error("chart.js needs lightweight-charts and ui.js");return;}
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const RANGES={"1M":31,"3M":92,"6M":183,"1Y":366,"5Y":1830};
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function mount(el,data,{range="6M",height}={}){
 el.classList.add("chart");el.innerHTML=`<div class="chart__plot"></div><div class="chart__marks"></div><div class="tip chart__tip" hidden></div>`;
 const plot=el.querySelector(".chart__plot"),marks=el.querySelector(".chart__marks"),tip=el.querySelector(".chart__tip");
 const text=css("--text")||"#f0eee8",muted=css("--muted")||"#8f8d87";
 const chart=LW.createChart(plot,{autoSize:true,
  layout:{background:{type:"solid",color:"transparent"},textColor:muted,fontFamily:"Geist Mono, ui-monospace, monospace",fontSize:11,attributionLogo:false},
  grid:{vertLines:{visible:false},horzLines:{color:"rgba(255,255,255,0.07)",style:LW.LineStyle.Dotted}},
  rightPriceScale:{borderVisible:false,scaleMargins:{top:.16,bottom:.08},entireTextOnly:true},
  timeScale:{borderVisible:false,fixLeftEdge:true,fixRightEdge:true,lockVisibleTimeRangeOnResize:true,tickMarkFormatter:(t,type)=>{const d=new Date((typeof t==="string"?t:new Date(t*1000).toISOString().slice(0,10))+"T00:00:00Z");
   if(type===0)return String(d.getUTCFullYear());if(type===1)return d.toLocaleDateString("en-US",{month:"short",timeZone:"UTC"});return d.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"});}},
  crosshair:{mode:LW.CrosshairMode.Magnet,vertLine:{color:"rgba(240,238,232,0.22)",width:1,style:LW.LineStyle.Dashed,labelVisible:false},horzLine:{visible:false,labelVisible:false}},
  handleScroll:false,handleScale:false,localization:{priceFormatter:p=>"$"+p.toLocaleString("en-US",{minimumFractionDigits:p<10?2:0,maximumFractionDigits:2})}});
 const series=chart.addSeries(LW.AreaSeries,{lineColor:text,lineWidth:1.5,topColor:"rgba(240,238,232,0.18)",bottomColor:"rgba(240,238,232,0)",
  priceLineVisible:false,lastValueVisible:false,crosshairMarkerRadius:4,crosshairMarkerBorderColor:"#0c0c0b",crosshairMarkerBorderWidth:2,crosshairMarkerBackgroundColor:text});
 const all=(data.closes||[]).map(([d,v])=>({time:d,value:v}));
 const byDay=new Map(all.map(p=>[p.time,p.value]));
 // a trade on a day with no close (weekend, holiday) sits on the close before it
 const onLine=day=>{if(byDay.has(day))return {time:day,value:byDay.get(day)};let best=null;for(const p of all){if(p.time<=day)best=p;else break;}return best;};
 let shown=[];
 function setRange(r){
  range=RANGES[r]?r:"6M";const last=all.at(-1)?.time;if(!last){shown=[];series.setData([]);return;}
  const from=new Date(Date.parse(last+"T00:00:00Z")-RANGES[range]*864e5).toISOString().slice(0,10);
  shown=all.filter(p=>p.time>=from);series.setData(shown);chart.timeScale().fitContent();
  drawMarks(true);
 }
 // diameter 8px for a small trade up to 18px for $10M or more
 const size=v=>Math.max(4,Math.min(9,4+Math.sqrt((Number(v)||0)/1e6)*1.6));
 function drawMarks(animate){
  const from=shown[0]?.time;marks.innerHTML="";
  const list=(data.markers||[]).filter(m=>from&&m.day>=from).map(m=>({m,p:onLine(m.day)})).filter(x=>x.p);
  list.sort((a,b)=>(b.m.value||0)-(a.m.value||0));   // big ones underneath, small ones on top
  for(const {m,p} of list){
   const a=document.createElement(m.url?"a":"span");
   a.className="mk mk--"+(m.planned?"plan":m.kind==="buy"?"buy":"sell");
   const s=size(m.value);a.style.setProperty("--d",(s*2)+"px");
   a.dataset.time=p.time;a.dataset.value=p.value;
   if(m.url){a.href=m.url;a.target="_blank";a.rel="nofollow noopener";}
   const verb=m.kind==="buy"?"bought":"sold";
   a.setAttribute("aria-label",`${UI.fmt.person(m.owner)}, ${UI.fmt.role(m.role)}, ${verb} ${UI.fmt.money(m.value)} on ${UI.fmt.date(m.day)}${m.planned?", pre-scheduled 10b5-1 plan":""}. Open the SEC filing.`);
   a.addEventListener("pointerenter",()=>showMark(a,m));a.addEventListener("pointerleave",()=>{tip.hidden=true;});a.addEventListener("focus",()=>showMark(a,m));a.addEventListener("blur",()=>{tip.hidden=true;});
   marks.append(a);
  }
  place();
  if(animate&&!reduce&&M?.animate)[...marks.children].forEach((n,i)=>M.animate(n,{opacity:[0,1],transform:["translate(-50%,-50%) scale(.4)","translate(-50%,-50%) scale(1)"]},{type:"spring",stiffness:380,damping:22,delay:.25+Math.min(i,12)*.025}));
 }
 function place(){for(const a of marks.children){const x=chart.timeScale().timeToCoordinate(a.dataset.time),y=series.priceToCoordinate(Number(a.dataset.value));
  if(x==null||y==null){a.style.display="none";continue;}a.style.display="";a.style.left=x+"px";a.style.top=y+"px";}}
 function showMark(a,m){
  const verb=m.kind==="buy"?"Bought":"Sold";
  tip.innerHTML=`<div class="chart__tip-h"><span class="mono">${UI.esc(UI.initials(m.owner))}</span><b>${UI.esc(UI.fmt.person(m.owner))}</b></div><div>${UI.esc(UI.fmt.role(m.role))} · <span class="${m.planned?"plan":m.kind==="buy"?"up":"down"}">${verb} ${UI.fmt.money(m.value)}</span>${m.planned?" · 10b5-1 plan":""}</div><div class="muted num">${UI.fmt.date(m.day)}${m.url?" · Open filing ↗":""}</div>`;
  tip.hidden=false;position(parseFloat(a.style.left),parseFloat(a.style.top),true);
 }
 function position(x,y,above){const w=tip.offsetWidth,h=tip.offsetHeight,W=el.clientWidth;tip.style.left=Math.max(4,Math.min(W-w-4,x-w/2))+"px";tip.style.top=Math.max(4,above?y-h-14:y+14)+"px";}
 chart.subscribeCrosshairMove(p=>{if(marks.matches(":hover"))return;
  if(!p.point||!p.time){tip.hidden=true;return;}const v=p.seriesData.get(series)?.value;if(v==null){tip.hidden=true;return;}
  tip.innerHTML=`<div class="num"><b>${UI.fmt.price(v)}</b></div><div class="muted num">${UI.fmt.date(p.time)}</div>`;tip.hidden=false;position(p.point.x,series.priceToCoordinate(v),true);});
 chart.timeScale().subscribeVisibleLogicalRangeChange(place);
 const ro=new ResizeObserver(()=>requestAnimationFrame(place));ro.observe(el);
 if(height)plot.style.height=height+"px";
 setRange(range);
 if(!reduce){el.animate?.([{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0 0 0)"}],{duration:400,easing:"cubic-bezier(.2,.9,.25,1)"});}
 return {setRange,destroy(){ro.disconnect();chart.remove();},chart};
}
window.InsidirChart=Object.freeze({mount,RANGES:Object.keys(RANGES)});
})();
