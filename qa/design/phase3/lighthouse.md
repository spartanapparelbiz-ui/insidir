# Lighthouse (performance), production build

Lighthouse 12.8, local production build (`next start`), seeded e2e data. Targets: desktop ≥ 90, mobile ≥ 80.

| Page | Viewer | Form | Score | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| /board | member | desktop | 100 | 0.7 s | 0 ms | 0.001 |
| /board | member | mobile | 92 | 3.0 s | 130 ms | 0 |
| /board | visitor | desktop | 100 | 0.7 s | 0 ms | 0 |
| /board | visitor | mobile | 90 | 3.4 s | 90 ms | 0 |
| /copies/yours | member | desktop | 100 | 0.7 s | 0 ms | 0 |
| /copies/yours | member | mobile | 90 | 3.3 s | 140 ms | 0 |
| /election | visitor | desktop | 100 | 0.7 s | 0 ms | 0 |
| /election | visitor | mobile | 93 | 2.7 s | 160 ms | 0 |
| /go?step=paywall | visitor | desktop | 100 | 0.7 s | 0 ms | 0 |
| /go?step=paywall | visitor | mobile | 91 | 3.3 s | 70 ms | 0 |
| / | member | desktop | 100 | 0.7 s | 0 ms | 0.001 |
| / | member | mobile | 92 | 3.1 s | 80 ms | 0.001 |
| / | visitor | desktop | 100 | 0.5 s | 0 ms | 0 |
| / | visitor | mobile | 92 | 3.1 s | 80 ms | 0 |
| /market/0xe2emarket1 | member | desktop | 99 | 0.8 s | 20 ms | 0 |
| /market/0xe2emarket1 | member | mobile | 98 | 2.4 s | 50 ms | 0 |
| /markets | visitor | desktop | 100 | 0.7 s | 0 ms | 0 |
| /markets | visitor | mobile | 99 | 1.8 s | 70 ms | 0 |
| /p/0xe2e00000000000000000000000000000000000aa | member | desktop | 100 | 0.7 s | 0 ms | 0 |
| /p/0xe2e00000000000000000000000000000000000aa | member | mobile | 89 | 3.4 s | 140 ms | 0 |
| /settings | member | desktop | 100 | 0.7 s | 0 ms | 0.001 |
| /settings | member | mobile | 92 | 2.9 s | 160 ms | 0.004 |
| /wallets | member | desktop | 100 | 0.7 s | 0 ms | 0 |
| /wallets | member | mobile | 92 | 3.2 s | 60 ms | 0 |
