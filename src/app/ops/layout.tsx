import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OpsShell } from "@/components/ops/ops-shell";
import { requireOperatorPage } from "@/server/ops/operator";

export const metadata: Metadata = {
  title: { default: "Operator console", template: "%s · Operator console" },
  robots: { index: false, follow: false },
};

/** Operator-only area. Non-operators (including signed-out visitors) get the generic 404. */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const operator = await requireOperatorPage();
  return <OpsShell operatorEmail={operator.user.email}>{children}</OpsShell>;
}
