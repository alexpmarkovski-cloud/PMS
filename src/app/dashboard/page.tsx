import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { SignOutButton } from "./sign-out-button";
import { AdminView, LandlordView, StaffView, TenantView } from "./role-views";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role ?? "tenant") as UserRole;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-lg font-semibold tracking-tight">PMS</span>
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col items-center gap-6 px-6 py-8">
        <div className="w-full max-w-3xl">
          <h1 className="text-2xl font-semibold">
            Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Signed in as {user.email} · {ROLE_LABELS[role]}
          </p>
        </div>

        {role === "landlord" && <LandlordView userId={user.id} />}
        {role === "staff" && <StaffView userId={user.id} />}
        {role === "admin" && <AdminView />}
        {role === "tenant" && <TenantView userId={user.id} />}
      </main>
    </div>
  );
}
