import { describe, expect, it } from "vitest";
import {
  BUDGET_BANDS,
  JOB_FUNCTIONS,
  JOB_LEVELS,
  isPhoneNumber,
  isSalesCta,
  isWebsite,
  leadDetailsSchema,
  leadEmailSchema,
  normalizeCtaSource,
  routeDestination,
  startRedirectFor,
} from "./lead";

const valid = {
  firstName: "Sam",
  lastName: "Rivera",
  phone: "+1 (555) 010-0000",
  companyName: "Brand Co",
  companyWebsite: "brand.example",
  budgetBand: "$50K – $100K",
  jobLevel: JOB_LEVELS[0],
  jobFunction: JOB_FUNCTIONS[0],
  notes: "",
};

describe("budget bands", () => {
  it("are exactly the four displayed labels", () => {
    expect(BUDGET_BANDS).toEqual(["$0 – $50K", "$50K – $100K", "$100K – $250K", "$250K+"]);
  });

  it("accepts each band verbatim and rejects near-misses", () => {
    for (const band of BUDGET_BANDS) expect(leadDetailsSchema.safeParse({ ...valid, budgetBand: band }).success).toBe(true);
    for (const band of ["$0 - $50K", "$0–$50K", "50000", "$250K", ""]) {
      const result = leadDetailsSchema.safeParse({ ...valid, budgetBand: band });
      expect(result.success).toBe(false);
    }
  });
});

describe("lead details validation", () => {
  it("accepts a complete submission and defaults optional notes to empty", () => {
    const withoutNotes: Partial<typeof valid> = { ...valid };
    delete withoutNotes.notes;
    const parsed = leadDetailsSchema.parse(withoutNotes);
    expect(parsed.notes).toBe("");
  });

  it("trims and keeps notes when given", () => {
    expect(leadDetailsSchema.parse({ ...valid, notes: "  Launching in May  " }).notes).toBe("Launching in May");
  });

  it("requires every field except notes", () => {
    for (const key of ["firstName", "lastName", "phone", "companyName", "companyWebsite", "budgetBand", "jobLevel", "jobFunction"] as const) {
      const result = leadDetailsSchema.safeParse({ ...valid, [key]: "" });
      expect(result.success, key).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual([key]);
    }
  });

  it("rejects notes over the limit", () => {
    expect(leadDetailsSchema.safeParse({ ...valid, notes: "x".repeat(2001) }).success).toBe(false);
  });

  it("only accepts listed job levels and functions", () => {
    expect(leadDetailsSchema.safeParse({ ...valid, jobLevel: "Wizard" }).success).toBe(false);
    expect(leadDetailsSchema.safeParse({ ...valid, jobFunction: "Wizardry" }).success).toBe(false);
  });
});

describe("website format", () => {
  it.each(["yourbrand.com", "https://yourbrand.com", "http://shop.yourbrand.co.uk/path", "apps.apple.com/app/id123"])("accepts %s", (v) => {
    expect(isWebsite(v)).toBe(true);
  });
  it.each(["yourbrand", "not a site", "ftp://yourbrand.com", "https://", "javascript:alert(1)", "your brand.com"])("rejects %s", (v) => {
    expect(isWebsite(v)).toBe(false);
  });
});

describe("phone format", () => {
  it.each(["+1 555 010 0000", "(555) 010-0000", "+44 20 7946 0000", "5550100"])("accepts %s", (v) => {
    expect(isPhoneNumber(v)).toBe(true);
  });
  it.each(["12345", "call me", "+1 555 010 0000 ext 2", "1234567890123456"])("rejects %s", (v) => {
    expect(isPhoneNumber(v)).toBe(false);
  });
});

describe("work email", () => {
  it("normalizes case and whitespace", () => {
    expect(leadEmailSchema.parse({ email: "  Sam@Brand.Example " }).email).toBe("sam@brand.example");
  });
  it("rejects malformed and empty emails", () => {
    expect(leadEmailSchema.safeParse({ email: "" }).success).toBe(false);
    expect(leadEmailSchema.safeParse({ email: "sam@" }).success).toBe(false);
  });
});

describe("CTA attribution", () => {
  it("keeps well-formed sources and drops malformed ones", () => {
    expect(normalizeCtaSource("hero_primary")).toBe("hero_primary");
    expect(normalizeCtaSource("Pricing_Unlimited")).toBe("pricing_unlimited");
    expect(normalizeCtaSource("<script>")).toBeNull();
    expect(normalizeCtaSource(undefined)).toBeNull();
    expect(normalizeCtaSource("x".repeat(41))).toBeNull();
  });
  it("identifies the sales CTA", () => {
    expect(isSalesCta("hero_sales")).toBe(true);
    expect(isSalesCta("hero_primary")).toBe(false);
    expect(isSalesCta(null)).toBe(false);
  });
});

describe("route destinations", () => {
  it("self-serve carries the email into sign-up and continues to onboarding", () => {
    expect(routeDestination("self_serve", "sam+x@brand.example", null)).toBe("/auth/sign-up?email=sam%2Bx%40brand.example&next=%2Fonboarding");
  });
  it("learn goes to how it works", () => {
    expect(routeDestination("learn", "a@b.co", null)).toBe("/how-it-works");
  });
  it("book a call requires a configured https booking URL", () => {
    expect(routeDestination("book_call", "a@b.co", null)).toBeNull();
    expect(routeDestination("book_call", "a@b.co", "javascript:alert(1)")).toBeNull();
    expect(routeDestination("book_call", "a@b.co", "https://booking.example/team")).toBe("https://booking.example/team");
  });
});

describe("start redirect rule", () => {
  it("sends workspace members home, account holders without one to onboarding, and shows the funnel otherwise", () => {
    expect(startRedirectFor({ signedIn: true, workspaceCount: 2 })).toBe("/home");
    expect(startRedirectFor({ signedIn: true, workspaceCount: 0 })).toBe("/onboarding");
    expect(startRedirectFor({ signedIn: false, workspaceCount: 0 })).toBeNull();
  });
});
