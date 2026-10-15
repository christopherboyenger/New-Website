import { describe, expect, it } from "vitest";
import {
  applyOrganicPatch,
  DEFAULT_METRICS,
  hasPostFilters,
  organicHref,
  parseMetrics,
  parseOrganicState,
  serializeOrganicState,
  sortPatch,
  type OrganicState,
} from "./organic-url-state";

const now = new Date("2026-10-14T15:00:00.000Z");
const parse = (query: string) => parseOrganicState(new URLSearchParams(query), now);

describe("organic URL state", () => {
  it("defaults to the posts tab, last 30 UTC days, grid, created-in-range and the observed metric cards", () => {
    const state = parse("");
    expect(state).toEqual<OrganicState>({
      tab: "posts",
      campaign: null,
      playbook: null,
      platform: null,
      review: null,
      range: { from: "2026-09-15", to: "2026-10-14" },
      comparisons: "none",
      view: "grid",
      mode: "created",
      metrics: ["views", "spend", "cpm", "posts"],
      chart: "views",
      sort: "posted",
      order: "desc",
      page: 1,
      q: "",
    });
  });

  it("parses the observed reference keys", () => {
    const state = parse("comparisons=none&tab=playbooks&campaign=cmp_abc123&from=2026-09-01&to=2026-09-30");
    expect(state.tab).toBe("playbooks");
    expect(state.campaign).toBe("cmp_abc123");
    expect(state.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(state.comparisons).toBe("none");
    expect(state.sort).toBe("views");
  });

  it("accepts a Next.js searchParams record (first value of repeated keys)", () => {
    const state = parseOrganicState({ tab: ["campaigns", "posts"], page: "3", q: undefined }, now);
    expect(state.tab).toBe("campaigns");
    expect(state.page).toBe(3);
  });

  it("round-trips every non-default value through the canonical serialization", () => {
    const state: OrganicState = {
      tab: "posts",
      campaign: "cmp_1",
      playbook: "0",
      platform: "instagram",
      review: "rejected",
      range: { from: "2026-08-01", to: "2026-08-31" },
      comparisons: "platform",
      view: "table",
      mode: "active",
      metrics: ["likes", "views", "engagement", "creators"],
      chart: "engagement",
      sort: "range_views",
      order: "asc",
      page: 4,
      q: "summer drop",
    };
    const query = serializeOrganicState(state).toString();
    expect(query).toBe(
      "campaign=cmp_1&playbook=0&platform=instagram&review=rejected&from=2026-08-01&to=2026-08-31&comparisons=platform&view=table&mode=active&metrics=likes%2Cviews%2Cengagement%2Ccreators&chart=engagement&sort=range_views&order=asc&page=4&q=summer+drop",
    );
    expect(parse(query)).toEqual(state);
  });

  it("serializes defaults minimally but always keeps the dates", () => {
    expect(serializeOrganicState(parse("")).toString()).toBe("from=2026-09-15&to=2026-10-14");
    const reparsed = parse(serializeOrganicState(parse("tab=campaigns&sort=views&order=desc")).toString());
    expect(serializeOrganicState(reparsed).toString()).toBe("tab=campaigns&from=2026-09-15&to=2026-10-14");
  });

  it("falls back to defaults for malformed or unknown values without throwing", () => {
    const state = parse(
      "tab=reports&campaign=%3Cscript%3E&playbook=" +
        "x".repeat(65) +
        "&platform=myspace&review=maybe&from=2026-02-30&to=nope&comparisons=creator&view=list&mode=sometime&metrics=foo,,bar&chart=installs&sort=drop%20table&order=up&page=-2&q=",
    );
    expect(state).toEqual(parse(""));
  });

  it("normalizes dates leniently: swapped bounds and ranges over 366 days", () => {
    expect(parse("from=2026-10-10&to=2026-10-01").range).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
    expect(parse("from=2024-01-01&to=2026-10-14").range).toEqual({
      from: "2025-10-14",
      to: "2026-10-14",
    });
  });

  it("rejects non-numeric, zero and absurd pages", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=2.5").page).toBe(1);
    expect(parse("page=10001").page).toBe(1);
    expect(parse("page=12").page).toBe(12);
  });

  it("keeps sort keys only when valid for the tab", () => {
    expect(parse("tab=posts&sort=playbooks").sort).toBe("posted");
    expect(parse("tab=campaigns&sort=playbooks").sort).toBe("playbooks");
    expect(parse("tab=playbooks&sort=playbooks").sort).toBe("views");
    expect(parse("tab=campaigns&sort=name").order).toBe("asc");
    expect(parse("tab=campaigns&sort=spend").order).toBe("desc");
  });

  it("pads, dedupes and caps the metric cards at four", () => {
    expect(parseMetrics("likes")).toEqual(["likes", "views", "spend", "cpm"]);
    expect(parseMetrics("views,views,shares")).toEqual(["views", "shares", "spend", "cpm"]);
    expect(parseMetrics("likes,comments,bookmarks,shares,engagement")).toEqual(["likes", "comments", "bookmarks", "shares"]);
    expect(parseMetrics(undefined)).toEqual([...DEFAULT_METRICS]);
  });

  it("charts the first card unless another shown card is chosen", () => {
    expect(parse("metrics=spend,views,cpm,posts").chart).toBe("spend");
    expect(parse("chart=cpm").chart).toBe("cpm");
    expect(parse("chart=likes").chart).toBe("views");
  });

  it("trims and caps search, and accepts the `search` alias used by global search", () => {
    expect(parse("q=%20%20two%20%20%20words%20").q).toBe("two words");
    expect(parse(`q=${"a".repeat(150)}`).q).toHaveLength(100);
    expect(parse("search=handle_1").q).toBe("handle_1");
    expect(parse("q=primary&search=alias").q).toBe("primary");
  });

  it("resets the page on any change unless the page itself changes", () => {
    const state = parse("page=5&tab=campaigns");
    expect(applyOrganicPatch(state, { platform: "tiktok" }).page).toBe(1);
    expect(applyOrganicPatch(state, { page: 6 }).page).toBe(6);
    expect(organicHref("/home/acme/campaigns", state, { page: 2 })).toBe("/home/acme/campaigns?tab=campaigns&from=2026-09-15&to=2026-10-14&page=2");
  });

  it("resets sorting when the tab changes and uses each column's default order", () => {
    const state = parse("tab=campaigns&sort=playbooks&order=asc");
    const toPosts = applyOrganicPatch(state, { tab: "posts" });
    expect([toPosts.sort, toPosts.order]).toEqual(["posted", "desc"]);
    expect(applyOrganicPatch(state, { sort: "name" }).order).toBe("asc");
  });

  it("flips the order when the active sort column is clicked again", () => {
    const state = parse("tab=campaigns&sort=spend");
    expect(sortPatch(state, "spend")).toEqual({ sort: "spend", order: "asc" });
    expect(sortPatch(state, "name")).toEqual({ sort: "name", order: "asc" });
    expect(sortPatch(state, "views")).toEqual({ sort: "views", order: "desc" });
  });

  it("keeps the charted metric when cards change, or falls back to the first card", () => {
    const state = parse("metrics=views,spend,cpm,posts&chart=cpm");
    expect(applyOrganicPatch(state, { metrics: ["likes", "spend", "cpm", "posts"] }).chart).toBe("cpm");
    expect(
      applyOrganicPatch(state, {
        metrics: ["likes", "spend", "views", "posts"],
      }).chart,
    ).toBe("likes");
  });

  it("builds hrefs that change one key, and Back/Forward restore because the URL is the state", () => {
    const state = parse("tab=campaigns&from=2026-09-01&to=2026-09-30");
    const href = organicHref("/home/acme/campaigns", state, {
      tab: "playbooks",
      campaign: "cmp_9",
    });
    expect(href).toBe("/home/acme/campaigns?tab=playbooks&campaign=cmp_9&from=2026-09-01&to=2026-09-30");
    const restored = parseOrganicState(new URLSearchParams(href.split("?")[1]), now);
    expect(restored.tab).toBe("playbooks");
    expect(restored.campaign).toBe("cmp_9");
    expect(restored.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("reports whether post filters are active", () => {
    expect(hasPostFilters(parse("mode=active"))).toBe(false);
    expect(hasPostFilters(parse("platform=youtube"))).toBe(true);
    expect(hasPostFilters(parse("q=abc"))).toBe(true);
  });
});
