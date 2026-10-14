import test from "node:test";
import assert from "node:assert/strict";
import { parseOwnerIssuers } from "../src/insiders.mjs";
import { allowedSecUrl } from "../src/sec.mjs";

test("owner page issuers are parsed newest first with current names", () => {
  const html = `<table><tr><td valign='top'><a href="/cgi-bin/own-disp?action=getissuer&amp;CIK=0001045810">NVIDIA CORP</a></td>
<td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001045810">0001045810</a></td>
<td>2026-07-13</td>
<td>director</td>
</tr>
<tr><td valign='top'>VISA INC.<br />Current Name:<a href="/cgi-bin/own-disp?action=getissuer&amp;CIK=0001403161">Visa Inc.</a></td>
<td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001403161">0001403161</a></td>
<td>2011-11-05</td>
<td>director</td>
</tr>
<tr><td valign='top'><a href="/cgi-bin/own-disp?action=getissuer&amp;CIK=0000886982">GOLDMAN SACHS GROUP INC</a></td>
<td><a href="/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0000886982">0000886982</a></td>
<td>2004-11-26</td>
<td>officer: Vice Chairman of the Corp.</td>
</tr></table>`;
  const list = parseOwnerIssuers(html);
  assert.deepEqual(list.map(x => x.cik), ["0001045810", "0001403161", "0000886982"]);
  assert.equal(list[1].name, "Visa Inc.");
  assert.equal(list[2].relation, "officer: Vice Chairman of the Corp.");
  assert.deepEqual(parseOwnerIssuers("<html>no table</html>"), []);
});

test("the SEC allowlist admits the owner page but not other cgi scripts", () => {
  assert.equal(allowedSecUrl("https://www.sec.gov/cgi-bin/own-disp?action=getowner&CIK=0001310264"), true);
  assert.equal(allowedSecUrl("https://www.sec.gov/cgi-bin/srqsb?text=x"), false);
});
