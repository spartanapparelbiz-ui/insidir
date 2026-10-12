(() => {
  const menu=document.getElementById("lv-menu");
  const button=document.getElementById("lv-menu-button");
  if(!menu||!button)return;
  const set=open=>{menu.hidden=!open;button.setAttribute("aria-expanded",String(open));button.setAttribute("aria-label",open?"Close navigation":"Open navigation");};
  button.addEventListener("click",()=>set(menu.hidden));
  menu.addEventListener("click",e=>{if(e.target.closest("a"))set(false);});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!menu.hidden){set(false);button.focus();}});
  document.addEventListener("click",e=>{if(!menu.hidden&&!menu.contains(e.target)&&!button.contains(e.target))set(false);});
  window.addEventListener("resize",()=>{if(innerWidth>950)set(false);});
})();
