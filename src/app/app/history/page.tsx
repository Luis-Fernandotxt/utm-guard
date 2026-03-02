import { createClient } from "@/lib/supabase/server";
import HistoryClient from "@/app/app/history/HistoryClient";

async function ensureWorkspace() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Não autenticado.");
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

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const { ws } = await ensureWorkspace();
  const supabase = await createClient();

  let query = supabase
    .from("links")
    .select("*")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    const safe = q.replace(/,/g, " ");
    query = query.or(`utm_campaign.ilike.%${safe}%,final_url.ilike.%${safe}%`);
  }

  const { data: links, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Histórico</h1>

      <form className="flex gap-2 max-w-xl">
        <input
          name="q"
          defaultValue={q}
          placeholder="Filtrar (campanha ou URL)"
          className="border rounded p-2 w-full"
        />
        <button className="border rounded px-3">Filtrar</button>
      </form>

      <HistoryClient links={links ?? []} />

      <div className="space-y-2">
        {(links ?? []).map((l) => (
          <div key={l.id} className="border rounded p-3">
            <div className="text-sm text-gray-600">{new Date(l.created_at).toLocaleString()}</div>
            <div className="font-medium">{l.utm_campaign}</div>
            <div className="text-sm break-all">{l.final_url}</div>
          </div>
        ))}

        {!links?.length && <div className="text-sm text-gray-600">Ainda não há links salvos.</div>}
      </div>
    </div>
  );
}