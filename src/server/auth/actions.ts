"use server";

/**
 * Auth Server Actions. The onboarding/auth area adds sign-in, sign-up,
 * verification, reset and step-up actions here; `signOutAction` is part of
 * the stable interface used by the workspace shell.
 */
import { redirect } from "next/navigation";
import { destroyCurrentSession } from "./session";

export async function signOutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/auth/sign-in");
}
