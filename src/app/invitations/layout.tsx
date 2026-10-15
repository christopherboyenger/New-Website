import { AuthFrame } from "@/components/onboarding/shell";

/** Invitation pages share the white onboarding/auth frame. */
export default function InvitationsLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
