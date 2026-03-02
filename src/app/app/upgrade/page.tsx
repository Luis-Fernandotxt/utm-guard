import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function ensureWorkspaceAndGet() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const user = userData.user;

  const { data: wsList } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  let ws = wsList?.[0];

  if (!ws) {
    const { data: created, error } = await supabase
      .from("workspaces")
      .insert({ owner_user_id: user.id, name: "Meu Workspace", plan: "free" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    ws = created;

    await supabase.from("taxonomy_rules").insert({
      workspace_id: ws.id,
      force_lowercase: true,
      strip_accents: true,
      replace_spaces_with: "_",
      allowed_sources: [],
      allowed_mediums: [],
    });
  }

  return { ws };
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";

  const { ws } = await ensureWorkspaceAndGet();

  async function apply(formData: FormData) {
    "use server";
    const token = String(formData.get("token") || "").trim();
    if (!token) redirect("/app/upgrade?status=EMPTY");

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) redirect("/login");

    const { data, error } = await supabase.rpc("apply_upgrade_token", { p_token: token });
    if (error) redirect("/app/upgrade?status=ERROR");

    redirect(`/app/upgrade?status=${data}`);
  }

  const statusMsg =
    status === "OK"
      ? "Upgrade aplicado com sucesso!"
      : status === "INVALID_OR_USED"
      ? "Token inválido ou já usado."
      : status === "EMPTY"
      ? "Cole um token."
      : status === "ERROR"
      ? "Erro ao aplicar token."
      : "";

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold">Upgrade</h1>

      <div className="border rounded p-4">
        <div className="text-sm text-gray-600">Plano atual</div>
        <div className="text-lg font-semibold">{ws.plan}</div>
      </div>

      <form action={apply} className="border rounded p-4 space-y-3">
        <label className="text-sm">Token</label>
        <input name="token" className="border rounded p-2 w-full" placeholder="ex: STARTER-XXXX" />
        <button className="border rounded px-3 py-2">Aplicar</button>
        {statusMsg && <div className="text-sm pt-2">{statusMsg}</div>}
      </form>

      <div className="text-sm text-gray-600">
        MVP sem Stripe: você cria tokens manualmente na tabela{" "}
        <span className="font-mono">upgrade_tokens</span>.
      </div>
    </div>
  );
}