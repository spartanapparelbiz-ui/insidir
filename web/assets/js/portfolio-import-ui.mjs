/* Paid portfolio CSV import: parse locally, preview, then send ONLY validated tickers/quantities. */
import {parsePortfolioCsv,MAX_CSV_BYTES} from "./portfolio-csv.mjs";

const file=document.getElementById("portfolio-csv-file");
if(file) {
  const summary=document.getElementById("portfolio-csv-summary");
  const preview=document.getElementById("portfolio-csv-preview");
  const confirm=document.getElementById("portfolio-csv-confirm");
  const completed=document.getElementById("portfolio-csv-completed");
  let pending=null,sequence=0;
  const message=(text,bad=false)=>{
    summary.textContent=text;
    summary.setAttribute("data-error",String(bad));
  };
  const reset=()=>{
    pending=null;preview.replaceChildren();confirm.hidden=true;
    confirm.disabled=true;completed.hidden=true;
  };

  file.addEventListener("change",async()=>{
    const current=++sequence;reset();
    const selected=file.files?.[0];
    if(!selected){message("Choose a current holdings CSV exported from your brokerage.");return;}
    if(!/\.(csv|tsv)$/i.test(selected.name)){message("Select a .csv or .tsv holdings export.",true);return;}
    if(selected.size>MAX_CSV_BYTES){message("The file is too large. Maximum 1 MB.",true);return;}
    message("Reading holdings locally…");
    try {
      const result=parsePortfolioCsv(await selected.text());
      if(current!==sequence)return;
      pending=result;
      const list=document.createElement("ul");
      list.className="portfolio-csv-list";
      for(const item of result.items.slice(0,12)){
        const li=document.createElement("li");
        li.textContent=item.ticker+(item.quantity!==null?" · "+item.quantity+" shares":" · monitoring only");
        list.appendChild(li);
      }
      preview.replaceChildren(list);
      if(result.items.length>12){
        const more=document.createElement("p");
        more.textContent="…and "+(result.items.length-12)+" more.";
        preview.appendChild(more);
      }
      const excluded=Object.values(result.skipped).reduce((a,b)=>a+b,0)-result.skipped.duplicates;
      message("Found "+result.items.length+" unique stocks."+
        (result.skipped.duplicates?" Combined "+result.skipped.duplicates+" duplicate rows.":"")+
        (excluded?" Skipped "+excluded+" cash, option, invalid, or inactive rows.":"")+
        (!result.hasQuantities?" This file has no share quantities; stocks will be monitored without balances.":"")+
        " Review the preview, then confirm.");
      confirm.textContent="Import and monitor "+result.items.length+" stock"+(result.items.length===1?"":"s");
      confirm.hidden=false;confirm.disabled=false;
    } catch(error) {if(current===sequence)message(error.message||"Could not read this CSV.",true);}
  });

  confirm.addEventListener("click",async()=>{
    if(!pending || confirm.disabled)return;
    confirm.disabled=true;file.disabled=true;
    const items=pending.items;
    message("Importing "+items.length+" stocks into your private watchlist…");
    try{
      const res=await fetch("/v1/me/portfolio/import",{
        method:"POST",credentials:"same-origin",
        headers:{Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify({items})
      });
      let result=null;try{result=await res.json();}catch{}
      if(!res.ok)throw Error(result?.error || (res.status===402?"Active Insidir access is required.":"Import failed; please retry."));
      const missed=Number(result.quantitiesNotSaved||0);
      message("Imported "+result.imported+" stocks for monitoring."+
        (result.quantitiesSaved?" Saved "+result.quantitiesSaved+" share quantities.":"")+
        (missed?" "+missed+" quantities could not be stored because the 100-holding limit was reached.":"")+
        " Existing stocks were kept. Only supported public filings generate updates.");
      completed.hidden=false;pending=null;confirm.hidden=true;file.value="";
      window.dispatchEvent(new Event("insidir:portfolio-imported"));
    }catch(error){message(error.message||"Import failed. Try again.",true);confirm.disabled=false;}
    finally{file.disabled=false;}
  });
}
