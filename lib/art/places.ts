/* Countries and public figures that markets are about, found in a market's own words. A country's art is its flag
 * (flag-icons, MIT); a figure's is their Wikidata portrait (P18) when Commons licenses it freely, else their initials.
 * Traders, the people behind Polymarket wallets, are never here: they keep their own Polymarket picture or a monogram. */

/** ISO 3166 alpha-2 (flag-icons' file name), the country's name, and how markets write it. */
export const COUNTRIES: Array<[string, string, RegExp]> = [
  ["us", "United States", /\b(united states|u\.s\.a?\.?|usa)\b/i], ["cn", "China", /\bchina\b|\bchinese\b|\bprc\b|\bbeijing\b/i], ["ru", "Russia", /\brussia/i],
  ["ua", "Ukraine", /\bukrain/i], ["il", "Israel", /\bisrael/i], ["ir", "Iran", /\biran\b|\biranian\b|\btehran\b/i], ["ps", "Palestine", /\bpalestin|\bgaza\b|\bhamas\b/i],
  ["sy", "Syria", /\bsyria/i], ["lb", "Lebanon", /\blebanon\b|\bhezbollah\b/i], ["iq", "Iraq", /\biraq/i], ["sa", "Saudi Arabia", /\bsaudi/i], ["ye", "Yemen", /\byemen|\bhouthi/i],
  ["tr", "Türkiye", /\bturkey\b|\btürkiye\b|\bturkish\b/i], ["gb", "United Kingdom", /\b(united kingdom|u\.k\.|uk|britain|british)\b/i], ["fr", "France", /\bfrance\b|\bfrench\b/i],
  ["de", "Germany", /\bgerman/i], ["it", "Italy", /\bital(y|ian)\b/i], ["es", "Spain", /\bspain\b|\bspanish\b/i], ["pl", "Poland", /\bpoland\b|\bpolish\b/i],
  ["nl", "Netherlands", /\bnetherlands\b|\bdutch\b/i], ["be", "Belgium", /\bbelgi/i], ["se", "Sweden", /\bswed/i], ["no", "Norway", /\bnorw/i], ["fi", "Finland", /\bfinland\b|\bfinnish\b/i],
  ["dk", "Denmark", /\bdenmark\b|\bdanish\b/i], ["gl", "Greenland", /\bgreenland\b/i], ["ca", "Canada", /\bcanad/i], ["mx", "Mexico", /\bmexic/i], ["br", "Brazil", /\bbrazil/i],
  ["ar", "Argentina", /\bargentin/i], ["ve", "Venezuela", /\bvenezuel/i], ["co", "Colombia", /\bcolombi/i], ["cl", "Chile", /\bchile\b|\bchilean\b/i], ["pe", "Peru", /\bperu\b/i],
  ["cu", "Cuba", /\bcuba/i], ["in", "India", /\bindia\b|\bindian\b/i], ["pk", "Pakistan", /\bpakistan/i], ["af", "Afghanistan", /\bafghan/i], ["bd", "Bangladesh", /\bbangladesh/i],
  ["jp", "Japan", /\bjapan/i], ["kr", "South Korea", /\bsouth korea/i], ["kp", "North Korea", /\bnorth korea/i], ["tw", "Taiwan", /\btaiwan/i], ["ph", "Philippines", /\bphilippin/i],
  ["vn", "Vietnam", /\bvietnam/i], ["th", "Thailand", /\bthai(land)?\b/i], ["id", "Indonesia", /\bindonesia/i], ["my", "Malaysia", /\bmalaysia/i], ["au", "Australia", /\baustralia/i],
  ["nz", "New Zealand", /\bnew zealand\b/i], ["za", "South Africa", /\bsouth africa/i], ["ng", "Nigeria", /\bnigeria/i], ["eg", "Egypt", /\begypt/i], ["et", "Ethiopia", /\bethiopia/i],
  ["sd", "Sudan", /\bsudan/i], ["ro", "Romania", /\bromania/i], ["hu", "Hungary", /\bhungar/i], ["cz", "Czechia", /\bczech/i], ["at", "Austria", /\baustria/i],
  ["ch", "Switzerland", /\bswitzerland\b|\bswiss\b/i], ["pt", "Portugal", /\bportug/i], ["gr", "Greece", /\bgreece\b|\bgreek\b/i], ["ie", "Ireland", /\bireland\b|\birish\b/i],
  ["rs", "Serbia", /\bserbia/i], ["by", "Belarus", /\bbelarus/i], ["am", "Armenia", /\barmenia/i], ["az", "Azerbaijan", /\bazerbaijan/i], ["qa", "Qatar", /\bqatar/i],
  ["ae", "United Arab Emirates", /\b(uae|united arab emirates|dubai)\b/i], ["jo", "Jordan", /\bjordan\b(?!\s+(poole|love|clarkson))/i], ["ma", "Morocco", /\bmorocc/i],
  ["ly", "Libya", /\blibya/i], ["ht", "Haiti", /\bhaiti/i], ["pa", "Panama", /\bpanama\b/i], ["ec", "Ecuador", /\becuador/i], ["bo", "Bolivia", /\bbolivia/i],
  ["sg", "Singapore", /\bsingapore/i], ["eu", "European Union", /\b(european union|\beu\b)\b/i],
];

