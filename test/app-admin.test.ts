import { describe, expect, it } from "vitest";
import { adminCookieValue, adminConfigured, adminLogin, base32Decode, totpCode, verifyAdminCookie, verifyTotp, ADMIN_SESSION_MS } from "@/lib/admin";

// RFC 6238 Appendix B, SHA-1 seed "12345678901234567890" (base32 below).
const SEED_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const VECTORS: Array<[number, string]> = [
  [59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"],
];
const TOKEN = "t".repeat(40);

describe("admin TOTP", () => {
  it("decodes base32", () => {
    expect(base32Decode(SEED_B32)?.toString("ascii")).toBe("12345678901234567890");
    expect(base32Decode("not base32!")).toBeNull();
  });

  it("matches the RFC 6238 SHA-1 test vectors (8 digits)", () => {
    const key = base32Decode(SEED_B32)!;
    for (const [t, code] of VECTORS) expect(totpCode(key, Math.floor(t / 30), 8)).toBe(code);
  });

  it("verifies the 6-digit form, with ±1 step drift", () => {
    for (const [t, code] of VECTORS) {
      const six = code.slice(-6);
      expect(verifyTotp(SEED_B32, six, t * 1000)).toBe(Math.floor(t / 30));
      expect(verifyTotp(SEED_B32, six, (t + 30) * 1000)).toBe(Math.floor(t / 30));
      expect(verifyTotp(SEED_B32, six, (t + 95) * 1000)).toBeNull();
    }
    expect(verifyTotp(SEED_B32, "12345", 59_000)).toBeNull();
    expect(verifyTotp("AAAA", "287082", 59_000)).toBeNull();
  });

  it("needs a 32+ character token and a valid secret", () => {
    expect(adminConfigured("short", SEED_B32)).toBe(false);
    expect(adminConfigured(TOKEN, "")).toBe(false);
    expect(adminConfigured(TOKEN, SEED_B32)).toBe(true);
  });

  it("signs in with the token and a fresh code once, and the cookie verifies until it expires", () => {
    const now = 1111111111 * 1000;
    expect(adminLogin("wrong".repeat(10), "050471", now, TOKEN, SEED_B32).ok).toBe(false);
    expect(adminLogin(TOKEN, "000000", now, TOKEN, SEED_B32).ok).toBe(false);
    const ok = adminLogin(TOKEN, "050471", now, TOKEN, SEED_B32);
    expect(ok.ok).toBe(true);
    // The same code can't be used twice.
    expect(adminLogin(TOKEN, "050471", now, TOKEN, SEED_B32).ok).toBe(false);
    if (!ok.ok) return;
    expect(verifyAdminCookie(ok.cookie, now + 1000, TOKEN)).toBe(true);
    expect(verifyAdminCookie(ok.cookie, now + ADMIN_SESSION_MS + 1, TOKEN)).toBe(false);
    expect(verifyAdminCookie(ok.cookie, now, "x".repeat(40))).toBe(false);
    expect(verifyAdminCookie(ok.cookie.replace(/.$/, c => (c === "A" ? "B" : "A")), now, TOKEN)).toBe(false);
    expect(verifyAdminCookie(adminCookieValue(TOKEN, now + ADMIN_SESSION_MS * 5), now, TOKEN)).toBe(false);
    expect(verifyAdminCookie(undefined, now, TOKEN)).toBe(false);
  });
});
