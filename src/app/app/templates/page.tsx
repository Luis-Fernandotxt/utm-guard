import { createClient } from "@/lib/supabase/server";
import { sanitize, validateAllowed, type Rules } from "@/lib/utm";
import { redirect } from "next/navigation";

async function ensureWorkspaceAndRules() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Não autenticado.");
  const user = userData.user;

  const { data: wsList, error: wsErr } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (wsErr) throw new Error(wsErr.message);

  let ws = wsList?.[0];

  if (!ws) {
    const { data: created, error } = await supabase
      .from("workspaces")
      .insert({ owner_user_id: user.id, name: "Meu Workspace", plan: "free" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    ws = created;
  }

  const { data: rulesExisting } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .maybeSingle();

  if (!rulesExisting) {
    await supabase.from("taxonomy_rules").insert({
      workspace_id: ws.id,
      force_lowercase: true,
      strip_accents: true,
      replace_spaces_with: "_",
      allowed_sources: [],
      allowed_mediums: [],
    });
  }

  const { data: rulesRow } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .single();

  const rules: Rules = {
    force_lowercase: rulesRow.force_lowercase,
    strip_accents: rulesRow.strip_accents,
    replace_spaces_with: rulesRow.replace_spaces_with,
    allowed_sources: rulesRow.allowed_sources ?? [],
    allowed_mediums: rulesRow.allowed_mediums ?? [],
  };

  return { ws, rules };
}

function statusMessage(status: string) {
  if (status === "OK") return { text: "Template criado com sucesso!", tone: "ok" as const };
  if (status === "INVALID_URL") return { text: "Base URL inválida. Use https://...", tone: "err" as const };
  if (status === "INVALID_ALLOWED") return { text: "Source/Medium não permitido pelas regras.", tone: "err" as const };
  if (status === "MISSING_FIELDS") return { text: "Preencha nome, base_url, utm_source e utm_medium.", tone: "err" as const };
  if (status === "NO_WORKSPACE") return { text: "Workspace não encontrado.", tone: "err" as const };
  return null;
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";

  const { ws, rules } = await ensureWorkspaceAndRules();
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("templates")
    .select("*")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false });

  async function create(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) redirect("/login");

    const { data: wsList } = await supabase
      .from("workspaces")
      .select("*")
      .eq("owner_user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const ws = wsList?.[0];
    if (!ws) redirect("/app/templates?status=NO_WORKSPACE");

    const { data: rulesRow } = await supabase
      .from("taxonomy_rules")
      .select("*")
      .eq("workspace_id", ws.id)
      .maybeSingle();

    const rules: Rules = {
      force_lowercase: rulesRow?.force_lowercase ?? true,
      strip_accents: rulesRow?.strip_accents ?? true,
      replace_spaces_with: rulesRow?.replace_spaces_with ?? "_",
      allowed_sources: rulesRow?.allowed_sources ?? [],
      allowed_mediums: rulesRow?.allowed_mediums ?? [],
    };

    const name = String(formData.get("name") || "").trim();
    const base_url = String(formData.get("base_url") || "").trim();
    const src = String(formData.get("utm_source") || "").trim();
    const med = String(formData.get("utm_medium") || "").trim();
    const prefix = String(formData.get("utm_campaign_prefix") || "").trim();

    if (!name || !base_url || !src || !med) redirect("/app/templates?status=MISSING_FIELDS");

    try {
      new URL(base_url);
    } catch {
      redirect("/app/templates?status=INVALID_URL");
    }

    const utm_source = sanitize(src, rules);
    const utm_medium = sanitize(med, rules);

    try {
      validateAllowed(utm_source, rules.allowed_sources, "utm_source");
      validateAllowed(utm_medium, rules.allowed_mediums, "utm_medium");
    } catch {
      redirect("/app/templates?status=INVALID_ALLOWED");
    }

    await supabase.from("templates").insert({
      workspace_id: ws.id,
      name,
      base_url,
      utm_source,
      utm_medium,
      utm_campaign_prefix: prefix || null,
    });

    redirect("/app/templates?status=OK");
  }

  const st = statusMessage(status);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Templates</h1>

      {st && (
        <div className={`border rounded p-3 text-sm ${st.tone === "err" ? "border-red-300" : ""}`}>
          {st.text}
        </div>
      )}

      <form action={create} className="border rounded p-4 space-y-3">
        <input
          name="name"
          placeholder="Nome (ex: Cliente X - IG Ads)"
          className="border rounded p-2 w-full"
        />
        <input
          name="base_url"
          placeholder="Base URL (https://...)"
          className="border rounded p-2 w-full"
        />
        <div className="flex gap-2">
          <input name="utm_source" placeholder="utm_source" className="border rounded p-2 w-full" />
          <input name="utm_medium" placeholder="utm_medium" className="border rounded p-2 w-full" />
        </div>
        <input
          name="utm_campaign_prefix"
          placeholder="Prefixo campanha (opcional)"
          className="border rounded p-2 w-full"
        />
        <button className="border rounded px-3 py-2">Criar template</button>
        <div className="text-xs text-gray-500">
          Observação: utm_source/utm_medium são sanitizados e podem ser bloqueados pelas listas permitidas (Regras).
        </div>
      </form>

      <div className="space-y-2">
        {(templates ?? []).map((t) => (
          <div key={t.id} className="border rounded p-3">
            <div className="font-medium">{t.name}</div>
            <div className="text-sm text-gray-600 break-all">{t.base_url}</div>
            <div className="text-sm">source={t.utm_source} • medium={t.utm_medium}</div>
            {t.utm_campaign_prefix && (
              <div className="text-sm text-gray-600">prefix={t.utm_campaign_prefix}</div>
            )}
          </div>
        ))}
        {!templates?.length && <div className="text-sm text-gray-600">Nenhum template ainda.</div>}
      </div>
    </div>
  );
}