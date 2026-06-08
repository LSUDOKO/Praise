import { OneShotClient } from "@1shotapi/client-sdk";

if (!process.env.ONESHOT_API_KEY || !process.env.ONESHOT_API_SECRET) {
  console.warn(
    "ONESHOT_API_KEY or ONESHOT_API_SECRET not set. 1Shot API calls will fail."
  );
}

export const oneshotClient = new OneShotClient({
  apiKey: process.env.ONESHOT_API_KEY || "",
  apiSecret: process.env.ONESHOT_API_SECRET || "",
});

/**
 * Get the business ID from env or throw.
 */
export function getBusinessId(): string {
  const id = process.env.ONESHOT_BUSINESS_ID;
  if (!id) throw new Error("ONESHOT_BUSINESS_ID env variable not set");
  return id;
}
