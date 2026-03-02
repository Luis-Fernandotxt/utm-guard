import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b p-4 flex gap-4 items-center flex-wrap">
        <Link href="/app" className="font-semibold">UTM Guard</Link>
        <Link href="/app/settings">Regras</Link>
        <Link href="/app/templates">Templates</Link>
        <Link href="/app/bulk">Bulk</Link>
        <Link href="/app/history">Histórico</Link>
        <Link href="/app/upgrade">Upgrade</Link>
        <form action={signOut} className="ml-auto">
          <button className="border rounded px-3 py-1">Sair</button>
        </form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}