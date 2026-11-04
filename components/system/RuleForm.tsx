/* The Autopilot rule form: plain controls, no code. Posts to /api/autopilot (works without JavaScript). */
import { CATEGORIES } from "@/lib/brand/categories";
import { DEFAULT_SPEC, LEAGUES, type RuleSpec } from "@/lib/autopilot/rules";

const BETS = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000];
const k = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : `$${n / 1e3}K`);

export function RuleForm({ id, name = "", spec = DEFAULT_SPEC, testid = "rule-form" }: { id?: number; name?: string; spec?: RuleSpec; testid?: string }) {
  const f = `rf${id ?? "new"}`;
  return (
    <form method="post" action="/api/autopilot" className="s-form ap-form" data-testid={testid}>
      <input type="hidden" name="action" value="save" />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <label className="s-form b-small" htmlFor={`${f}-name`}>Name</label>
      <input id={`${f}-name`} name="name" className="s-input" defaultValue={name} maxLength={60} placeholder="My rule" />

      <fieldset className="s-opts"><legend className="b-label">Wallets</legend>
        <label className="s-opt"><input type="radio" name="from" value="proven" defaultChecked={spec.wallets.from === "proven"} /> Every proven wallet</label>
        <label className="s-opt"><input type="radio" name="from" value="followed" defaultChecked={spec.wallets.from === "followed"} /> Only the wallets I list</label>
      </fieldset>
      <label className="s-form b-small">Wallet addresses, one per line (for “Only the wallets I list”)
        <textarea name="follow" rows={2} className="s-input" defaultValue={spec.wallets.follow.join("\n")} placeholder="0x…" />
      </label>
      <label className="s-form b-small">At least this many settled positions
        <input type="number" name="minSettled" min={30} step={1} className="s-input" defaultValue={spec.wallets.minSettled} />
      </label>

      <fieldset className="s-opts"><legend className="b-label">Categories (none picked: all)</legend>
        {CATEGORIES.map(c => <label key={c.slug} className="s-opt"><input type="checkbox" name="categories" value={c.slug} defaultChecked={spec.markets.categories.includes(c.slug)} /> {c.name}</label>)}
      </fieldset>
      <fieldset className="s-opts"><legend className="b-label">Leagues (none picked: all)</legend>
        {LEAGUES.map(l => <label key={l.slug} className="s-opt"><input type="checkbox" name="leagues" value={l.slug} defaultChecked={spec.markets.leagues.includes(l.slug)} /> {l.name}</label>)}
      </fieldset>
      <label className="s-form b-small">Only races, teams or words (comma separated, optional)
        <input name="races" className="s-input" defaultValue={spec.markets.races.join(", ")} placeholder="Texas Senate, Lakers" />
      </label>
      <label className="s-form b-small">Never these (comma separated, optional)
        <input name="exclude" className="s-input" defaultValue={spec.markets.exclude.join(", ")} placeholder="Bitcoin" />
      </label>

      <fieldset className="s-opts"><legend className="b-label">When</legend>
        <label className="s-form b-small">Their bet is at least
          <select name="minBet" className="s-input" defaultValue={String(spec.triggers.minBet)}>
            {[...new Set([...BETS, spec.triggers.minBet])].sort((a, b) => a - b).map(v => <option key={v} value={v}>{k(v)}</option>)}
          </select>
        </label>
        <label className="s-opt"><input type="checkbox" name="firstEntry" defaultChecked={spec.triggers.firstEntry} /> Only their first entry into the market</label>
        <label className="s-opt"><input type="checkbox" name="consensus" defaultChecked={spec.triggers.consensus} /> Only when 2+ proven wallets take the same side within an hour</label>
      </fieldset>

      <fieldset className="s-opts"><legend className="b-label">Price guard</legend>
        <label className="s-form b-small">Never pay more than (¢)
          <input type="number" name="maxCents" min={2} max={99} step={1} className="s-input" defaultValue={Math.round(spec.price.max * 100)} />
        </label>
        <label className="s-form b-small">Kalshi may be at most this much above their price (¢)
          <input type="number" name="maxMoveCents" min={0} max={50} step={1} className="s-input" defaultValue={spec.price.maxMoveCents} />
        </label>
      </fieldset>

      <fieldset className="s-opts"><legend className="b-label">Stake</legend>
        <label className="s-form b-small">Per bet ($)<input type="number" name="perBet" min={1} step={1} className="s-input" defaultValue={spec.stake.perBet} /></label>
        <label className="s-form b-small">Per day, at most ($)<input type="number" name="daily" min={1} step={1} className="s-input" defaultValue={spec.stake.daily} /></label>
        <label className="s-form b-small">Per week, at most ($)<input type="number" name="weekly" min={1} step={1} className="s-input" defaultValue={spec.stake.weekly} /></label>
      </fieldset>

      <fieldset className="s-opts"><legend className="b-label">Quiet hours (matches are logged, not pushed)</legend>
        <label className="s-form b-small">From<input type="time" name="quietStart" className="s-input" defaultValue={spec.quiet.start ?? ""} /></label>
        <label className="s-form b-small">Until<input type="time" name="quietEnd" className="s-input" defaultValue={spec.quiet.end ?? ""} /></label>
      </fieldset>
      <div className="b-ctas"><button type="submit" className="b-btn b-btn-lg b-primary" data-testid={`${testid}-save`}>{id ? "Save rule" : "Add rule"}</button></div>
    </form>
  );
}
