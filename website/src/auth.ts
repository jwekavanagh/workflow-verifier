import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { resolveAuthSecret } from "./lib/authSecret";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: resolveAuthSecret(),
});
