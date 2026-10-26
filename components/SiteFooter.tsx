import Link from "next/link";
import { FOOTER } from "@/lib/copy";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <p>{FOOTER}</p>
        <nav className="foot__links" aria-label="Footer">
          <Link href="/receipts">Past deals</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <p className="dim" style={{ marginTop: 8 }}>© 2026 Aethric LLC · insidir.com</p>
      </div>
    </footer>
  );
}
