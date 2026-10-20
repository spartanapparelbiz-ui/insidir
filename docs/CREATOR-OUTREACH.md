# Creator outreach playbook

Who to approach for the Insidir creator partner program, how to qualify them, and what to send. The offer and the operational rules live in [CREATORS.md](../CREATORS.md); this file is the sales side of it. Nothing here changes those rules: no code is activated before a creator agrees in writing, every promotion carries a disclosure, and payouts follow the 30-day review.

## The offer, in one breath

$10 one-time for each new subscriber who signs up through the creator's link and pays their first $39 month (new subscribers start with a 3-day trial for $1; the $10 is earned when the first $39 payment goes through). No upfront fee, no per-view payments. Commissions are paid after a 30-day review for refunds, disputes and self-referrals.

Be straight about the size: $10 on a $39 product is modest. The pitch works for creators whose audience already talks about insider buying and SEC filings, because Insidir is a tool they would use on camera anyway. It does not work as a paid-placement substitute, so do not pitch it as one.

## Ideal creator profile

### Must have (all four)

| Criterion | Why |
|---|---|
| Audience of self-directed US stock investors | Insidir covers SEC registrants only. Crypto-only, forex-only or non-US audiences will not convert. |
| Content that already uses filings, insider trades or fundamentals | The product shows up naturally in their work: "here is the Form 4", "here is the 10-K figure". |
| No investment-advice or signal-selling business | Insidir is not a broker and gives no advice. A "copy my trades" or paid-signals creator puts the brand next to claims it cannot make. |
| Discloses sponsorships already, or agrees to | Required by the FTC and by CREATORS.md. A creator who refuses disclosure is a no. |

### Strong signals

- Recurring formats that need data: weekly "insiders are buying" roundups, earnings breakdowns, company deep dives, "reading a 10-K" explainers.
- Comments asking "where do you get this data?" or "what tool is that?"
- Already shows EDGAR, OpenInsider, Finviz or similar on screen.
- Engagement over size: an engaged 5k–100k audience beats a passive 1M one at this commission.
- Posts on a platform where a link in bio, description or newsletter is normal (YouTube descriptions, Substack, X, Instagram link in bio, TikTok link in bio).

### Disqualify

- Promises returns, "guaranteed" picks, options lotto plays as a lifestyle.
- Pump-adjacent small-cap or penny-stock promotion.
- Undisclosed sponsorships in recent posts.
- Audience mostly under 18 or outside the US.

### Segments, in priority order

1. **Insider-trading and SEC-filing creators.** Exact fit; the product is their topic.
2. **Fundamentals and deep-dive creators** (value investing, "how to read a 10-K", earnings breakdowns). They use company reports, financials and filings.
3. **Finance newsletter writers** (Substack, beehiiv). Written research with links converts well and the disclosure is simple.
4. **Finance educators** teaching beginners to research a company. Fits the research journal and people pages; lower intent, larger reach.

## Qualifying a creator (score out of 10)

| Factor | 0 | 1 | 2 |
|---|---|---|---|
| Topic fit | Unrelated | General investing | Filings, insiders or fundamentals |
| Audience | Non-US or crypto-only | Mixed | US stock investors |
| Engagement | Low or bought | Steady | Active comments asking about data and tools |
| Trust | Hype, advice selling or undisclosed ads | Neutral | Careful, discloses, shows sources |
| Link habit | Never links tools | Sometimes | Regularly links tools or resources |

Contact 8–10 first, 6–7 if the list is thin, skip 5 or below. Record the score with the creator in your tracker.

`/sales qualify <url>` and `/sales research <url>` can draft a first pass from a creator's site or channel; check it by watching two or three recent posts yourself.

## Outreach sequence

Personalise the first line every time: one specific post, what was in it, and why Insidir fits it. If you cannot write that line honestly, the creator is not a fit.

### Touch 1: first message (DM or email)

> **Subject:** The Form 4s in your [video/post] on [company]
>
> Hi [name],
>
> Your [post] on [company]'s insider buying was one of the few that showed the actual Form 4 instead of a screenshot of someone else's chart.
>
> I run Insidir (insidir.com). It reads SEC filings straight from EDGAR: company reports, XBRL financials, Form 4 insider trades parsed from the filed XML, and the people behind them, with every figure linked to its source document. No AI summaries, no price predictions, no advice.
>
> We have a small creator program: $10 for each new subscriber who joins through your link and stays past the trial (it is $1 for 3 days, then $39 a month). No obligation to post on a schedule, and it only makes sense if you would actually use the tool.
>
> Happy to set you up with access so you can try it on your next [company] breakdown first. Interested?
>
> [your name]
> Insidir · Aethric LLC

