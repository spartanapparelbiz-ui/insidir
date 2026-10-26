/* The one Whop SDK client (@whop/sdk), built for the environment WHOP_ENV picks. Server and worker only: it holds the
 * account API key. Rebuilt if the configuration changes (tests switch it). */
import { WhopClient } from "@whop/sdk";
import { whopConfig } from "./config";

let cached: { key: string; client: WhopClient } | null = null;

export function whop(): WhopClient {
  const c = whopConfig();
  const key = `${c.hosts.api}|${c.apiKey}`;
  if (!cached || cached.key !== key) {
    cached = { key, client: new WhopClient({ token: c.apiKey, environment: c.hosts, timeoutInSeconds: 10, maxRetries: 1 }) };
  }
  return cached.client;
}
