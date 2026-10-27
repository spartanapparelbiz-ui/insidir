"use client";
/* The Account page's client parts: Filters, Region (with the venues that follow it) and the Cancel button. Every
 * change saves itself (components/account/fields.tsx). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { CATEGORIES, CATEGORY_LABEL, checkRoiPct, checkUsd } from "@/app/api/settings/validate";
import type { UserSettings } from "@/lib/db/schema";
import type { Region, Venue } from "@/lib/types";
import { Categories, Choice, Field, Toggle, useSaveSettings } from "./fields";

const pct = (v: number): string => String(Math.round(v * 10_000) / 100);
export const CATEGORY_OPTIONS = CATEGORIES.map(c => ({ value: c as string, label: CATEGORY_LABEL[c] }));

export function FiltersForm({ settings }: { settings: UserSettings }) {
  const save = useSaveSettings();
  return (
    <div className="agroup__body">
      <div className="afields2">
        <Field name="minRoiPct" label="Lowest return" suffix="%" value={pct(settings.minRoi)} check={checkRoiPct} save={save} hint="Hide deals below this return." />
        <Field name="minSizeUsd" label="Smallest size" suffix="$" value={String(settings.minSizeUsd)} check={checkUsd} save={save} hint="Hide deals you can't put this much into." />
      </div>
      <Categories name="categories" legend="Categories in your feed" hint="Leave them all off to see every category." options={CATEGORY_OPTIONS} value={settings.categories} save={save} />
      <Toggle name="showYellow" label="Show “Check rules” deals" hint="Small differences in the rules. Read both before you buy." checked={settings.showYellow} save={save} />
      <Toggle name="showRed" label="Show “Skip” deals" hint="The rules differ, so both sides could lose." checked={settings.showRed} save={save} />
    </div>
  );
}

export function RegionForm({ region, venues }: { region: Region | null; venues: Venue[] }) {
  const save = useSaveSettings();
  const [reg, setReg] = useState<Region>(region ?? "us");
  const [kalshi, setKalshi] = useState(venues.includes("kalshi"));
  const [poly, setPoly] = useState(venues.includes(region === "non_us" ? "polymarket" : "polymarket_us"));
  const polyVenue = (r: Region): Venue => (r === "us" ? "polymarket_us" : "polymarket");
  const chosen = (r: Region, k: boolean, p: boolean): Venue[] => [...(k ? ["kalshi" as const] : []), ...(p ? [polyVenue(r)] : [])];
  const setVenue = async (which: "kalshi" | "poly", on: boolean) => {
    const k = which === "kalshi" ? on : kalshi, p = which === "poly" ? on : poly;
    if (!k && !p) return;
    which === "kalshi" ? setKalshi(on) : setPoly(on);
    if (!(await save({ venues: chosen(reg, k, p) }))) which === "kalshi" ? setKalshi(!on) : setPoly(!on);
  };
  return (
    <div className="agroup__body">
      <Choice<Region> name="region" legend="Where are you?" value={reg} save={save}
        options={[{ value: "us", label: "In the US", hint: "You see Kalshi and Polymarket US only." }, { value: "non_us", label: "Outside the US", hint: "You see Kalshi and Polymarket." }]}
        onChange={r => { setReg(r); return { venues: chosen(r, kalshi, poly) }; }} />
      <fieldset className="afield">
        <legend className="afield__label">Apps you can use</legend>
        <label className="arow__check"><input type="checkbox" checked={kalshi} onChange={e => void setVenue("kalshi", e.target.checked)} /><span className="arow__text"><span>Kalshi</span></span></label>
        <label className="arow__check"><input type="checkbox" checked={poly} onChange={e => void setVenue("poly", e.target.checked)} /><span className="arow__text"><span>{reg === "us" ? "Polymarket US" : "Polymarket"}</span></span></label>
        {kalshi && poly ? null : <p className="afield__hint">Keep at least one app on. Most deals need both.</p>}
      </fieldset>
    </div>
  );
}

export function CancelButton() {
  const router = useRouter();
  return (
    <ActionButton data-testid="cancel" action={async () => {
      const res = await fetch("/api/account/cancel", { method: "POST", headers: { Accept: "application/json" } });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) return { ok: false, message: body?.error ?? "Couldn't cancel just now. Try again in a minute, or use Manage billing." };
      router.refresh();
      return { ok: true, message: body?.message ?? "Subscription cancelled." };
    }}>Cancel subscription</ActionButton>
  );
}
