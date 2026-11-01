"use client";
/* Share a Read: the phone's share sheet with its image (1080×1350, insidir.com on it) where the browser can share
 * files, else the image opens to save. */
export function ShareRead({ id }: { id: string }) {
  const href = `/read/${id}/image`;
  const share = async () => {
    try {
      const blob = await (await fetch(href)).blob();
      const file = new File([blob], `insidir-read-${id}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], url: `${location.origin}/read/${id}` }); return; }
    } catch { /* fall through to opening the image */ }
    window.open(href, "_blank", "noopener");
  };
  return <a className="btn btn--secondary" href={href} target="_blank" rel="noopener" data-testid="read-share" onClick={e => { e.preventDefault(); void share(); }}>Share</a>;
}