/** Public figures markets name: id, English Wikipedia title (for their Wikidata item), name, how markets write it. */
export const FIGURES: Array<[string, string, string, RegExp]> = [
  ["donald-trump", "Donald_Trump", "Donald Trump", /\btrump\b/i], ["jd-vance", "JD_Vance", "JD Vance", /\bvance\b/i],
  ["kamala-harris", "Kamala_Harris", "Kamala Harris", /\bkamala\b/i], ["joe-biden", "Joe_Biden", "Joe Biden", /\bbiden\b/i],
  ["gavin-newsom", "Gavin_Newsom", "Gavin Newsom", /\bnewsom\b/i], ["elon-musk", "Elon_Musk", "Elon Musk", /\bmusk\b/i],
  ["jerome-powell", "Jerome_Powell", "Jerome Powell", /\bpowell\b/i], ["vladimir-putin", "Vladimir_Putin", "Vladimir Putin", /\bputin\b/i],
  ["volodymyr-zelenskyy", "Volodymyr_Zelenskyy", "Volodymyr Zelenskyy", /\bzelensk/i], ["xi-jinping", "Xi_Jinping", "Xi Jinping", /\bxi jinping\b|\bxi\b(?= (meet|visit|and|to))/i],
  ["benjamin-netanyahu", "Benjamin_Netanyahu", "Benjamin Netanyahu", /\bnetanyahu\b/i], ["emmanuel-macron", "Emmanuel_Macron", "Emmanuel Macron", /\bmacron\b/i],
  ["keir-starmer", "Keir_Starmer", "Keir Starmer", /\bstarmer\b/i], ["narendra-modi", "Narendra_Modi", "Narendra Modi", /\bmodi\b/i],
  ["javier-milei", "Javier_Milei", "Javier Milei", /\bmilei\b/i], ["zohran-mamdani", "Zohran_Mamdani", "Zohran Mamdani", /\bmamdani\b/i],
  ["andrew-cuomo", "Andrew_Cuomo", "Andrew Cuomo", /\bcuomo\b/i], ["marco-rubio", "Marco_Rubio", "Marco Rubio", /\brubio\b/i],
  ["pete-hegseth", "Pete_Hegseth", "Pete Hegseth", /\bhegseth\b/i], ["rfk-jr", "Robert_F._Kennedy_Jr.", "Robert F. Kennedy Jr.", /\brfk\b|\bkennedy jr\b/i],
  ["aoc", "Alexandria_Ocasio-Cortez", "Alexandria Ocasio-Cortez", /\bocasio|\baoc\b/i], ["josh-shapiro", "Josh_Shapiro", "Josh Shapiro", /\bjosh shapiro\b/i],
  ["mark-carney", "Mark_Carney", "Mark Carney", /\bcarney\b/i], ["friedrich-merz", "Friedrich_Merz", "Friedrich Merz", /\bmerz\b/i],
  ["giorgia-meloni", "Giorgia_Meloni", "Giorgia Meloni", /\bmeloni\b/i], ["erdogan", "Recep_Tayyip_Erdoğan", "Recep Tayyip Erdoğan", /\berdo[gğ]an\b/i],
  ["ali-khamenei", "Ali_Khamenei", "Ali Khamenei", /\bkhamenei\b/i], ["kim-jong-un", "Kim_Jong_Un", "Kim Jong Un", /\bkim jong/i],
  ["sam-altman", "Sam_Altman", "Sam Altman", /\baltman\b/i], ["mark-zuckerberg", "Mark_Zuckerberg", "Mark Zuckerberg", /\bzuckerberg\b/i],
  ["taylor-swift", "Taylor_Swift", "Taylor Swift", /\btaylor swift\b/i], ["pope-leo-xiv", "Pope_Leo_XIV", "Pope Leo XIV", /\bpope leo\b/i],
];

/** The one country or figure a market's words name (two or more: none, the art would be a guess). */
export function countryIn(text: string): string | null {
  const hits = COUNTRIES.filter(([, , re]) => re.test(text));
  return hits.length === 1 ? hits[0]![0] : null;
}
export function figureIn(text: string): string | null {
  const hits = FIGURES.filter(([, , , re]) => re.test(text));
  return hits.length === 1 ? hits[0]![0] : null;
}
