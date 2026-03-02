import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function msgFromStatus(status: string) {
  if (!status) return null;
  if (status === "MISSING") return "Preencha email e senha.";
  if (status === "CHECK_EMAIL") return "Conta criada! Agora confirme seu email para entrar.";
  return decodeURIComponent(status);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const msg = msgFromStatus(status);

  async function auth(formData: FormData) {
    "use server";

    const mode = String(formData.get("mode") || "login");
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) redirect("/login?status=MISSING");

    const supabase = await createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) redirect(`/login?status=${encodeURIComponent(error.message)}`);

      // Se confirmação de email estiver OFF, geralmente vem session e já entra.
      if (data.session) redirect("/app");

      // Se confirmação estiver ON, não terá session — instrução.
      redirect("/login?status=CHECK_EMAIL");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) redirect(`/login?status=${encodeURIComponent(error.message)}`);
      redirect("/app");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form action={auth} className="w-full max-w-sm space-y-4 border rounded-lg p-6">
        <h1 className="text-xl font-semibold">UTM Guard</h1>

        <div className="space-y-2">
          <label className="text-sm">Email</label>
          <input
            className="w-full border rounded p-2"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seuemail@exemplo.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">Senha</label>
          <input
            className="w-full border rounded p-2"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="********"
          />
        </div>

        <div className="flex gap-2">
          <button name="mode" value="login" className="w-full border rounded p-2">
            Entrar
          </button>
          <button name="mode" value="signup" className="w-full border rounded p-2">
            Criar conta
          </button>
        </div>

        {msg && <p className="text-sm">{msg}</p>}

        <p className="text-xs text-gray-500">
          Dica: para MVP, você pode desativar confirmação de email no Supabase. Em produção, reative.
        </p>
      </form>
    </main>
  );
}