# Regulated-mode authorization records

`src/capabilities.mjs` keeps Insidir in **RESEARCH_ONLY** mode. A regulated mode (personalized advice, or order
placement through a broker partner) can only become active when **all** of these are true:

1. The mode is added to `BUILD_AUTHORIZED_MODES` in `src/capabilities.mjs` by a reviewed code change.
2. A complete record exists here as `advisory.json` or `trading.json`, with every field in
   `REQUIRED_RECORD_FIELDS` filled in and an `effectiveDate` that has arrived.
3. The deployment asks for it with `INSIDIR_OPERATING_MODE`.

An environment variable alone never enables anything. **Do not create these files until the underlying registrations,
agreements and reviews actually exist.** A record is a statement of fact that an attorney and the responsible
compliance officer have signed off; it is not a switch.

`advisory.example.json` and `trading.example.json` show the shape. They are ignored by the code (only the exact names
`advisory.json` / `trading.json` are read).
