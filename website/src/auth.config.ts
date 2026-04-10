import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import type { NextAuthConfig } from "next-auth";
import Email from "next-auth/providers/email";
import { db } from "./db/client";
import { recordSignInFunnel } from "./lib/recordSignInFunnel";
import { sendMagicLink } from "./lib/sendMagicLink";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "./db/schema";

export const authConfig = {
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  events: {
    async signIn({ user }) {
      if (user.id) await recordSignInFunnel(user.id);
    },
  },
  providers: [
    Email({
      // Auth.js validates a Nodemailer `server` even when `sendVerificationRequest` sends via Resend/Mailpit.
      server: process.env.EMAIL_SERVER ?? {
        host: "127.0.0.1",
        port: 1025,
        secure: false,
        auth: { user: "", pass: "" },
      },
      from: process.env.EMAIL_FROM ?? "Workflow Verifier <onboarding@example.com>",
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLink(identifier, url);
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        try {
          const row = await db
            .select({ plan: users.plan })
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1);
          (session.user as { plan?: string }).plan = row[0]?.plan ?? "starter";
        } catch (e) {
          if (process.env.NODE_ENV !== "development") {
            throw e;
          }
          console.warn(
            "[auth] session plan lookup skipped (database unreachable?)",
            e,
          );
          (session.user as { plan?: string }).plan = "starter";
        }
      }
      return session;
    },
  },
  session: { strategy: "database" },
} satisfies NextAuthConfig;
