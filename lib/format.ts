const percentFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentPrecise = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const priceFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPercent(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatter = precise ? percentPrecise : percentFormatter;
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatter.format(Math.abs(value * 100))}%`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return priceFormatter.format(value);
}

export function direction(value: number | null | undefined): "up" | "down" | "flat" | "none" {
  if (value === null || value === undefined || !Number.isFinite(value)) return "none";
  if (value > 0.00005) return "up";
  if (value < -0.00005) return "down";
  return "flat";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10" → "October 2026" */
export function monthLabel(roundId: string): string {
  const [year, month] = roundId.split("-").map(Number);
  if (!year || !month) return roundId;
  return `${MONTHS[month - 1]} ${year}`;
}

/** "2026-10" → "Oct 26" */
export function shortMonth(roundId: string): string {
  const [year, month] = roundId.split("-").map(Number);
  if (!year || !month) return roundId;
  return `${MONTHS[month - 1].slice(0, 3)} ${String(year).slice(2)}`;
}

export function roundId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function nextRoundId(id: string): string {
  const [year, month] = id.split("-").map(Number);
  return month === 12 ? roundId(year + 1, 1) : roundId(year, month + 1);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Player-facing name. Falls back to the local part of the email. */
export function displayName(
  profile: { alias?: string | null; email?: string } | null | undefined,
): string {
  if (!profile) return "Player";
  if (profile.alias && profile.alias.trim()) return profile.alias.trim();
  if (profile.email) return profile.email.split("@")[0];
  return "Player";
}
