# Insidir automated trading: approved integration options (October 2026)

**Not authorized for live trading.** Insidir remains in its existing `RESEARCH_ONLY` mode. This is a partner evaluation, not permission to place orders. No order-creation endpoints, API tokens, or investor trading permissions may be enabled from this document.

## 1. Three viable integration paths

| Provider | Appropriate use | Technical entry point | Activation blockers |
| --- | --- | --- | --- |
| Alpaca Broker API | Broker-integrated customer onboarding, account funding, equity trading, and eventual customer-directed or supervised strategies | https://docs.alpaca.markets/us/v1.1/docs/about-broker-api | Broker approval, applicable FINRA/SEC/state legal structure, customer agreements, KYC/CIP, allocation of trading responsibility, required protections |
| Tradier Partner OAuth | Existing Tradier customer authorizes a third-party app with narrowly scoped `trade` access | https://docs.tradier.com/docs/authentication | Tradier Partner acceptance for any public app, legal review of strategy/advisory activities, order controls, revoked-token handling |
| DriveWealth BaaS | Embedded brokerage infrastructure and account lifecycle with partner compliance | https://developer.drivewealth.com/apis/docs/intro | Institutional partner onboarding and operational/compliance arrangements |

**Technical recommendation:** apply to Alpaca's Broker API program, evaluate Tradier Partner OAuth in parallel, and keep all prototypes in an isolated, non-production paper environment. Provider sandbox accounts must be authorized for the person opening the account.

## 2. Distinguish two types of product

1. **Customer-directed execution:** users independently choose stock, side, shares, order type and confirm before transmission. Requires broker approval and compliance review; it is not the same as autonomous discretionary management.
2. **Automatically generated and executed trades:** system determines action, size or timing with ongoing authority. This can be discretionary investment management and entail investment-adviser registration or a documented relationship with a properly registered and supervised adviser, plus broker and client permissions. A terms disclaimer or hosted broker API does not eliminate these obligations.

**Do not build or activate live trading without qualified securities counsel's written sign-off and broker approval.**

## 3. Authorization and risk prerequisites

- Authorized adult corporate officer for binding agreements; client accounts require broker-accepted eligible investors and identities.
- Clarify whether Insidir or a regulated partner acts as adviser, solicitor, broker, introducing party or purely technology provider.
- Registered adviser or applicable exemption and supervised compliance, where required; recordkeeping and client agreements.
- Partner-run KYC/CIP, sanctions and fraud controls; clear beneficial owner and custody responsibilities.
- Explicit, revocable customer trading authority; account suitability/fiduciary obligations as applicable.
- Idempotent order API, pre-trade limits, exposure controls, position and cash reconciliation, halt switch and audit logs.
- Security reviews, integration tests and independent monitoring for failures and unexpected execution.
- Written provider agreements and evidence of approved production scopes.
- Sandbox acceptance tests before any trade-like feature can be requested for production.

## 4. Engineering release rule

Preserve `BUILD_AUTHORIZED_MODES=[RESEARCH_ONLY]`, the `INSIDIR_TRADING_HALT` emergency stop, the existing read-only SnapTrade connection and `/v1/orders` denial. Never route watchlist alerts, AI explanations, financial news, political disclosures or social-media events into trade execution.

An authorized trading project should be a separately reviewed release with signed authorization documents and an explicit adult compliance owner. Until then Insidir's approved value proposition is **research and user-controlled decisions**.
