import "server-only";

/**
 * Server-side environment access with loud failures.
 *
 * A missing variable should stop the request with a name, not surface
 * later as an unexplained permission error.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy env.example to .env.local for ` +
        `local work, or add it in the Vercel project settings.`,
    );
  }
  return value;
}

export const serverEnv = {
  cronSecret: () => required("CRON_SECRET", process.env.CRON_SECRET),
  priceProvider: () => process.env.PRICE_PROVIDER ?? "manual",
  priceApiKey: () => process.env.PRICE_API_KEY ?? "",
  priceApiBaseUrl: () => process.env.PRICE_API_BASE_URL ?? "",
};

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
