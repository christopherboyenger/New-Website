import { vi } from "vitest";
import { cookiesApi, headersApi } from "./request-context";

// Next.js request APIs → in-memory request context (see request-context.ts).
vi.mock("next/headers", () => ({
  cookies: async () => cookiesApi(),
  headers: async () => headersApi(),
}));

// Cache invalidation is a no-op outside a Next.js server.
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
  refresh: () => undefined,
}));
