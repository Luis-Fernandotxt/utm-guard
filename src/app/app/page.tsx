export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { monthRangeUTC, sanitize, validateAllowed, buildFinalUrl, type Rules } from "@/lib/utm";
import { monthlyLimit } from "@/lib/plan";
import LinkBuilderClient from "./LinkBuilderClient";

type TemplateRow = {
  id: string;
  name: string;
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign_prefix: string | null;
};

async function loadWorkspaceContext() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false as const, error: "Não autenticado." };
  }
  const user = userData.user;

  const { data: wsList, error: wsErr } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (wsErr) return { ok: false as const, error: wsErr.message };

  let ws = wsList?.[0];

  if (!ws) {
    const { data: created, error } = await supabase
      .from("workspaces")
      .insert({ owner_user_id: user.id, name: "Meu Workspace", plan: "free" })
      .select("*")
      .single();
    if (error) return { ok: false as const, error: error.message };
    ws = created;

    const { error: rulesInsertErr } = await supabase.from("taxonomy_rules").insert({
      workspace_id: ws.id,
      force_lowercase: true,
      strip_accents: true,
      replace_spaces_with: "_",
      allowed_sources: [],
      allowed_mediums: [],
    });
    if (rulesInsertErr) return { ok: false as const, error: rulesInsertErr.message };
  }

  const { data: rulesRow, error: rulesErr } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .maybeSingle();

  if (rulesErr) return { ok: false as const, error: rulesErr.message };

  if (!rulesRow) {
    const { error: rulesInsertErr } = await supabase.from("taxonomy_rules").insert({
      workspace_id: ws.id,
      force_lowercase: true,
      strip_accents: true,
      replace_spaces_with: "_",
      allowed_sources: [],
      allowed_mediums: [],
    });
    if (rulesInsertErr) return { ok: false as const, error: rulesInsertErr.message };
  }

  const { data: rulesRow2, error: rulesErr2 } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .single();

  if (rulesErr2) return { ok: false as const, error: rulesErr2.message };

  const rules: Rules = {
    force_lowercase: rulesRow2.force_lowercase,
    strip_accents: rulesRow2.strip_accents,
    replace_spaces_with: rulesRow2.replace_spaces_with,
    allowed_sources: rulesRow2.allowed_sources ?? [],
    allowed_mediums: rulesRow2.allowed_mediums ?? [],
  };

  const { data: templates, error: tmplErr } = await supabase
    .from("templates")
    .select("*")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false });

  if (tmplErr) return { ok: false as const, error: tmplErr.message };

  return { ok: true as const, ws, user, rules, templates: (templates ?? []) as TemplateRow[] };
}

export default async function AppHome() {
  const ctx = await loadWorkspaceContext();

  if (!ctx.ok) {
    return (
      <div className="space-y-3 max-w-2xl">
        <h1 className="text-xl font-semibold">Gerar UTM</h1>
        <div className="border rounded p-4">
          <div className="font-medium">Erro ao carregar /app</div>
          <div className="text-sm text-gray-600 break-all">{ctx.error}</div>
          <div className="text-sm text-gray-600 pt-2">
            Se isso persistir: limpe cookies do localhost e reinicie o dev server.
          </div>
        </div>
      </div>
    );
  }

  const { ws, rules, templates } = ctx;

  async function createLink(input: {
    templateId: string | null;
    baseUrl: string;
    source: string;
    medium: string;
    campaignPrefix: string | null;
    campaignName: string;
    content: string;
    term: string;
  }) {
    "use server";
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { ok: false as const, error: "Não autenticado." };

    const { data: wsList, error: wsErr } = await supabase
      .from("workspaces")
      .select("*")
      .eq("owner_user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (wsErr || !wsList?.[0]) return { ok: false as const, error: "Workspace não encontrado." };
    const ws = wsList[0];

    const { data: rulesRow, error: rulesErr } = await supabase
      .from("taxonomy_rules")
      .select("*")
      .eq("workspace_id", ws.id)
      .single();
    if (rulesErr) return { ok: false as const, error: rulesErr.message };

    const rules: Rules = {
      force_lowercase: rulesRow.force_lowercase,
      strip_accents: rulesRow.strip_accents,
      replace_spaces_with: rulesRow.replace_spaces_with,
      allowed_sources: rulesRow.allowed_sources ?? [],
      allowed_mediums: rulesRow.allowed_mediums ?? [],
    };

    const limit = monthlyLimit(ws.plan);
    if (limit !== null) {
      const { startISO, endISO } = monthRangeUTC();
      const { count, error: countErr } = await supabase
        .from("links")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws.id)
        .gte("created_at", startISO)
        .lt("created_at", endISO);

      if (countErr) return { ok: false as const, error: countErr.message };
      const used = count ?? 0;
      if (used >= limit) {
        return { ok: false as const, error: `Limite do plano free atingido (${limit}/mês).` };
      }
    }

    let template: TemplateRow | null = null;
    if (input.templateId) {
      const { data: t, error: tErr } = await supabase
        .from("templates")
        .select("*")
        .eq("id", input.templateId)
        .eq("workspace_id", ws.id)
        .single();
      if (tErr) return { ok: false as const, error: "Template inválido." };
      template = t as TemplateRow;
    }

    const baseUrlRaw = (template?.base_url ?? input.baseUrl).trim();
    let baseUrl: string;
    try {
      baseUrl = new URL(baseUrlRaw).toString();
    } catch {
      return { ok: false as const, error: "Base URL inválida. Use https://..." };
    }

    const sourceRaw = template?.utm_source ?? input.source;
    const mediumRaw = template?.utm_medium ?? input.medium;

    const utm_source = sanitize(sourceRaw, rules);
    const utm_medium = sanitize(mediumRaw, rules);
    try {
      validateAllowed(utm_source, rules.allowed_sources, "utm_source");
      validateAllowed(utm_medium, rules.allowed_mediums, "utm_medium");
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }

    const prefix = (template?.utm_campaign_prefix ?? input.campaignPrefix ?? "").trim();
    const campaignName = input.campaignName.trim();
    if (!campaignName) return { ok: false as const, error: "Campanha é obrigatória." };

    const campaignCombined = prefix ? `${prefix} ${campaignName}` : campaignName;
    const utm_campaign = sanitize(campaignCombined, rules);

    const utm_content = input.content ? sanitize(input.content, rules) : "";
    const utm_term = input.term ? sanitize(input.term, rules) : "";

    const final_url = buildFinalUrl(baseUrl, {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    });

    const { data: created, error } = await supabase
      .from("links")
      .insert({
        workspace_id: ws.id,
        template_id: template?.id ?? null,
        base_url: baseUrl,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content: utm_content || null,
        utm_term: utm_term || null,
        final_url,
      })
      .select("id, final_url")
      .single();

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, link: created };
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Gerar UTM</h1>
      <p className="text-sm text-gray-600">
        Use templates + regras para padronizar UTMs e evitar bagunça no relatório.
      </p>

      <LinkBuilderClient plan={ws.plan} rules={rules} templates={templates} createLink={createLink} />
    </div>
  );
}