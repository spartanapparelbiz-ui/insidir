/* Insidir Web Push. No offline caching or background surveillance. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let message={};
  try{message=event.data?.json()||{}}catch{message={}}
  const title=typeof message.title==="string"?message.title.slice(0,110):"Insidir — new filing";
  const body=typeof message.body==="string"?message.body.slice(0,240):"New SEC filing activity for your follows.";
  const target=typeof message.url==="string"&&/^\/(?:filing\.html\?accession=\d{18}|alerts\.html)$/.test(message.url)?message.url:"/alerts.html";
  event.waitUntil(self.registration.showNotification(title,{
    body,icon:"/assets/icons/favicon.svg",badge:"/assets/icons/favicon.svg",
    tag:typeof message.tag==="string"?message.tag.slice(0,96):"insidir-filing",
    data:{url:target},renotify:false
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification?.data?.url||"/alerts.html";
  const url=new URL(target,self.location.origin);
  if(url.origin!==self.location.origin)return;
  event.waitUntil((async()=>{
    const tabs=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const tab of tabs){
      if(new URL(tab.url).origin===url.origin){
        await tab.navigate(url.href);
        return tab.focus();
      }
    }
    return self.clients.openWindow(url.href);
  })());
});