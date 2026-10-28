/* For accounts on the owner's free-access list only: a thin bar above the header to see the site exactly as a paying
 * member or as a logged-out visitor sees it (a cookie, set by /api/view-as). Plain forms: works before any JS. */
import { getViewer } from "@/lib/auth/viewer";

export async function ViewAs() {
  const v = await getViewer();
  const me = v.previewing ?? (v.user?.freeAccess ? v.user : null);
  if (!me) return null;
  const as = v.previewing ? "visitor" : "member";
  const opt = (value: "member" | "visitor", label: string) => (
    <button type="submit" name="as" value={value} className="viewas__opt" aria-pressed={as === value}>{label}</button>
  );
  return (
    <form className="viewas" method="post" action="/api/view-as" data-testid="view-as">
      <span className="viewas__label">Free access · View as</span>
      <span className="viewas__seg" role="group" aria-label="View as">{opt("member", "Member")}{opt("visitor", "Visitor")}</span>
    </form>
  );
}
