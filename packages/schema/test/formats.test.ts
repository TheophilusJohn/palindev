import { describe, expect, it } from "vitest";
import { checkUrl, isIsoDate, isIsoDuration, todayUtc, wordCount } from "../src/formats.js";

describe("formats", () => {
  it("accepts real YYYY-MM-DD dates only", () => {
    expect(isIsoDate("2026-09-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    for (const value of ["2026-02-29", "2026-13-01", "2026-9-1", "2026-09-28T00:00:00Z", ""]) expect(isIsoDate(value), value).toBe(false);
  });

  it("accepts ISO 8601 durations", () => {
    for (const value of ["P30D", "PT1H", "P1Y2M", "P2W", "PT0.5S", "P1DT12H", "P1DT1.5H"]) expect(isIsoDuration(value), value).toBe(true);
    for (const value of ["P", "PT", "P1DT", "30 days", "p30d", "P30"]) expect(isIsoDuration(value), value).toBe(false);
  });

  it("allows a fraction only on the smallest unit, and weeks only on their own", () => {
    for (const value of ["P1.5Y2M", "PT1.5H30M", "P1W2D", "P1.5DT2H"]) expect(isIsoDuration(value), value).toBe(false);
  });

  it("separates https, other schemes and non-URLs", () => {
    expect(checkUrl("https://docs.acme.example/api")).toBe("ok");
    expect(checkUrl("http://docs.acme.example/api")).toBe("http");
    expect(checkUrl("docs.acme.example/api")).toBe("invalid");
    expect(checkUrl("https://docs.acme.example/a b")).toBe("invalid");
  });

  it("wants a literal https:// and no credentials", () => {
    for (const value of ["https:docs.acme.example/a", "https:/docs.acme.example/a", "https://user:pw@docs.acme.example/a", "https://user@docs.acme.example/a"]) {
      expect(checkUrl(value), value).toBe("invalid");
    }
  });

  it("counts whitespace-separated words", () => {
    expect(wordCount("  one two\nthree\tfour  ")).toBe(4);
    expect(wordCount("")).toBe(0);
  });

  it("gives today's date in UTC", () => {
    expect(todayUtc(new Date("2026-10-01T23:30:00-05:00"))).toBe("2026-10-02");
  });
});
