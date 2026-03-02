import { createClient } from "@/lib/supabase/server";
import { sanitize, type Rules } from "@/lib/utm";

async function ensureWorkspaceAndRules() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Não autenticado.");
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

  const { data: rulesExisting, error: rulesErr } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .maybeSingle();

  if (rulesErr) throw new Error(rulesErr.message);

  if (!rulesExisting) {
    const { error } = await supabase.from("taxonomy_rules").insert({
      workspace_id: ws.id,
      force_lowercase: true,
      strip_accents: true,
      replace_spaces_with: "_",
      allowed_sources: [],
      allowed_mediums: [],
    });
    if (error) throw new Error(error.message);
  }

  const { data: rules } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .single();

  return { ws, rules };
}

export default async function SettingsPage() {
  const { ws, rules } = await ensureWorkspaceAndRules();

  async function save(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data: wsList } = await supabase
      .from("workspaces")
      .select("*")
      .eq("owner_user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const ws = wsList?.[0];
    if (!ws) return;

    const force_lowercase = formData.get("force_lowercase") === "on";
    const strip_accents = formData.get("strip_accents") === "on";
    const replace_spaces_with = String(formData.get("replace_spaces_with") || "_") || "_";

    const rawSources = String(formData.get("allowed_sources") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const rawMediums = String(formData.get("allowed_mediums") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const nextRulesBase: Rules = {
      force_lowercase,
      strip_accents,
      replace_spaces_with,
      allowed_sources: [],
      allowed_mediums: [],
    };

    const allowed_sources = rawSources.map((v) => sanitize(v, nextRulesBase));
    const allowed_mediums = rawMediums.map((v) => sanitize(v, nextRulesBase));

    await supabase
      .from("taxonomy_rules")
      .update({
        force_lowercase,
        strip_accents,
        replace_spaces_with,
        allowed_sources,
        allowed_mediums,
      })
      .eq("workspace_id", ws.id);
  }

  return (
    <form action={save} className="space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold">Regras</h1>

      <div className="border rounded p-4 space-y-2">
        <div className="text-sm text-gray-600">Workspace</div>
        <div className="font-medium">{ws.name}</div>
        <div className="text-sm text-gray-600">Plano: {ws.plan}</div>
      </div>

      <label className="flex gap-2 items-center">
        <input name="force_lowercase" type="checkbox" defaultChecked={rules?.force_lowercase} />
        Forçar minúsculas
      </label>

      <label className="flex gap-2 items-center">
        <input name="strip_accents" type="checkbox" defaultChecked={rules?.strip_accents} />
        Remover acentos
      </label>

      <div className="space-y-1">
        <label className="text-sm">Substituir espaços por</label>
        <input
          name="replace_spaces_with"
          className="border rounded p-2 w-full"
          defaultValue={rules?.replace_spaces_with ?? "_"}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm">Sources permitidos (separados por vírgula)</label>
        <input
          name="allowed_sources"
          className="border rounded p-2 w-full"
          defaultValue={(rules?.allowed_sources ?? []).join(",")}
        />
        <div className="text-xs text-gray-500">
          Se vazio, não valida (aceita qualquer source). Valores são sanitizados ao salvar.
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm">Mediums permitidos (separados por vírgula)</label>
        <input
          name="allowed_mediums"
          className="border rounded p-2 w-full"
          defaultValue={(rules?.allowed_mediums ?? []).join(",")}
        />
      </div>

      <button className="border rounded px-3 py-2">Salvar</button>
    </form>
  );
}