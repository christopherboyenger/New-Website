import { describe, expect, it } from "vitest";
import { activityColumns, activityDays, activitySummary } from "./activity";

describe("posting activity model", () => {
  it("covers exactly the last N weeks ending today, oldest first", () => {
    const days = activityDays("2026-10-15", 8);
    expect(days).toHaveLength(56);
    expect(days[0]).toBe("2026-08-21");
    expect(days[55]).toBe("2026-10-15");
  });

  it("lays out weekly columns with capped intensity levels", () => {
    const columns = activityColumns({ "2026-10-15": 5, "2026-10-14": 2, "2026-08-21": 1, "2026-01-01": 9 }, "2026-10-15", 8);
    expect(columns).toHaveLength(8);
    expect(columns.every((c) => c.length === 7)).toBe(true);
    expect(columns[0][0]).toEqual({ day: "2026-08-21", count: 1, level: 1 });
    expect(columns[7][6]).toEqual({ day: "2026-10-15", count: 5, level: 3 });
    expect(columns[7][5].level).toBe(2);
  });

  it("summarizes activity in words", () => {
    expect(activitySummary({}, "2026-10-15", 8)).toBe("No posts in the last 8 weeks");
    expect(activitySummary({ "2026-10-01": 1, "2026-10-14": 2, "2025-01-01": 4 }, "2026-10-15", 8)).toBe(
      "3 posts on 2 days in the last 8 weeks, most recently Oct 14",
    );
  });
});
