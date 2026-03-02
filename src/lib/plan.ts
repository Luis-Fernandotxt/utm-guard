export type Plan = "free" | "starter" | "agency";

export const PLAN_LIMITS: Record<Plan, number | null> = {
  free: 50,
  starter: 500,
  agency: null,
};

export function normalizePlan(p: string | null | undefined): Plan {
  if (p === "starter" || p === "agency") return p;
  return "free";
}

export function monthlyLimit(plan: string | null | undefined): number | null {
  return PLAN_LIMITS[normalizePlan(plan)];
}