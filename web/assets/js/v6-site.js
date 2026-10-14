/* Insidir public site: accessible mobile navigation shared by the landing page and the
   marketing pages (Platform, Why Insidir, Data, Pricing, About). Public pages load no
   product data: everything behind the paywall stays behind it. */
(() => {"use strict";
const menu=document.getElementById("v6-menu"),button=document.getElementById("v6-menu-button");
if(!menu||!button)return;
function setMenu(open){menu.hidden=!open;button.setAttribute("aria-expanded",String(open));button.setAttribute("aria-label",open?"Close navigation":"Open navigation");document.documentElement.classList.toggle("v13-menu-open",open);}
button.addEventListener("click",()=>setMenu(menu.hidden));
menu.addEventListener("click",e=>{if(e.target.closest("a"))setMenu(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!menu.hidden){setMenu(false);button.focus();}});
document.addEventListener("click",e=>{if(!menu.hidden&&!menu.contains(e.target)&&!button.contains(e.target))setMenu(false);});
matchMedia("(min-width: 901px)").addEventListener("change",e=>{if(e.matches)setMenu(false);});
})();
