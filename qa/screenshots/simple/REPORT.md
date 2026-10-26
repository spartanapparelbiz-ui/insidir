# Simple view: the 5-second test and reading level

Every page at 390x844, against the e2e build (seeded test data, so deal titles read "E2E fixture: …").
Regenerate: `E2E_APP_DIR=… npx tsx qa/e2e/serve.ts &`, then `npx tsx qa/simple-shots.ts` and `python3 qa/readability.py`.

## The 5-second rule

For each first screen (`*-390.png`): the one sentence a stranger would take away, and whether that is the page's job.

| Page | What a stranger takes away in 5 seconds | Page's real purpose? |
|---|---|---|
| 01 Landing | "Two apps price the same game differently: buy both for 95¢, get $1 back. Tap to see today's deals." | Yes |
| 02 Terminal, first visit | "Two apps sell the same bet, sometimes at different prices; buy both sides and keep the gap." | Yes (shown once, then the deals) |
| 03 Terminal, free | "Here are today's price gaps: put in $95, get $100 back, keep $2.01. Free ones are 30 minutes late." | Yes |
| 04 Terminal, member | "Here are today's price gaps, live, each with what I put in, get back and keep." | Yes |
| 05 Show me how | "Type an amount, then do these steps: buy YES on Kalshi, buy NO on Polymarket, done." | Yes |
| 06 Show me how, $250 | "At my amount I spend $120 + $115 and keep about $7.52; the deal only goes to $235." | Yes |
| 07 "?" opened | "You keep = what's left after both apps take their fees." | Yes |
| 08 Deal page, member | "This deal: put in $94, get $100 back, keep $3.01; here's how to do it." | Yes |
| 09 Deal page, free | "Same deal, same steps; how big it goes is for members." | Yes |
| 10 Terminal, Pro view | "A dense list of deals with dollars kept, percent, size and timing." | Yes (power users, opt-in) |
| 11 Past deals | "Every deal they found this week and how each one ended." | Yes |
| 12 Pricing | "Free, or Insidir for $1 for 3 days then $39/mo, or Pro for $99/mo." | Yes |
| 13 Settings | "Where I am, which apps I use, and which deals I want to see." | Yes |
| 14 Big bets (Pro) | "The biggest bets people are placing right now." | Yes |
| 15 My results (Pro) | "Upload my Kalshi file to see how I did." | Yes |
| 16 Terms, 17 Privacy | "The legal terms" / "What they do with my data." | Yes (legal text, not Simple view) |

What the test caught and fixed along the way:
- "Show me how" opened the deal page instead of the walkthrough sheet (the link handled the tap before the list could).
- A "?" could wrap onto a line by itself; each now sticks to its word.
- Past-deal rows on phones showed a bare "Yes" and "2.0%" with no label; they now read "Same rules? Yes" and "You make 2.0%".
- The Pro view's phone rows overlapped after the new "Pays out" and "Same rules?" labels; now four clean lines.
- "30 min delay" was repeated on every free card; it is now said once at the top.

## Reading level (Flesch-Kincaid grade)

Two scores per page: all visible text (each line on screen is one unit), and only the real sentences (lines of six
words or more) so short labels can't pull the score down. A page passes when both are at or under grade 6.

| Page | All text | Sentences only | First screen | Words |
|---|---:|---:|---:|---:|
| 01 Landing | 1.0 | 2.1 | 1.4 | 768 |
| 02 Terminal, first visit | 0.6 | 1.9 | 1.1 | 210 |
| 03 Terminal, free | 0.5 | 2.3 | 0.4 | 159 |
| 04 Terminal, member | 0.5 | 3.5 | 0.0 | 157 |
| 05 Show me how | 0.6 | 2.6 | 0.8 | 260 |
| 06 Show me how, $250 | 0.5 | 2.5 | 0.5 | 272 |
| 07 "?" opened | 0.4 | 3.2 | 0.0 | 167 |
| 08 Deal, member | 0.9 | 2.0 | 1.3 | 185 |
| 09 Deal, free | 0.9 | 1.8 | 0.8 | 203 |
| 11 Past deals | 0.5 | 2.5 | 0.7 | 224 |
| 12 Pricing | 1.6 | 2.2 | 1.7 | 216 |
| 13 Settings | 2.1 | 2.7 | 3.9 | 209 |
| 14 Big bets | 1.1 | 2.5 | 2.0 | 85 |
| 15 My results | 3.4 | 4.6 | 4.3 | 98 |
| 10 Pro view (not Simple) | 0.7 | 3.7 | 0.8 | 116 |
| 16 Terms (legal) | 4.4 | 5.9 | 5.2 | 483 |
| 17 Privacy (legal) | 3.8 | 5.3 | 4.7 | 375 |

**Worst Simple-view page: grade 4.6 (My results). Every Simple-view page is at grade 6 or below.**

Method: the standard Flesch-Kincaid formula with a vowel-group syllable count (`qa/readability.py`, no downloads).
Checked against known text: a dense bureaucratic sentence scores 32, "The cat sat on the mat." scores below 0.
