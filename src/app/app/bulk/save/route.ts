import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFinalUrl, monthRangeUTC, sanitize, validateAllowed, type Rules } from "@/lib/utm";
import { monthlyLimit } from "@/lib/plan";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  const { data: wsList, error: wsErr } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_user_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (wsErr || !wsList?.[0]) return NextResponse.json({ error: "Workspace não encontrado." }, { status: 400 });
  const ws = wsList[0];

  const { data: rulesRow, error: rulesErr } = await supabase
    .from("taxonomy_rules")
    .select("*")
    .eq("workspace_id", ws.id)
    .maybeSingle();

  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 400 });

  const rules: Rules = {
    force_lowercase: rulesRow?.force_lowercase ?? true,
    strip_accents: rulesRow?.strip_accents ?? true,
    replace_spaces_with: rulesRow?.replace_spaces_with ?? "_",
    allowed_sources: rulesRow?.allowed_sources ?? [],
    allowed_mediums: rulesRow?.allowed_mediums ?? [],
  };

  const limit = monthlyLimit(ws.plan);
  let remaining = Number.MAX_SAFE_INTEGER;

  if (limit !== null) {
    const { startISO, endISO } = monthRangeUTC();
    const { count, error: countErr } = await supabase
      .from("links")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws.id)
      .gte("created_at", startISO)
      .lt("created_at", endISO);

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 400 });
    const used = count ?? 0;
    remaining = Math.max(0, limit - used);
  }

  let ok = 0;
  let fail = 0;
  const errors: { line: number; error: string }[] = [];

  for (const r of rows) {
    const line = Number(r?._line ?? -1);

    if (remaining <= 0) {
      fail++;
      errors.push({ line, error: "Limite mensal atingido para o plano atual." });
      continue;
    }

    const baseRaw = String(r?.base_url ?? "").trim();
    const srcRaw = String(r?.utm_source ?? "").trim();
    const medRaw = String(r?.utm_medium ?? "").trim();
    const campaignRaw = String(r?.campaign ?? "").trim();
    const contentRaw = String(r?.content ?? "").trim();
    const termRaw = String(r?.term ?? "").trim();

    if (!baseRaw || !srcRaw || !medRaw || !campaignRaw) {
      fail++;
      errors.push({ line, error: "Campos obrigatórios faltando (base_url, utm_source, utm_medium, campaign)." });
      continue;
    }

    let baseUrl: string;
    try {
      baseUrl = new URL(baseRaw).toString();
    } catch {
      fail++;
      errors.push({ line, error: "Base URL inválida (use https://...)." });
      continue;
    }

    try {
      const utm_source = sanitize(srcRaw, rules);
      const utm_medium = sanitize(medRaw, rules);
      validateAllowed(utm_source, rules.allowed_sources, "utm_source");
      validateAllowed(utm_medium, rules.allowed_mediums, "utm_medium");

      const utm_campaign = sanitize(campaignRaw, rules);
      const utm_content = contentRaw ? sanitize(contentRaw, rules) : "";
      const utm_term = termRaw ? sanitize(termRaw, rules) : "";

      const final_url = buildFinalUrl(baseUrl, {
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
      });

      const { error } = await supabase.from("links").insert({
        workspace_id: ws.id,
        template_id: null,
        base_url: baseUrl,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content: utm_content || null,
        utm_term: utm_term || null,
        final_url,
      });

      if (error) {
        fail++;
        errors.push({ line, error: error.message });
      } else {
        ok++;
        remaining--;
      }
    } catch (e: any) {
      fail++;
      errors.push({ line, error: String(e?.message ?? e) });
    }
  }

  return NextResponse.json({ ok, fail, errors });
}