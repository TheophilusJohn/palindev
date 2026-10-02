// Format checks shared by V6 and V15. The schemas mark these fields with `format` annotations only.

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const WEEKS = new RegExp(`^P${NUMBER}W$`);
const DURATION = new RegExp(
  `^P(?!$)(?:(${NUMBER})Y)?(?:(${NUMBER})M)?(?:(${NUMBER})D)?(?:T(?=\\d)(?:(${NUMBER})H)?(?:(${NUMBER})M)?(?:(${NUMBER})S)?)?$`,
);

/**
 * An ISO 8601 duration such as P30D, PT1H or P1Y2M: weeks stand alone (P2W), and only the smallest
 * unit written may have a fraction (PT1.5H, not P1.5DT2H).
 */
export function isIsoDuration(value: string): boolean {
  if (WEEKS.test(value)) return true;
  const match = DURATION.exec(value);
  if (match === null) return false;
  const parts = match.slice(1).filter((part) => part !== undefined);
  return parts.slice(0, -1).every((part) => !part.includes("."));
}

/** "ok" for an https:// URL with a host and no credentials; "http" for another scheme; else "invalid". */
export function checkUrl(value: string): "ok" | "http" | "invalid" {
  if (/\s/.test(value)) return "invalid";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "https:") return "http";
  if (!value.startsWith("https://") || url.hostname === "" || url.username !== "" || url.password !== "") return "invalid";
  return "ok";
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

/** Today in UTC as YYYY-MM-DD. */
export function todayUtc(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
