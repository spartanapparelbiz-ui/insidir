/* Insidir research stories: free, public, source-backed explanations of historical SEC filings, and the
 * creator kit built on them. This module is the single source of truth for both:
 *
 *   STORIES            three historical filings explained (Form 4, two 10-Ks), each figure tied to a verbatim
 *                      quote from the filing (`quote`) or to Insidir's arithmetic on quoted numbers (`calc`)
 *   CREATOR_CONCEPTS   six short-form video concepts built on those filings
 *   storyUrl, storiesForTicker, storiesForPerson, PUBLIC_STORY_PATHS
 *
 * scripts/build-stories.mjs renders the pages in /web from this data (stories.html, stories/<slug>.html,
 * creator-kit.html, creators.html and the private partner-*.html briefs); src/public-pages.mjs lists the
 * stories on the insider-trading pages and in the sitemap. test/stories.test.mjs checks every figure against
 * its quote, and scripts/verify-stories.mjs re-reads every quote from sec.gov.
 *
 * These are historical examples, not news and not recommendations. Nothing here depends on who is reading,
 * and nothing here touches accounts, billing or creator commissions. */

// Approved creator codes look like this (src/creator-program.mjs REF_CODE). The kit's link builder accepts only
// this shape; whether a code is approved is decided by the server when an account registers.
export const REF_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,39}$/;

const usd = (n, digits = 0) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const int = n => n.toLocaleString("en-US");
const pct = (a, b) => (((a - b) / b) * 100).toFixed(1).replace(/^(?!-)/, "+").replace(/^-/, "−") + "%";

/* ---------- Story A: a Form 4 purchase at Enterprise Products Partners ---------- */
const EPD = { units: 2665, price: 37.5494, trust: 77576, direct: 3083226, spouse: 41155, children: 6060 };
EPD.listed = EPD.trust + EPD.direct + EPD.spouse + EPD.children;

/* ---------- Story B: Newmont's 2025 annual report ---------- */
const NEM = { sales25: 22669, sales24: 18682, gold25: 19304, gold24: 15746, oz25: 5530, oz24: 6545, price25: 3498, price24: 2408, aisc25: 1609, aisc24: 1516, ni25: 7085, ni24: 3280 };

/* ---------- Story C: Berkshire Hathaway's 2025 annual report ---------- */
const BRK = {
  net25: 66968, net24: 88995, gains25: 30737, gains24: 41558, impairment25: 8255,
  lines25: { "Insurance – underwriting": 7258, "Insurance – investment income": 12513, BNSF: 5476, "Berkshire Hathaway Energy": 3979, "Manufacturing, service and retailing": 13647, Other: 1613 },
  lines24: { "Insurance – underwriting": 9020, "Insurance – investment income": 13670, BNSF: 5031, "Berkshire Hathaway Energy": 3730, "Manufacturing, service and retailing": 13072, Other: 2914 }
};
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
BRK.ops25 = sum(BRK.lines25); BRK.ops24 = sum(BRK.lines24);

