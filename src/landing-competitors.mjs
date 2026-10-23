/* The landing page's comparison table. Only claims checked on each product's own public pages go in, with the date
 * they were checked; a competitor's column is shown only once `verified` is true. Unusual Whales and OpenInsider could
 * not be reached from the build environment on Oct 23, 2026, so their columns (and the "$50/mo" anchor line under
 * the pricing card) stay hidden until someone checks their pricing and feature pages and fills the cells in here. */
export const CHECKED_ON = "2026-10-23";
export const COMPETITORS = Object.freeze({
  rows: [["plain", "Plain-English explanation of each trade"], ["alerts", "Alerts minutes after a filing"], ["linked", "Every number linked to its filing"],
    ["phone", "Built for phones"], ["trackRecord", "Each insider's track record"], ["price", "Price"]],
  insidir: { plain: true, alerts: true, linked: true, phone: true, trackRecord: true, price: "$1 for 7 days, then $39/mo" },
  edgar: { plain: false, alerts: "RSS feeds only", linked: "It is the filing", phone: "Raw forms", trackRecord: false, price: "Free" },
  others: [
    { name: "Unusual Whales", verified: false, url: "https://unusualwhales.com/pricing", cells: {} },
    { name: "OpenInsider", verified: false, url: "http://openinsider.com/", cells: {} }
  ],
  // e.g. "Unusual Whales is $50/mo." — only after it is checked on their pricing page.
  anchor: null
});
