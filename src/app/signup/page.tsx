import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIGNUP_TOKEN_COOKIE, verifySignupToken } from "@/lib/signup-token";
import SignupForm from "./signup-form";

export const metadata = { title: "Create your account — PMS" };

// This page is only reachable via the /login handoff: the login server
// action confirms the email has no account and issues a short-lived signed
// token in an httpOnly cookie. No valid token, no page.
export default async function SignupPage() {
  const cookieStore = await cookies();
  const email = verifySignupToken(
    cookieStore.get(SIGNUP_TOKEN_COOKIE)?.value,
  );
  if (!email) redirect("/login");

  return <SignupForm email={email} />;
}