Keep it under 150 words. No attachments on first contact.

### Touch 2: follow-up, 4–5 days later

> Hi [name], following up once on Insidir. One thing that may be useful for your [format]: each person who files a Form 4 has their own page with every trade they have reported, so "what else has this CEO sold?" is one click. If it is not a fit, no worries. Just say so and I will not follow up again.

### Touch 3: last note, 7–10 days after touch 2

> Last one from me. If you ever cover insider activity again and want a source you can link, the offer stands: $10 per paid subscriber through your link. All the best with the channel.

Then stop. Three touches, no more.

### When they say yes

1. Send the terms in writing: $10 one-time per new paid subscriber after the first $39 payment, paid after a 30-day review, no payment per view, disclosure required. The founder sets payout method and tax forms in that agreement before anything is paid (CREATORS.md).
2. Get their written agreement to the terms and to disclosure.
3. Create the approved partner (`POST /v1/creators/admin/partners`, see CREATORS.md) and send their link: `https://insidir.com/signup.html?ref=<code>`.
4. If you give them complimentary access to try the product, say so in the agreement: the access is itself a material connection and must be disclosed too.
5. Send a short brief (below).

### Creator brief (send after agreement)

- **What Insidir is:** SEC-sourced company research. Company reports, filings, Form 4 insider activity, people, watchlist and alerts, research journal. 3 days for $1, then $39 a month, cancel any time. Today's insider trades are free to read at insidir.com/insider-trading.
- **Say:** "reads SEC filings from EDGAR", "every figure links to the original document", "insider purchases kept apart from awards and exercises", "delayed prices".
- **Never say:** that Insidir predicts prices, gives advice or signals, has live prices, has a free trial or free tier (the trial costs $1), or that following insiders makes money. Do not show returns.
- **Disclosure:** clear and up front, in the post or video itself, not only in a link page. For example: "Paid partnership: I earn $10 if you subscribe to Insidir through my link." If you got free access, say that too.
- **Link:** your `?ref=` link. It is remembered for 30 days in most browsers.

## Objections

| They say | Answer honestly |
|---|---|
| "$10 is low." | It is. It suits creators who would use the tool anyway; it is not meant to buy a dedicated post. If they only do paid placements, thank them and stop. |
| "I only do flat-fee sponsorships." | The program is commission-only today. Note their rate in the tracker in case that changes; do not improvise a fee. |
| "Is there a free trial for my audience?" | Not free, but close: 3 days of everything for $1, then $39 a month, cancel any time. The public insider-trade pages at insidir.com/insider-trading are free to read and a good thing to link. |
| "Why not just use EDGAR or OpenInsider?" | EDGAR is the source, and Insidir links back to it. What it adds is the reading: Form 4 XML parsed into plain transactions, open-market trades kept apart from awards and exercises, a page per insider, XBRL financials as filed, and a watchlist with alerts. |
| "Does it tell people what to buy?" | No. It is not a broker and gives no advice, which also keeps the creator clear of advice claims. |
| "Can I use my own code on my own account?" | No. Self-referrals are not paid. |
| "When do I get paid?" | After the subscriber's first payment clears a 30-day review for refunds, disputes and self-referral, by the method in your written agreement. |

## Tracker

Keep one row per creator (a spreadsheet is enough):

| Field | Values |
|---|---|
| Creator, platform, handle, link | |
| Segment | 1–4 above |
| Score | 0–10 |
| Personal first line used | the specific post you referenced |
| Touch 1 / 2 / 3 dates | |
| Status | not contacted · contacted · replied · agreed · code active · declined · no reply |
| Terms agreed on | date, where the written agreement lives |
| Code | the `?ref=` code once active |
| Notes | objections, rates quoted, follow-up dates |

Paid-subscriber counts and commissions come from `GET /v1/creators/admin/commissions`, not from the tracker.

## Using the sales skills for this

| Task | Command |
|---|---|
| Refine this profile with your own list | `/sales icp` with a description of the creators you already like |
| First pass on one creator | `/sales research <url>` then `/sales qualify <url>` |
| Variants of the messages above | `/sales outreach <creator>`, `/sales followup <creator>` |
| New objections | `/sales objections <what they said>` |

Check anything a skill drafts against the brief above before sending: no claims about returns, advice, live prices or a free trial.
