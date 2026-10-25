import Link from "next/link";

export default function NotFound() {
  return (
    <div className="sec">
      <h1>No market found.</h1>
      <p className="muted">That address doesn&apos;t match a Polymarket event or market.</p>
      <p><Link href="/">Paste a Polymarket link</Link></p>
    </div>
  );
}
