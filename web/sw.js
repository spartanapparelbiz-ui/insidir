/* Insidir web push service worker. No cross-origin notification links. */
self.addEventListener("push",event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const original=String(data.title||"Research update").replace(/^[Ii]nsidir\s*[·—:-]\s*/,"");
 const title="Insidir · "+original.slice(0,65);
 const safeUrl=typeof data.url==="string"&&data.url.startsWith("/")&&!data.url.startsWith("//")?data.url:"/alerts.html";
 event.waitUntil(self.registration.showNotification(title,{
  body:typeof data.body==="string"?data.body.slice(0,200):"New source-backed research activity.",
  tag:typeof data.tag==="string"?data.tag.slice(0,64):"insidir",
  icon:"/assets/icons/favicon.svg",badge:"/assets/icons/favicon.svg",
  data:{url:safeUrl}
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||"/alerts.html",self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows=>{
  const existing=windows.find(w=>w.url.startsWith(self.location.origin));
  if(existing){await existing.focus();return existing.navigate(url.href);}
  return clients.openWindow(url.href);
 }));
});