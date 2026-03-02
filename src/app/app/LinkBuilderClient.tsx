"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toDataURL } from "qrcode";
import { buildFinalUrl, sanitize, validateAllowed, type Rules } from "@/lib/utm";
import { monthlyLimit } from "@/lib/plan";

type TemplateRow = {
  id: string;
  name: string;
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign_prefix: string | null;
};

type CreateLinkInput = {
  templateId: string | null;
  baseUrl: string;
  source: string;
  medium: string;
  campaignPrefix: string | null;
  campaignName: string;
  content: string;
  term: string;
};

type CreateLinkResult =
  | { ok: true; link: { id: string; final_url: string } }
  | { ok: false; error: string };

function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function LinkBuilderClient(props: {
  plan: string;
  rules: Rules;
  templates: TemplateRow[];
  createLink: (input: CreateLinkInput) => Promise<CreateLinkResult>;
}) {
  const { plan, rules, templates, createLink } = props;

  const [templateId, setTemplateId] = useState<string>("");

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  const [baseUrl, setBaseUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaignPrefix, setCampaignPrefix] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Quando escolhe template, preenche campos automaticamente
  useEffect(() => {
    if (!selectedTemplate) return;
    setBaseUrl(selectedTemplate.base_url);
    setSource(selectedTemplate.utm_source);
    setMedium(selectedTemplate.utm_medium);
    setCampaignPrefix(selectedTemplate.utm_campaign_prefix ?? "");
  }, [selectedTemplate]);

  // Quando o usuário mexe em qualquer campo, limpamos mensagens antigas
  useEffect(() => {
    setMsg(null);
  }, [templateId, baseUrl, source, medium, campaignPrefix, campaignName, content, term]);

  const computed = useMemo(() => {
    const baseRaw = (selectedTemplate?.base_url ?? baseUrl).trim();
    const srcRaw = (selectedTemplate?.utm_source ?? source).trim();
    const medRaw = (selectedTemplate?.utm_medium ?? medium).trim();
    const prefixRaw = (selectedTemplate?.utm_campaign_prefix ?? campaignPrefix ?? "").trim();
    const campaignRaw = campaignName.trim();
    const contentRaw = content.trim();
    const termRaw = term.trim();

    if (!baseRaw) return { ok: false as const, error: "Preencha a Base URL." };
    if (!isValidHttpUrl(baseRaw)) return { ok: false as const, error: "Base URL inválida. Use https://..." };

    if (!srcRaw) return { ok: false as const, error: "Preencha utm_source." };
    if (!medRaw) return { ok: false as const, error: "Preencha utm_medium." };
    if (!campaignRaw) return { ok: false as const, error: "Campanha é obrigatória." };

    const utm_source = sanitize(srcRaw, rules);
    const utm_medium = sanitize(medRaw, rules);

    try {
      validateAllowed(utm_source, rules.allowed_sources, "utm_source");
      validateAllowed(utm_medium, rules.allowed_mediums, "utm_medium");
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }

    const combinedCampaign = prefixRaw ? `${prefixRaw} ${campaignRaw}` : campaignRaw;
    const utm_campaign = sanitize(combinedCampaign, rules);
    const utm_content = contentRaw ? sanitize(contentRaw, rules) : "";
    const utm_term = termRaw ? sanitize(termRaw, rules) : "";

    const final_url = buildFinalUrl(baseRaw, {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    });

    return {
      ok: true as const,
      final_url,
      sanitized: { utm_source, utm_medium, utm_campaign, utm_content, utm_term },
    };
  }, [baseUrl, source, medium, campaignPrefix, campaignName, content, term, selectedTemplate, rules]);

  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!computed.ok) {
        setQrDataUrl("");
        return;
      }
      try {
        const d = await toDataURL(computed.final_url, { margin: 1, width: 220 });
        if (!cancelled) setQrDataUrl(d);
      } catch {
        if (!cancelled) setQrDataUrl("");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [computed]);

  async function onCopy() {
    if (!computed.ok) return;
    await navigator.clipboard.writeText(computed.final_url);
    setMsg("Copiado para a área de transferência!");
  }

  function currentInput(): CreateLinkInput {
    return {
      templateId: templateId || null,
      baseUrl,
      source,
      medium,
      campaignPrefix: campaignPrefix || null,
      campaignName,
      content,
      term,
    };
  }

  async function onSave() {
    if (!computed.ok) {
      setMsg(computed.error);
      return;
    }

    startSaving(async () => {
      const res = await createLink(currentInput());
      if (!res.ok) setMsg(res.error);
      else setMsg("Salvo no histórico!");
    });
  }

  const limit = monthlyLimit(plan);

  return (
    <div className="border rounded-lg p-4 space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-medium">Link Builder</div>
          <div className="text-sm text-gray-600">
            Plano: <span className="font-medium">{plan}</span>
            {limit !== null ? ` (limite: ${limit}/mês)` : " (sem limite mensal)"}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm">Template (opcional)</label>
        <select className="border rounded p-2 w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">— Sem template —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="text-xs text-gray-500">
          Se escolher template, base_url / source / medium / prefixo vêm do template.
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm">Base URL</label>
        <input
          className="border rounded p-2 w-full"
          placeholder="https://exemplo.com/pagina"
          value={selectedTemplate?.base_url ?? baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={!!selectedTemplate}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm">utm_source</label>
          <input
            className="border rounded p-2 w-full"
            placeholder="ex: facebook"
            value={selectedTemplate?.utm_source ?? source}
            onChange={(e) => setSource(e.target.value)}
            disabled={!!selectedTemplate}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">utm_medium</label>
          <input
            className="border rounded p-2 w-full"
            placeholder="ex: cpc"
            value={selectedTemplate?.utm_medium ?? medium}
            onChange={(e) => setMedium(e.target.value)}
            disabled={!!selectedTemplate}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm">Prefixo de campanha (opcional)</label>
        <input
          className="border rounded p-2 w-full"
          placeholder="ex: cliente_x_ig"
          value={selectedTemplate?.utm_campaign_prefix ?? campaignPrefix}
          onChange={(e) => setCampaignPrefix(e.target.value)}
          disabled={!!selectedTemplate}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm">Nome da campanha (obrigatório)</label>
        <input
          className="border rounded p-2 w-full"
          placeholder="ex: promo_marco"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm">utm_content (opcional)</label>
          <input
            className="border rounded p-2 w-full"
            placeholder="ex: criativo_a"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">utm_term (opcional)</label>
          <input
            className="border rounded p-2 w-full"
            placeholder="ex: palavra_chave"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded p-3 space-y-2">
        <div className="text-sm font-medium">Preview</div>

        {!computed.ok ? (
          <div className="text-sm text-red-600">{computed.error}</div>
        ) : (
          <>
            <div className="text-xs text-gray-500">Sanitizado:</div>
            <div className="text-sm text-gray-700">
              <div>source: <span className="font-mono">{computed.sanitized.utm_source}</span></div>
              <div>medium: <span className="font-mono">{computed.sanitized.utm_medium}</span></div>
              <div>campaign: <span className="font-mono">{computed.sanitized.utm_campaign}</span></div>
              {computed.sanitized.utm_content && (
                <div>content: <span className="font-mono">{computed.sanitized.utm_content}</span></div>
              )}
              {computed.sanitized.utm_term && (
                <div>term: <span className="font-mono">{computed.sanitized.utm_term}</span></div>
              )}
            </div>

            <div className="pt-2 text-sm font-medium">URL final</div>
            <div className="text-sm break-all">{computed.final_url}</div>

            <div className="flex gap-2 flex-wrap pt-2">
              <button onClick={onCopy} className="border rounded px-3 py-2">
                Copiar link
              </button>
              <button onClick={onSave} disabled={saving} className="border rounded px-3 py-2">
                {saving ? "Salvando..." : "Salvar no histórico"}
              </button>
            </div>

            {qrDataUrl && (
              <div className="pt-3">
                <div className="text-xs text-gray-500 pb-1">QR Code (opcional)</div>
                <img src={qrDataUrl} alt="QR code" className="border rounded" />
              </div>
            )}
          </>
        )}
      </div>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}