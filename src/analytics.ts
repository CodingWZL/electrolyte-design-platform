export type AnalyticsEvent = "page_view" | "search" | "prediction";

export type CountryCount = {
  code: string;
  count: number;
};

export type AnalyticsSummary = {
  totalViews: number;
  searchUses: number;
  predictionUses: number;
  countries: CountryCount[];
  updatedAt: string;
  verifiedSince: string | null;
};

const endpoint = String(import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "")
  .trim()
  .replace(/\/$/, "");

function isSummary(value: unknown): value is AnalyticsSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<AnalyticsSummary>;
  return (
    Number.isInteger(summary.totalViews) &&
    Number.isInteger(summary.searchUses) &&
    Number.isInteger(summary.predictionUses) &&
    Array.isArray(summary.countries) &&
    typeof summary.updatedAt === "string" &&
    (typeof summary.verifiedSince === "string" || summary.verifiedSince === null)
  );
}

async function parseSummary(response: Response) {
  if (!response.ok) throw new Error(`Analytics request failed (${response.status})`);
  const data: unknown = await response.json();
  if (!isSummary(data)) throw new Error("Analytics response was invalid");
  return data;
}

export function analyticsConfigured() {
  return Boolean(endpoint);
}

export async function readAnalytics() {
  if (!endpoint) return undefined;
  const response = await fetch(`${endpoint}/v1/summary`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  return parseSummary(response);
}

export async function recordAnalyticsEvent(type: AnalyticsEvent) {
  if (!endpoint) return undefined;
  const eventId = crypto.randomUUID();
  const response = await fetch(`${endpoint}/v1/events`, {
    method: "POST",
    cache: "no-store",
    keepalive: true,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, eventId }),
  });
  return parseSummary(response);
}
