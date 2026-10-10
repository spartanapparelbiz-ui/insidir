export function clusterPurchases(rows, {days=7,minOwners=2,asOf=new Date()}={}) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("days must be 1–90");
  if (!Number.isInteger(minOwners) || minOwners < 2 || minOwners > 20) throw new Error("minOwners must be 2–20");
  const cutoff = new Date(asOf.getTime()-days*86400000).toISOString().slice(0,10);
  const groups = new Map();
  for (const t of rows) {
    if (t.category !== "reported_purchase" || t.derivative || !t.ownerCik || !t.transactionDate || t.transactionDate < cutoff) continue;
    if (!groups.has(t.issuerCik)) groups.set(t.issuerCik,{issuerCik:t.issuerCik,ticker:t.ticker,owners:new Set(),transactions:[],totalReportedValue:0});
    const g=groups.get(t.issuerCik);
    g.owners.add(t.ownerCik);
    g.transactions.push(t);
    if (t.estimatedValue != null) g.totalReportedValue += t.estimatedValue;
  }
  return [...groups.values()].filter(g=>g.owners.size>=minOwners).map(g=>({
    issuerCik:g.issuerCik,ticker:g.ticker,distinctReportingOwners:g.owners.size,
    transactionCount:g.transactions.length,estimatedReportedValue:Math.round(g.totalReportedValue*100)/100,
    firstTransactionDate:g.transactions.map(t=>t.transactionDate).sort()[0],
    lastTransactionDate:g.transactions.map(t=>t.transactionDate).sort().at(-1),
    sourceUrls:[...new Set(g.transactions.map(t=>t.sourceUrl))],
    caveat:"Descriptive grouping of reported purchases, not a forecast or recommendation."
  })).sort((a,b)=>b.distinctReportingOwners-a.distinctReportingOwners||b.transactionCount-a.transactionCount);
}
export const sourceRegistry=Object.freeze([
  {id:"sec-form4",name:"SEC Form 4",status:"enabled",type:"public regulatory filings",scope:"Corporate ownership disclosures; reported purchases and sales verified from transaction codes."},
  {id:"house-financial",name:"U.S. House financial disclosures",status:"disabled_pending_permissions",type:"political disclosure",scope:"No scraping, ingestion, or commercial redistribution until legal/licensing review."},
  {id:"senate-financial",name:"U.S. Senate financial disclosures",status:"disabled_pending_permissions",type:"political disclosure",scope:"No scraping, ingestion, or commercial redistribution until legal/licensing review."},
  {id:"political-social",name:"Public figure social posts",status:"disabled_pending_permissions",type:"third-party social data",scope:"No social-media ingest without authorized API, approved license, and provenance checks."},
  {id:"digital-assets",name:"Cryptocurrency and meme coins",status:"disabled_pending_permissions",type:"market/asset data",scope:"No politician-wallet attribution absent reliable verification."}
]);
