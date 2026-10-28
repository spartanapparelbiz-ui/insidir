import { createHash } from "node:crypto";

/** Hex SHA-256: how one-time tokens are stored (never the token itself). */
export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
