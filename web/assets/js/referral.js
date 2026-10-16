/* Last creator link clicked (30-day attribution). No cookies or third-party scripts.
 * Registration is still validated by the backend; pending/invalid codes earn nothing. */
(() => {
  "use strict";
  const code = new URLSearchParams(location.search).get("ref");
  if (code===null)return;
  const clean=code.trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(clean))return;
  try{localStorage.setItem("insidir:creator-ref",JSON.stringify({code:clean,until:Date.now()+30*86400000}));}
  catch(_){/* private browsing */ }
})();
