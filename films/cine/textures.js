// Textures built from real material: the SEC's rendering of the Form 4, the Insidir product capture,
// and newsprint / ticker tape set with the filing's own text and numbers.
import * as THREE from "three";
import { canvasTex, loadTex, rng } from "./engine.js";
const LINES = [
  "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP", "Filed pursuant to Section 16(a) of the Securities Exchange Act of 1934",
  "Name and Address of Reporting Person: STEVENS MARK A", "Issuer Name and Ticker or Trading Symbol: NVIDIA CORP [ NVDA ]", "Date of Earliest Transaction: 09/18/2026",
  "Relationship of Reporting Person to Issuer: X Director", "Common Stock 09/18/2026 S 1,356,000 D $219.7219", "Common Stock 09/18/2026 S 10,000 D $220.4199",
  "Amount of Securities Beneficially Owned Following Reported Transaction: 970,531", "Represents weighted average sales price. The shares were sold at prices",
  "ranging from $219.40 to $220.35.", "Held by the Third Millennium Trust, of which the Reporting Person and his wife are co-trustees.",
  "Held by the Envy Trust u/a/d December 7, 2021, of which the Reporting Person is trustee.", "/s/ Tina Ashcraft, Attorney-in-Fact for Mark A. Stevens 09/22/2026",
];
export async function loadTextures() {
  const form4 = await loadTex("/films/filing/form4_full.png");
  const form4b = form4.clone(); form4b.repeat.set(.55, .5); form4b.offset.set(0, .14); form4b.needsUpdate = true; // the footnotes, as a second sheet
  const screen = await loadTex("/films/cine/screen_insiders_stevens.png");
  const overview = await loadTex("/films/product2x/company_nvda.png");
  const filings = await loadTex("/films/product2x/company_nvda_filings.png");
  const r = rng(4);
  const newsprint = canvasTex(2048, 1024, (x, w, h) => {
    x.fillStyle = "#d9d5cc"; x.fillRect(0, 0, w, h); x.fillStyle = "#1b1b1a"; x.font = "600 22px Georgia, serif";
    for (let c = 0; c < 6; c++) for (let i = 0; i < 34; i++) x.fillText(LINES[(i + c * 5) % LINES.length].slice(0, 38), 30 + c * 335, 50 + i * 28);
    x.fillStyle = "rgba(0,0,0,.25)"; for (let c = 1; c < 6; c++) x.fillRect(c * 335 + 15, 30, 2, h - 60);
  });
  const folded = canvasTex(512, 384, (x, w, h) => { x.fillStyle = "#dcd8cf"; x.fillRect(0, 0, w, h); x.fillStyle = "#151515"; x.fillRect(20, 20, w - 40, 26); x.fillStyle = "rgba(20,20,20,.7)"; for (let i = 0; i < 24; i++) for (let c = 0; c < 4; c++) x.fillRect(20 + c * 120, 64 + i * 13, 70 + r() * 30, 5); });
  const tape = canvasTex(2048, 64, (x, w, h) => { x.fillStyle = "#e4e0d6"; x.fillRect(0, 0, w, h); x.fillStyle = "#151515"; x.font = "700 34px 'Courier New', monospace"; x.fillText("NVDA S 1,356,000 @219.7219   NVDA S 10,000 @220.4199   NVDA 970,531   ", 10, 44); });
  tape.colorSpace = THREE.SRGBColorSpace;
  const wood = canvasTex(1024, 1024, (x, w, h) => { x.fillStyle = "#3b3b3b"; x.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { const y = r() * h, v = 40 + r() * 30; x.strokeStyle = `rgba(${v},${v},${v},.5)`; x.lineWidth = 1 + r() * 3; x.beginPath(); x.moveTo(0, y); for (let xx = 0; xx < w; xx += 40) x.lineTo(xx, y + Math.sin(xx * .01 + i) * 6); x.stroke(); } });
  return { form4, form4b, screen, overview, filings, newsprint, folded, tape, wood };
}
