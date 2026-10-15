// Real data only: NVIDIA Form 4 filings from SEC EDGAR (via Insidir's insider endpoint, retrieved 2026-10-15)
// and coordinates inside the captured documents. Nothing here is invented.
"use strict";
// Split-flap lines: ticker, form, trade date, reporting person, code, shares (from the filings as filed).
const FLAP_LINES = [
  "NVDA 4 09/18 STEVENS S -1366000",
  "NVDA 4 09/21 TETER   S   -30460",
  "NVDA 4 09/17 KRESS   S   -34918",
  "NVDA 4 09/17 HUANG   F  -483728",
  "NVDA 4 10/07 COXE    G  -500000",
  "NVDA 4 09/04 STEVENS S -1022239",
];
const TAPE_TEXT = "NVDA  FORM 4  09/18/2026  S  1,356,000  D  $219.7219    NVDA  S  10,000  D  $220.4199    NVDA  FORM 4  09/21/2026  S  30,460    NVDA  FORM 4  09/17/2026  S  34,918    ";
const TAPE_TEXT_B = "STEVENS MARK A  DIRECTOR  NVIDIA CORP [NVDA]  COMMON STOCK  970,531 FOLLOWING  BY TRUST    ";
// Text lines from the filing itself and Form 4's printed instructions, for the newsprint web.
const PRESS_LINES = [
  "UNITED STATES SECURITIES AND EXCHANGE COMMISSION", "Washington, D.C. 20549", "STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP",
  "Filed pursuant to Section 16(a) of the Securities", "Exchange Act of 1934 or Section 30(h) of the", "Investment Company Act of 1940",
  "1. Name and Address of Reporting Person", "STEVENS MARK A  C/O NVIDIA CORPORATION", "2788 SAN TOMAS EXPRESSWAY  SANTA CLARA CA 95051",
  "2. Issuer Name and Ticker or Trading Symbol", "NVIDIA CORP [ NVDA ]", "3. Date of Earliest Transaction 09/18/2026",
  "5. Relationship of Reporting Person(s) to Issuer", "X Director", "Table I - Non-Derivative Securities Acquired,", "Disposed of, or Beneficially Owned",
  "Common Stock 09/18/2026 S 1,356,000 D $219.7219", "Common Stock 09/18/2026 S 10,000 D $220.4199", "Common Stock 11,544,612 D", "Common Stock 15,017,750 I By the Envy Trust",
  "1. Represents weighted average sales price.", "The shares were sold at prices ranging", "from $219.40 to $220.35.", "2. Held by the Third Millennium Trust, of which",
  "the Reporting Person and his wife are co-trustees.", "4. Held by the Envy Trust u/a/d December 7, 2021,", "of which the Reporting Person is trustee.",
  "/s/ Tina Ashcraft, Attorney-in-Fact for", "Mark A. Stevens 09/22/2026", "Persons who respond to the collection of", "information contained in this form are not",
  "required to respond unless the form displays", "a currently valid OMB Number.", "OMB Number: 3235-0287",
];
// Form 4 (form4_full.png, 3840x3021): image-pixel coordinates of the fields the films read.
const F4 = {
  w: 3840, h: 3021,
  title: [1941, 253], formLabel: [422, 119],
  name: [255, 685], nameX: [52, 461],
  issuer: [1607, 666], issuerX: [1367, 1849],
  director: [2850, 707], directorX: [2776, 707],
  earliest: [1455, 851],
  tableI: [1920, 1273],
  colAmountHead: [2438, 1354], colOwnedHead: [3014, 1382],
  row1: 1528, row2: 1607, row3: 1684, row4: 1786,
  rowX: [42, 3800],
  date1: [1463, 1528], code1: [1912, 1528], amount1: [2248, 1528], amountX: [2112, 2390], price1: [2688, 1528], priceX: [2596, 2794],
  owned1: [3011, 1528], indirect1: [3383, 1528], trust1: [3644, 1528],
  amount2: [2248, 1607], price2: [2688, 1607], owned2: [3011, 1607],
  fn1: 2346, fn1b: 2379, fn1RangeX: [998, 1306], fnX: [33, 3792],
  fn2: 2425, fn2X: [33, 1219], fn3: 2471, fn4: 2515,
  signature: [2663, 2665], signatureX: [2300, 3030], signDate: [3147, 2669],
};
// Insidir company report, Insider activity tab, captured at 2x (company_nvda_insiders_full.png, 3840x6318).
const PI = { w: 3840, h: 6318, stevensY: 2956, stevensShares: [2457, 2956], stevensName: [498, 2930], rowX: [320, 3500], tableTop: 2100 };
