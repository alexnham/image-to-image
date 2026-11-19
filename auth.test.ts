import { expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
const captured = vi.hoisted(() => ({
  config: undefined as NextAuthConfig | undefined,
}));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    captured.config = config;
    return { auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() };
  },
}));
import "./auth";
it("keeps the same Google identity across fresh OAuth user records and token refresh", async () => {
  const jwt = captured.config!.callbacks!.jwt!;
  const signin = (id: string) =>
    jwt({
      token: { sub: id },
      user: { id },
      account: {
        type: "oidc",
        provider: "google",
        providerAccountId: "123456789",
      },
      trigger: "signIn",
      session: undefined,
    });
  const first = await signin("random-login-a"),
    second = await signin("random-login-b");
  expect(first?.sub).toBe("123456789");
  expect(second?.sub).toBe(first?.sub);
  const refreshed = await jwt({ token: first!, user: {}, session: undefined });
  expect(refreshed?.sub).toBe(first?.sub);
});
it("retains the explicit local preview identity", async () => {
  const token = await captured.config!.callbacks!.jwt!({
    token: {},
    user: { id: "local-preview" },
    account: {
      type: "credentials",
      provider: "local-preview",
      providerAccountId: "local-preview",
    },
    trigger: "signIn",
    session: undefined,
  });
  expect(token?.sub).toBe("local-preview");
});
