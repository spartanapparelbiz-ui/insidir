import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense, type ReactNode } from "react";
import { RegisterSW } from "@/components/app/RegisterSW";
import { Motion } from "@/components/motion/Motion";
import { NavProgress } from "@/components/motion/NavProgress";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { JsonLd, organizationLd } from "@/lib/seo/jsonld";
import { getDb, hasDatabase } from "@/lib/db";
import { positioningEdge } from "@/lib/smart/gate";
import { Beacons } from "@/components/landing/Beacons";
import { ToastProvider } from "@/components/ui/Toast";
import { LockProvider } from "@/components/lock/Lock";
import { unlockHref } from "@/components/app/links";
import { MEMBER_GETS } from "@/lib/brand/copy";
import { WHAT_IS, WHAT_IS_TITLE } from "@/lib/copy";
import "./tokens.css";
import "./globals.css";
import "./v2.css";
import "./light.css";
import "./polish.css";
import "./motion.css";
import "./brand.css";
import "./terminal.css";
import { brandFontClasses } from "@/lib/brand/fonts";
import { THEME_SCRIPT } from "@/lib/brand/theme";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://insidir.com"),
  title: { default: WHAT_IS_TITLE, template: "%s | Insidir" },
  description: WHAT_IS,
  openGraph: { title: WHAT_IS_TITLE, description: WHAT_IS, siteName: "Insidir", type: "website" },
  twitter: { card: "summary_large_image", title: WHAT_IS_TITLE, description: WHAT_IS },
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icons/favicon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  // Added to an iPhone's home screen, Insidir opens full screen like an app: what iOS needs for web push alerts.
  appleWebApp: { capable: true, title: "Insidir", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

/** Schibsted Grotesk for everything, self-hosted by next/font: no third-party request at runtime. It is the variable font (400–900) with one change
 * (app/fonts, SIL OFL): its tabular figures apply to digits only, so "$160,000" keeps a normal comma. */
// Not preloaded: the brand pages (home, /go, the check) use Plus Jakarta Sans; only the older pages need this one.
const schibsted = localFont({ src: "./fonts/schibsted-grotesk-latin.woff2", weight: "400 900", variable: "--font-schibsted", display: "swap", preload: false });

export const viewport: Viewport = { themeColor: "#0b1220", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Whether Positioning has earned its place in the nav (cached for 10 minutes).
  if (hasDatabase()) await positioningEdge(getDb()).catch(() => null);
  // The visitors' bottom bar: anyone with a session (members, or signed in on their way to pay) never sees it.
  const jar = await cookies();
  const visitor = !jar.get(SESSION_COOKIE)?.value;
  return (
    <html lang="en" className={`${schibsted.variable} ${brandFontClasses}`} suppressHydrationWarning>
      <head>
        {/* Light or dark before the first paint (lib/brand/theme.ts): the saved choice, else the system's. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Every photo comes from Unsplash's image CDN (lib/unsplash.ts): open the connection before the first one is asked for. */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        {/* Before first paint: motion is allowed (bm) and the landing hero plays its entrance from first paint (hero-in). Nothing is hidden here: components/brand/StageMotion.tsx hides only stages below the fold. */}
        <script dangerouslySetInnerHTML={{ __html: "if(!matchMedia('(prefers-reduced-motion: reduce)').matches){var h=document.documentElement;h.classList.add('js');if('IntersectionObserver' in window){h.classList.add('bm');h.classList.add('hero-in');setTimeout(function(){if(!window.__bmOK)h.classList.remove('bm')},6000)}}" }} />
      </head>
      <body>
        <ToastProvider>
          <LockProvider unlocks={[...MEMBER_GETS]} trialHref={unlockHref()}>
            {children}
          </LockProvider>
        </ToastProvider>
        <JsonLd data={organizationLd()} />
        <RegisterSW />
        <Motion />
        <Suspense fallback={null}><NavProgress /></Suspense>
        <Beacons />
      </body>
    </html>
  );
}
