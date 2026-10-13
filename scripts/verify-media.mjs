/* Deployment gate: actual published image endpoints must return image bytes.
 * This rejects branded placeholders and inaccurate external URL guesses.
 */
import assert from "node:assert/strict";
const media=[
 ["Apple logo","https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg","svg"],
 ["Microsoft logo","https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg","svg"],
 ["NVIDIA logo","https://upload.wikimedia.org/wikipedia/commons/4/48/Nvidia_Logo.svg","svg"],
 ["Tesla logo","https://upload.wikimedia.org/wikipedia/commons/b/bb/Tesla_T_symbol.svg","svg"],
 ["Tim Cook","https://upload.wikimedia.org/wikipedia/commons/9/9e/Tim_Cook_%282017%2C_cropped%29.jpg","jpeg"],
 ["Satya Nadella","https://upload.wikimedia.org/wikipedia/commons/4/4a/Satya_Nadella_%28cropped%29.jpg","jpeg"],
 ["Jensen Huang","https://upload.wikimedia.org/wikipedia/commons/5/59/Jensen_Huang_%28cropped%29_%282024%29.jpg","jpeg"],
 ["Elon Musk","https://upload.wikimedia.org/wikipedia/commons/3/30/Elon_Musk_close-up_%28cropped%29.jpg","jpeg"]
];
for(const [name,url,format] of media){
 let ok=false,lastError="";
 for(let attempt=0;attempt<2&&!ok;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{"User-Agent":"Insidir-public-image-check/1.0 (contact: hello@aethric.llc)","Accept":"image/*,application/xml;q=0.5"}});
   assert.ok(response.ok,name+": HTTP "+response.status);
   const mime=response.headers.get("content-type")||"";
   assert.match(mime,format==="svg"?/image\/svg\+xml/:/image\/jpeg/,name+": wrong media type "+mime);
   const reader=response.body.getReader();
   const first=await reader.read();
   await reader.cancel();
   assert.ok(first.value?.length>12,name+": no image bytes");
   if(format==="jpeg")assert.ok(first.value[0]===255&&first.value[1]===216,name+": invalid JPEG header");
   if(format==="svg"){
    const begin=new TextDecoder().decode(first.value.slice(0,800));
    assert.match(begin,/<svg\b|<\?xml/,name+": invalid SVG header");
   }
   ok=true;console.log("Verified real image: "+name+" ("+mime+")");
  }catch(e){lastError=String(e);}
 }
 if(!ok)throw new Error(name+" has no working source photo/logo: "+lastError);
}
console.log("All 8 exact-source public assets verified.");
