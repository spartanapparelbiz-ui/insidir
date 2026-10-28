/* Public usernames we won't show: hate codes and slurs. A blocked name is replaced by the short 0x address, never
 * shown or stored as is (lib/moves/records.ts walletLabel, lib/moves/sources.ts publicUsername). Pure.
 *   Codes: 1488 / 14/88, 88 as its own number ("Aryan88", "88"; not 1988), "14 words", HH, Sieg/Heil, Zyklon,
 *   RaHoWa, WPWW, white power, KKK and Nazi-identity words.
 *   Slurs: matched after undoing common disguises (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s) and separators. */
const CODE_NUMBERS = new Set(["88", "1488", "8814", "14 88", "14/88"]);
const WORDS = [
  "14words", "fourteenwords", "siegheil", "heilhitler", "hitler", "zyklon", "rahowa", "wpww", "whitepower", "kkk", "nazi", "aryan", "ss88", "hh88",
  "nigger", "nigga", "faggot", "wetback", "tranny", "beaner", "raghead",
  "towelhead", "sandnigger", "jewrat", "gasthejews", "holohoax",
];
/** Short words only blocked on their own (inside other words they're innocent: "Raccoon", "Spice"). */
const ALONE = new Set(["chink", "coon", "spic", "fag", "gook", "kike", "hh", "heil", "sieg", "nig", "niger", "retard", "retarded"]);

const unleet = (s: string): string => s.toLowerCase()
  .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/@/g, "a").replace(/\$/g, "s");

export function isBlockedName(name: string | null | undefined): boolean {
  if (!name) return false;
  const raw = name.toLowerCase();
  // Numbers as numbers (before undoing leetspeak): 88 alone, 1488, 14/88; not 1988.
  for (const d of raw.match(/\d+(?:[\s/._-]\d+)?/g) ?? []) if (CODE_NUMBERS.has(d.replace(/[\s._-]/g, d.includes("/") ? "" : " ").replace(/\s+/g, " ")) || CODE_NUMBERS.has(d)) return true;
  if (/(^|[^0-9])14\s*words?/.test(raw)) return true;
  const flat = unleet(raw).replace(/[^a-z]/g, "");
  const flatKeepRuns = raw.replace(/[^a-z0-9]/g, "");
  for (const w of WORDS) if (flat.includes(w) || flatKeepRuns.includes(w)) return true;
  // Whole words only, split on anything but letters and on camelCase ("hhTrader", "Coon_88").
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9@$]+/).filter(Boolean);
  for (const w of words) if (ALONE.has(w.toLowerCase()) || ALONE.has(unleet(w))) return true;
  return false;
}
