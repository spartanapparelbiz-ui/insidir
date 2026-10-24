/* Connections as a radial graph (window.InsidirGraph), not a hairball: the selected company or person in the centre, the
   people and companies it is directly tied to on a first ring, and their other ties on an outer ring next to them.
   1px lines; hovering or focusing a node lights its path to the centre and dims the rest. At most `cap` nodes (25),
   with "Show more". Companies show their logo (ui.js), people their initials. Data: GET /v1/entities/<cik>/connections
   (src/connections.mjs): {subject, nodes:[{id,name,kind,ticker,url}], edges:[{from,to,role,filings}]}.
   mount(el, data, {cap}) */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
function mount(el,data,{cap=25}={}){
 const center=data.subject?.id;let limit=cap;
 const byId=new Map((data.nodes||[]).map(n=>[n.id,n]));
 const adj=new Map();for(const e of data.edges||[]){for(const [a,b] of [[e.from,e.to],[e.to,e.from]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push({id:b,e});}}
 // first ring: direct ties, most filings first; outer ring: each first-ring node's other ties
 const ring1=[...new Map((adj.get(center)||[]).map(x=>[x.id,x])).values()].sort((a,b)=>(b.e.filings||0)-(a.e.filings||0));
 const seen=new Set([center,...ring1.map(x=>x.id)]),ring2=[];
 for(const r of ring1)for(const x of (adj.get(r.id)||[])){if(seen.has(x.id))continue;seen.add(x.id);ring2.push({...x,parent:r.id});}
 function draw(){
  const r1=ring1.slice(0,Math.min(ring1.length,limit-1)),room=Math.max(0,limit-1-r1.length),r2=ring2.filter(x=>r1.some(p=>p.id===x.parent)).slice(0,room);
  const total=ring1.length+ring2.length,W=el.clientWidth||600,H=Math.max(360,Math.min(560,W*.75)),cx=W/2,cy=H/2;
  const R1=Math.min(W,H)*(r2.length?.24:.34),R2=Math.min(W,H)*.44;
  const pos=new Map([[center,{x:cx,y:cy,a:0}]]);
  r1.forEach((n,i)=>{const a=-Math.PI/2+i*2*Math.PI/Math.max(1,r1.length);pos.set(n.id,{x:cx+R1*Math.cos(a),y:cy+R1*Math.sin(a),a,parent:center});});
  const kids=new Map();for(const k of r2){if(!kids.has(k.parent))kids.set(k.parent,[]);kids.get(k.parent).push(k);}
  const span=2*Math.PI/Math.max(1,r1.length);
  for(const [p,list] of kids){const pa=pos.get(p).a;list.forEach((k,i)=>{const a=pa+(i-(list.length-1)/2)*Math.min(.32,span/Math.max(1,list.length));pos.set(k.id,{x:cx+R2*Math.cos(a),y:cy+R2*Math.sin(a),a,parent:p});});}
  const lines=[...pos.entries()].filter(([id,p])=>p.parent).map(([id,p])=>{const q=pos.get(p.parent);return `<line data-to="${UI.esc(id)}" x1="${q.x.toFixed(1)}" y1="${q.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`;}).join("");
  const node=(id,p)=>{const n=byId.get(id)||{name:id,kind:"company"};const isC=id===center;const lab=n.kind==="company"?(n.ticker||UI.fmt.company(n.name)):UI.fmt.person(n.name);
   const pic=n.kind==="company"?UI.logo(n.ticker||"",isC?40:28,n.name):UI.face(n.name,{cik:n.cik||(/[?&]cik=(\d+)/.exec(n.url||"")||[])[1],size:isC?32:24});
   const href=n.url?(n.url.startsWith("/")?n.url:"/"+n.url):null;
   return `<${href?`a href="${UI.esc(href)}"`:"span"} class="gn${isC?" gn--c":""}" data-id="${UI.esc(id)}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px">${pic}<span class="gn__l">${UI.esc(lab)}</span></${href?"a":"span"}>`;};
  el.innerHTML=`<div class="graph" style="height:${H}px"><svg width="${W}" height="${H}" aria-hidden="true">${lines}</svg>${[...pos.entries()].map(([id,p])=>node(id,p)).join("")}</div>
   ${total>r1.length+r2.length?`<div class="graph__more"><button class="btn btn--ghost" type="button">Show more (${total-(r1.length+r2.length)})</button></div>`:""}`;
  UI.hydrateLogos(el);
  const g=el.querySelector(".graph");
  const light=id=>{const path=new Set();let cur=id;while(cur){path.add(cur);cur=pos.get(cur)?.parent;}
   g.classList.add("is-focus");for(const n of g.querySelectorAll(".gn"))n.classList.toggle("is-on",path.has(n.dataset.id));for(const l of g.querySelectorAll("line"))l.classList.toggle("is-on",path.has(l.dataset.to));};
  const clear=()=>{g.classList.remove("is-focus");};
  for(const n of g.querySelectorAll(".gn")){n.addEventListener("pointerenter",()=>light(n.dataset.id));n.addEventListener("focus",()=>light(n.dataset.id));n.addEventListener("pointerleave",clear);n.addEventListener("blur",clear);}
  el.querySelector(".graph__more button")?.addEventListener("click",()=>{limit+=cap;draw();});
 }
 draw();
 let lastW=el.clientWidth;
 const ro=new ResizeObserver(()=>{if(el.clientWidth===lastW)return;lastW=el.clientWidth;clearTimeout(ro.t);ro.t=setTimeout(draw,120);});ro.observe(el);
 return {redraw:draw};
}
window.InsidirGraph=Object.freeze({mount});
})();