export const STORIES = Object.freeze([
  {
    slug: "enterprise-products-insider-purchase",
    kind: "Insider transactions",
    form: "SEC Form 4",
    tickers: ["EPD"],
    company: "Enterprise Products Partners L.P.",
    issuerCik: "1061219",
    people: [{ cik: "1183251", name: "A. James Teague", filedAs: "TEAGUE AJ" }],
    filed: "2026-03-23",
    period: "Transaction dated March 20, 2026",
    title: "A co-CEO bought $100,000 of units. Here is what the Form 4 actually says.",
    short: "An insider purchase, read line by line",
    description: "A March 2026 Form 4 from Enterprise Products Partners reports an open-market purchase by co-CEO A. J. Teague. What the filing proves, and what it does not.",
    lede: "On March 23, 2026, Enterprise Products Partners co-CEO A. James Teague filed a Form 4 reporting a purchase of 2,665 common units, coded P. It is a genuine purchase. It is also small next to the units the same form lists him as already holding, and it says nothing about why he bought or what the units will do next.",
    figures: [
      { label: "Transaction code", value: "P", note: "Open market or private purchase", quote: "Transaction Code P - Open market or private purchase of non-derivative or derivative security" },
      { label: "Units acquired", value: int(EPD.units), note: "Common units, March 20, 2026", quote: "03/20/2026 P 2,665 A $ 37.5494" },
      { label: "Weighted-average price", value: usd(EPD.price, 4), note: "Bought at prices from $37.545 to $37.5495", quote: "P 2,665 A $ 37.5494 (1)" },
      { label: "Reported value", value: usd(Math.round(EPD.units * EPD.price)), note: "Insidir arithmetic: 2,665 × $37.5494", calc: () => usd(Math.round(EPD.units * EPD.price)) },
      { label: "Held by trust after", value: int(EPD.trust), note: "Indirect ownership, “By Trust”", quote: "77,576 I By Trust" },
      { label: "Held directly", value: int(EPD.direct), note: "A separate line on the same form", quote: "3,083,226 D" }
    ],
    sections: [
      { heading: "What the filing reports", paras: [
        "Table I of the form has one transaction line: 2,665 common units representing limited partnership interests, acquired (A) on March 20, 2026 at a weighted-average price of $37.5494. Footnote 1 says the units were bought at prices from $37.545 to $37.5495. The transaction code is P, which the form defines as an open market or private purchase.",
        "Teague checked two boxes for his relationship to the issuer: Director, and Officer, with the title Co-Chief Executive Officer. The form was signed by an attorney-in-fact on his behalf and filed three days after the trade."
      ] },
      { heading: "Read the ownership columns, not just the purchase", paras: [
        "The purchase line ends with 77,576 units held after the transaction, marked I for indirect ownership, “By Trust”. The form then lists three more holdings that did not change: 3,083,226 units held directly, 41,155 by his spouse and 6,060 by minor children.",
        `Added together, the form lists ${int(EPD.listed)} units. The 2,665 units bought are about ${((EPD.units / EPD.listed) * 100).toFixed(2)}% of that. A headline that says “the CEO is buying” is accurate; one that implies a large new bet is not supported by this filing.`
      ] },
      { heading: "What it does not tell you", list: [
        "Why the units were bought. A Form 4 records a transaction; it has no field for a reason.",
        "What the units will do next. Insider purchases are public records, not forecasts; prices can fall after them as easily as rise.",
        "Whether other insiders bought or sold around the same time. That takes the company's other Form 4s.",
        "Anything about the partnership's business. That is in its 10-K and 10-Q filings, not in a Form 4."
      ] }
    ],
    questions: [
      "Is the code P (a purchase), or A, M, F or G (a grant, an option exercise, tax withholding, a gift)?",
      "Is the ownership direct (D) or indirect (I), and through whom?",
      "How big is the trade next to everything the form says the person already holds?",
      "Did other officers and directors file around the same dates?"
    ],
    sources: [
      { label: "Form 4, filed March 23, 2026 (the document)", url: "https://www.sec.gov/Archives/edgar/data/1183251/000118325126000006/xslF345X03/form4-03232026_080326.xml", primary: true },
      { label: "Filing index, accession 0001183251-26-000006", url: "https://www.sec.gov/Archives/edgar/data/1183251/000118325126000006/0001183251-26-000006-index.html" },
      { label: "Every Form 4 filed for Enterprise Products Partners on EDGAR", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001061219&type=4&dateb=&owner=include&count=40" }
    ],
    inInsidir: "In Insidir, every Form 4 line is written out in plain words (who, what code, how many units, at what price, held how), the person has a file with every filing they have made, and you can follow them so their next filing lands on your overview.",
    partner: { page: "partner-insider.html", concept: "03", title: "An Insider Bought Units. What Does That Actually Prove?", sub: "A filing-first short-form story that separates a reported transaction from a claim about future price moves.", questions: ["Is transaction code P a genuine purchase, rather than a compensation grant or option exercise?", "What do ownership form and footnotes say about who holds the units?", "Could multiple filings, compensation details, or liquidity context change the interpretation?"], preparedFor: "Prepared as a partnership example for Future Investing / market-news creators", hook: "“The SEC says an executive purchased these units. Here's what everyone skips when they call it an insider signal.”" }
  },
  {
    slug: "newmont-2025-annual-report",
    kind: "Mining research",
    form: "Form 10-K",
    tickers: ["NEM"],
    company: "Newmont Corporation",
    issuerCik: "1164727",
    people: [],
    cardFigures: [0, 2, 3],
    filed: "2026-02-19",
    period: "Fiscal year ended December 31, 2025",
    title: "Newmont produced less gold in 2025 and sold more dollars of it. The 10-K explains how.",
    short: "The details behind a gold-mining headline",
    description: "Newmont's 2025 10-K: sales up 21% while consolidated gold production fell 15.5%. The realized gold price, costs per ounce and divestitures, from the filing.",
    lede: "Newmont's 2025 annual report shows sales of $22,669 million, up from $18,682 million in 2024, and net income from continuing operations attributable to stockholders of $7,085 million, more than double the year before. The same report shows consolidated gold production falling from 6,545 thousand ounces to 5,530 thousand. The difference is price.",
    figures: [
      { label: "Sales, 2025", value: usd(NEM.sales25) + "M", note: `${usd(NEM.sales24)}M in 2024 (${pct(NEM.sales25, NEM.sales24)})`, quote: "Sales $ 22,669 $ 18,682 $ 11,812" },
      { label: "Gold sales", value: usd(NEM.gold25) + "M", note: `${usd(NEM.gold24)}M in 2024 · ${((NEM.gold25 / NEM.sales25) * 100).toFixed(0)}% of 2025 sales`, quote: "Gold $ 19,304 $ 15,746 $ 10,593" },
      { label: "Gold produced", value: int(NEM.oz25) + "k oz", note: `${int(NEM.oz24)}k oz in 2024 (${pct(NEM.oz25, NEM.oz24)}), consolidated`, quote: "Consolidated gold ounces produced (thousands) 5,530 6,545 5,401" },
      { label: "Average realized gold price", value: usd(NEM.price25) + "/oz", note: `${usd(NEM.price24)}/oz in 2024 (${pct(NEM.price25, NEM.price24)})`, quote: "Average realized price: Gold (per ounce) $ 3,498 $ 2,408 $ 1,954" },
      { label: "All-in sustaining cost, gold", value: usd(NEM.aisc25) + "/oz", note: `${usd(NEM.aisc24)}/oz in 2024 (${pct(NEM.aisc25, NEM.aisc24)}), non-GAAP`, quote: "All-in sustaining costs: (5) Gold (per ounce) $ 1,609 $ 1,516 $ 1,444" },
      { label: "Net income, continuing, to Newmont", value: usd(NEM.ni25) + "M", note: `${usd(NEM.ni24)}M in 2024`, quote: "Net income (loss) from continuing operations attributable to Newmont stockholders $ 7,085 $ 3,280 $ (2,521)" }
    ],
    sections: [
      { heading: "The headline and the ounces", paras: [
        `Sales rose ${pct(NEM.sales25, NEM.sales24)} and gold sales rose ${pct(NEM.gold25, NEM.gold24)}. Consolidated gold production moved the other way, ${pct(NEM.oz25, NEM.oz24)}. A reader who sees only the revenue line could assume the mines produced more. The filing shows they produced less.`,
        "The company's own explanation is in the discussion of results: the net increase in sales was “largely due to higher average realized gold prices partially offset by the impact from divestitures.” The report lists the sales: Telfer in the fourth quarter of 2024; CC&V, Musselwhite and Éléonore in the first quarter of 2025; Porcupine and Akyem in the second. Fewer mines produced fewer ounces."
      ] },
      { heading: "Price did the work", paras: [
        `The average realized gold price was ${usd(NEM.price25)} an ounce in 2025 against ${usd(NEM.price24)} in 2024, ${pct(NEM.price25, NEM.price24)}. That is a number Newmont does not control. All-in sustaining cost, the non-GAAP measure Newmont reports on the World Gold Council definition, rose ${pct(NEM.aisc25, NEM.aisc24)} to ${usd(NEM.aisc25)} an ounce. The margin per ounce widened because the price rose faster than the cost.`,
        "Item 1A of the same report lists the risk that runs the other way: gold, copper and other metal prices fluctuate daily and are affected by factors beyond the company's control."
      ] },
      { heading: "What to read next in the filing", list: [
        "Item 1A, risk factors: commodity prices, reserves, operating and jurisdiction risks.",
        "Proven and probable reserves: 118.2 million attributable ounces of gold at December 31, 2025, and how they compare with the year before.",
        "The divestiture notes, to separate sites sold from performance at the sites kept.",
        "The non-GAAP reconciliation, to see what is and is not inside all-in sustaining cost."
      ] }
    ],
    questions: [
      "How much of the revenue change came from price, and how much from volume?",
      "Which mines were sold, and what did they produce before the sale?",
      "Are costs per ounce rising or falling, and on which measure?",
      "What does the company say could reverse the result?"
    ],
    sources: [
      { label: "Newmont 2025 Form 10-K (the document)", url: "https://www.sec.gov/Archives/edgar/data/1164727/000116472726000010/nem-20251231.htm", primary: true },
      { label: "Filing index, accession 0001164727-26-000010", url: "https://www.sec.gov/Archives/edgar/data/1164727/000116472726000010/0001164727-26-000010-index.html" },
      { label: "Newmont's filings on EDGAR", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001164727&type=10-K&dateb=&owner=include&count=40" }
    ],
    inInsidir: "In Insidir, a company report puts the XBRL financials as filed (sales, costs and income by year) next to the filing list, 8-K announcements and the Form 4s of the people who run the company, each linked to the document on sec.gov.",
    partner: { page: "partner-mining.html", concept: "01", title: "Newmont: The Annual Report Behind a Gold-Mining Story", sub: "The audience already understands mining headlines. This briefing shows how to ground a gold-sector discussion in the issuer’s own filing.", questions: ["What portion of 2025 reported sales came from gold compared with copper and other metals?", "How did gold-sales figures change from 2024 to 2025, and why is that not the same as production growth?", "What commodity-price, mine-planning and reserve-replacement risks does management highlight?"], preparedFor: "Prepared as a partnership example for Mining Stock Education", hook: "“A gold miner’s revenue rose—but here's what its SEC filing says you still have to check.”" }
  },
  {
    slug: "berkshire-hathaway-2025-annual-report",
    kind: "Company fundamentals",
    form: "Form 10-K",
    tickers: ["BRK-B", "BRK-A"],
    company: "Berkshire Hathaway Inc.",
    issuerCik: "1067983",
    people: [],
    filed: "2026-03-02",
    period: "Fiscal year ended December 31, 2025",
    title: "Berkshire's 2025 earnings fell by a quarter. Most of the change was not the businesses.",
    short: "One company, many businesses, one misleading multiple",
    description: "Berkshire Hathaway's 2025 10-K: net earnings fell from $88,995M to $66,968M, mostly on investment gains. The operating businesses, line by line, from the filing.",
    lede: "Berkshire Hathaway reported net earnings attributable to shareholders of $66,968 million for 2025, down from $88,995 million. Divide the share price by that number and you get one multiple. The 10-K itself breaks the total into insurance, a railroad, an energy company, manufacturing and retail, and investment gains, and says the gains are generally meaningless for judging a single year.",
    figures: [
      { label: "Net earnings to shareholders", value: usd(BRK.net25) + "M", note: `${usd(BRK.net24)}M in 2024 (${pct(BRK.net25, BRK.net24)})`, quote: "Net earnings attributable to Berkshire shareholders $ 66,968 $ 88,995 $ 96,223" },
      { label: "Investment gains (after tax)", value: usd(BRK.gains25) + "M", note: `${usd(BRK.gains24)}M in 2024`, quote: "Investment gains (losses) 30,737 41,558 58,873" },
      { label: "Impairment: Kraft Heinz, Occidental", value: "−" + usd(BRK.impairment25) + "M", note: "Other-than-temporary, 2025 only", quote: "Other-than-temporary impairment of investments in Kraft Heinz and Occidental (8,255 )" },
      { label: "Operating lines, total", value: usd(BRK.ops25) + "M", note: `${usd(BRK.ops24)}M in 2024 (${pct(BRK.ops25, BRK.ops24)}) · Insidir arithmetic: the six non-investment lines`, calc: () => usd(BRK.ops25) + "M" },
      { label: "Insurance float", value: "$176B", note: "$171 billion a year earlier", quote: "Float was approximately $176 billion at December 31, 2025, $171 billion at December 31, 2024" },
      { label: "People employed", value: "387,800", note: "Approximately, at the end of 2025", quote: "employed approximately 387,800 people worldwide at the end of 2025" }
    ],
    cardFigures: [0, 3, 1],
    table: {
      caption: "Net earnings attributable to Berkshire shareholders, after tax, in millions, as filed",
      rows: [...Object.keys(BRK.lines25).map(k => [k, BRK.lines25[k], BRK.lines24[k]]),
        ["Investment gains (losses)", BRK.gains25, BRK.gains24],
        ["Impairment of Kraft Heinz and Occidental", -BRK.impairment25, 0]],
      total: ["Net earnings attributable to Berkshire shareholders", BRK.net25, BRK.net24]
    },
    sections: [
      { heading: "Where the quarter went", paras: [
        `Net earnings fell ${pct(BRK.net25, BRK.net24)}. Investment gains alone were ${usd(BRK.gains24 - BRK.gains25)} million lower than in 2024, and 2025 carried an ${usd(BRK.impairment25)} million impairment of the Kraft Heinz and Occidental investments that 2024 did not. Together that is ${usd(BRK.gains24 - BRK.gains25 + BRK.impairment25)} million of a ${usd(BRK.net24 - BRK.net25)} million decline.`,
        `The six other lines in the same table (underwriting, investment income, BNSF, Berkshire Hathaway Energy, manufacturing, service and retailing, and other) add up to ${usd(BRK.ops25)} million against ${usd(BRK.ops24)} million: ${pct(BRK.ops25, BRK.ops24)}. That sum is Insidir's arithmetic on the filed table, not a figure the company reports.`
      ] },
      { heading: "What the company says about its own gains", paras: [
        "The 10-K is direct about it: “We believe that investment gains and losses, whether realized from dispositions or unrealized from changes in market prices and exchange rates, are generally meaningless in understanding our reported periodic results or evaluating our periodic economic performance.”",
        "That is why a price-to-earnings ratio on Berkshire's reported net earnings moves with the stock market as much as with the businesses. It is one number standing in for very different ones."
      ] },
      { heading: "Many businesses behind one ticker", list: [
        "Insurance: underwriting profit and investment income are reported separately, and the float (about $176 billion) is money held for policyholders that Berkshire invests.",
        "BNSF: a freight railroad with about 35,000 employees at the end of 2025.",
        "Berkshire Hathaway Energy: a holding company whose domestic regulated energy interests include four regulated U.S. utility companies.",
        "Manufacturing, service and retailing: the largest operating line in 2025, at $13,647 million after tax."
      ] }
    ],
    questions: [
      "Which part of reported earnings comes from operations, and which from market prices?",
      "Which businesses are regulated, and how does that change what their earnings mean?",
      "What does the segment note (Note 26) show that a single multiple hides?",
      "How did each line move, not just the total?"
    ],
    sources: [
      { label: "Berkshire Hathaway 2025 Form 10-K (the document)", url: "https://www.sec.gov/Archives/edgar/data/1067983/000119312526083899/brka-20251231.htm", primary: true },
      { label: "Filing index, accession 0001193125-26-083899", url: "https://www.sec.gov/Archives/edgar/data/1067983/000119312526083899/0001193125-26-083899-index.html" },
      { label: "Berkshire Hathaway's filings on EDGAR", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001067983&type=10-K&dateb=&owner=include&count=40" }
    ],
    inInsidir: "In Insidir, a company report shows the financials as the company filed them in XBRL, year by year, with the form and period on every value, beside the full filing list and the insiders' Form 4s.",
    partner: { page: "partner-value.html", concept: "02", title: "Berkshire Hathaway: Reading the Business, Not Just the Ticker", sub: "A research-led video or newsletter issue focused on how a diversified business should be analyzed from the primary filings.", questions: ["Why does the filing separate insurance and other operations from railroad, utilities and energy?", "Which businesses are regulated, and why does that matter for estimating future cash flows?", "What do the segment and risk disclosures tell you that a headline valuation multiple doesn't?"], preparedFor: "Prepared as a partnership example for Sikand Media / value-investing creators", hook: "“One ticker, completely different businesses: how to research Berkshire without getting fooled by a single multiple.”" }
  }
]);

/* Extra quotes the story text relies on (beyond the figures), re-read from sec.gov by scripts/verify-stories.mjs. */
export const SUPPORTING_QUOTES = Object.freeze({
  "enterprise-products-insider-purchase": [
    "TEAGUE AJ", "ENTERPRISE PRODUCTS PARTNERS L.P. [ EPD ]", "X Director", "CO-CHIEF EXECUTIVE OFFICER", "41,155 I By Spouse", "6,060 I By Minor Children",
    "Represents the weighted average purchase price", "were purchased at various prices ranging from $37.545 to $37.5495", "Attorney-in-Fact on Behalf of A. James Teague"
  ],
  "newmont-2025-annual-report": [
    "a net increase in Sales largely due to higher average realized gold prices partially offset by the impact from divestitures",
    "attributable proven and probable gold reserves of 118.2 million ounces", "the sale of the CC&V, Musselwhite, and Éléonore reportable segments in the first quarter of 2025", "the sale of the assets of the Telfer reportable segment in the fourth quarter of 2024", "the sale of the Porcupine and Akyem reportable segments in the second quarter of 2025", "World Gold Council", "which fluctuate on a daily basis and are affected by numerous factors beyond our control"
  ],
  "berkshire-hathaway-2025-annual-report": [
    "We believe that investment gains and losses, whether realized from dispositions or unrealized from changes in market prices and exchange rates, are generally meaningless in understanding our reported periodic results or evaluating our periodic economic performance.",
    "Insurance – underwriting $ 7,258 $ 9,020", "Insurance – investment income 12,513 13,670", "BNSF 5,476 5,031", "Berkshire Hathaway Energy (“BHE”) 3,979 3,730",
    "Manufacturing, service and retailing 13,647 13,072", "Other 1,613 2,914", "domestic regulated energy interests are comprised of four regulated U.S. utility companies", "BNSF Railway had approximately 35,000 employees at the end of 2025"
  ]
});

export const storyPath = story => "/stories/" + story.slug + ".html";
export const PUBLIC_STORY_PATHS = Object.freeze(["/stories.html", ...STORIES.map(storyPath), "/creator-kit.html", "/creators.html"]);
const bySlug = Object.fromEntries(STORIES.map(s => [s.slug, s]));
export const storyBySlug = slug => bySlug[slug] || null;
// The public insider-trading pages normalise "BRK.B" to "BRK-B"; match both spellings.
export const storiesForTicker = ticker => {
  const t = String(ticker || "").toUpperCase().replace(/\./g, "-");
  return STORIES.filter(s => s.tickers.includes(t));
};
export const storiesForPerson = cik => {
  const bare = String(cik ?? "").replace(/^0+/, "");
  return STORIES.filter(s => s.people.some(p => p.cik === bare));
};

/* ---------- the creator kit: six short-form concepts ----------
 * Each script is written to be read in 15–30 seconds (about 2.5 words a second). `record` lists what to put on
 * screen: real product clips from /assets/video, the public story page, or the filing on sec.gov. */
export const PRODUCT_CLIPS = Object.freeze([
  { id: "insidir-insiders", title: "Read insider trades", text: "A company report's insider activity: every Form 4 line in plain words, filed dates linked to SEC EDGAR." },
  { id: "insidir-people", title: "Open anyone's file", text: "A personnel file: roles, an exact record of purchases and sales, and every filing." },
  { id: "insidir-search", title: "Find any company", text: "Search a ticker and open the company report: delayed price chart, key facts, financials and filings." },
  { id: "insidir-follow", title: "Follow people, save companies", text: "Follow an insider; their next filing lands on the overview, marked New." }
]);

export const CREATOR_CONCEPTS = Object.freeze([
  {
    id: "misread-purchase", story: "enterprise-products-insider-purchase",
    title: "An insider purchase people misunderstood",
    hook: "A co-CEO just bought $100,000 of his own partnership's units. Here's the line most people skip.",
    script: "A co-CEO just bought $100,000 of his own partnership's units. Here's the line most people skip. This is the Form 4. Code P: a real purchase, 2,665 units. Now the ownership column: more than three million units he already holds. Real buying — and less than a tenth of one percent of what the form lists. The filing says what happened. Not why, and not what's next.",
    record: ["The Form 4 on sec.gov: zoom on Table I, the code P and the ownership column", "The public story page scrolling from the figures to “Read the ownership columns”", "Product clip: Read insider trades (a real Form 4 line written out in plain words)"]
  },
  {
    id: "not-a-signal", story: "enterprise-products-insider-purchase",
    title: "Why an insider purchase isn't automatically a buy signal",
    hook: "“The CEO is buying” is not the same sentence as “the stock goes up.”",
    script: "“The CEO is buying” is not the same sentence as “the stock goes up.” Here's how I check one. The code: P is a purchase; A, M, F and G are grants, option exercises, tax withholding and gifts. Direct or indirect: this one went into a trust. Size against what they already own. And what everyone else at the company filed that month. One filing is a fact, not a forecast.",
    record: ["The Form 4 on sec.gov: the transaction code column and footnote 1", "Product clip: Open anyone's file (the person's full record across filings)", "The public story page: the four questions at the end"]
  },
  {
    id: "gold-headline", story: "newmont-2025-annual-report",
    title: "The details behind a gold-mining headline",
    hook: "Newmont's profit more than doubled last year. Its mines produced less gold.",
    script: "Newmont's profit more than doubled last year. Its mines produced less gold. Both are in the same 10-K. Net income from continuing operations: $7,085 million, against $3,280 million. Gold produced: 5,530 thousand ounces, down from 6,545 thousand. What changed? The average realized gold price went from $2,408 to $3,498 an ounce, and the company sold several mines. Same headline, very different story.",
    record: ["The 10-K on sec.gov: the Results and Highlights table", "The public story page: the six figures", "Product clip: Find any company (a company report with financials as filed)"]
  },
  {
    id: "revenue-vs-business", story: "newmont-2025-annual-report",
    title: "Revenue growth versus underlying business performance",
    hook: "Sales up 21%. Production down 15%. Both from the same annual report.",
    script: "Sales up 21%. Production down 15%. Both from the same annual report. When revenue grows, ask one question: price or volume? For Newmont in 2025 it was price. Gold sold for 45% more per ounce, while cost per ounce rose about 6%. That widens the margin — and it's also the part management doesn't control. If the price turns, the same math runs backwards.",
    record: ["The 10-K on sec.gov: sales by metal and ounces produced, side by side", "The public story page: “Price did the work”", "Product clip: Find any company (financials by year as the company filed them)"]
  },
  {
    id: "berkshire-multiple", story: "berkshire-hathaway-2025-annual-report",
    title: "Why Berkshire Hathaway can't be understood from one financial multiple",
    hook: "Berkshire's earnings fell by a quarter last year. Most of that wasn't the businesses.",
    script: "Berkshire's earnings fell by a quarter last year. Most of that wasn't the businesses. Net earnings: $66,968 million, down from $88,995 million. But the 10-K splits that total: insurance, a railroad, an energy company, manufacturing and retail — and investment gains. Take out the gains and a one-time impairment, and the operating lines fell about 6%. Berkshire itself calls the gains generally meaningless for judging one year. One multiple hides all of that.",
    record: ["The 10-K on sec.gov: the table of net earnings by line in Management's Discussion and Analysis", "The public story page: the line-by-line table", "Product clip: Find any company (a company report and its filings)"]
  },
  {
    id: "three-checks", story: null,
    title: "Three things to examine when researching a public company",
    hook: "Three checks I run before I believe any stock headline.",
    script: "Three checks I run before I believe any stock headline. One: what kind of document is it? A Form 4 trade, an annual report, a press release — each proves something different. Two: what drove the number? Newmont's revenue grew on price, not ounces. Three: what's inside the total? Berkshire's earnings swing with its investments. Open the original filing every time. It's public, and it's free.",
    record: ["The three public story pages, one after another", "Each filing on sec.gov, one second each", "Product clip: Read insider trades, then Find any company"]
  }
]);

export const wordCount = text => String(text).trim().split(/\s+/).filter(Boolean).length;
export const readSeconds = text => Math.round(wordCount(text) / 2.5);
