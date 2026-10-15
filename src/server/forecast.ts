import "server-only";
import type { CampaignTargeting } from "@/domain/campaign";
import type { ContentFormat } from "@/domain/playbook-content";

/**
 * Reach forecasting is a separate contract from budgets and reporting
 * (DEC-008). The reference's figures ($1,000/day → 20M views / 8,333 creators;
 * transient campaign-form estimates) are NOT a formula and are not used.
 * Until a model with stated assumptions is configured, every forecast is
 * "unavailable" and the UI says so instead of showing numbers.
 */
export interface ForecastInput {
  dailyBudgetCents: number;
  format: ContentFormat;
  targeting: CampaignTargeting;
}

export interface ForecastRange {
  low: number;
  high: number;
}

export type Forecast =
  | { status: "unavailable"; reason: string }
  | {
      status: "available";
      periodDays: number;
      monthlyViews: ForecastRange;
      monthlyPosts: ForecastRange;
      creators: ForecastRange;
      assumptions: string[];
      modelVersion: string;
      generatedAt: string;
    };

export interface ForecastModel {
  forecast(input: ForecastInput): Promise<Forecast>;
}

const unavailableModel: ForecastModel = {
  async forecast() {
    return { status: "unavailable", reason: "Reach estimate unavailable — no forecasting model has been configured for this workspace yet." };
  },
};

let model: ForecastModel = unavailableModel;

export function forecastReach(input: ForecastInput): Promise<Forecast> {
  return model.forecast(input);
}

/** Plug in a real model (with documented assumptions) when one exists. */
export function setForecastModel(next: ForecastModel | null): void {
  model = next ?? unavailableModel;
}
