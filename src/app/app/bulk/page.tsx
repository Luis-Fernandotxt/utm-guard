"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";

const BULK_FIELDS = ["base_url", "utm_source", "utm_medium", "campaign", "content", "term"] as const;
type BulkField = (typeof BULK_FIELDS)[number];

type BulkRow = {
  _line: number;
} & Partial<Record<BulkField, string>>;

type BulkSaveResponse = {
  ok?: number;
  fail?: number;
  errors?: { line: number; error: string }[];
  error?: string;
};

const REQUIRED_HEADERS: BulkField[] = ["base_url", "utm_source", "utm_medium", "campaign"];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function isBulkField(k: string): k is BulkField {
  return (BULK_FIELDS as readonly string[]).includes(k);
}

export default function BulkPage() {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<{ line: number; error: string }[]>([]);
  const [saving, startSaving] = useTransition();

  const preview = useMemo(() => rows.slice(0, 20), [rows]);

  function insertExample() {
    setMsg(null);
    setLineErrors([]);
    setParseError(null);
    setRows([]);
    setCsvText(
      [
        "base_url,utm_source,utm_medium,campaign,content,term",
        "https://exemplo.com/pagina,facebook,cpc,promo_marco,criativo_a,",
        "https://exemplo.com/pagina,facebook,cpc,promo_marco,criativo_b,",
      ].join("\n")
    );
  }

  async function onUploadFile(file: File | null) {
    setMsg(null);
    setLineErrors([]);
    setParseError(null);
    setRows([]);
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  function parseCsv() {
    setParseError(null);
    setMsg(null);
    setLineErrors([]);

    const trimmed = csvText.trim();
    if (!trimmed) {
      setParseError("Cole um CSV ou envie um arquivo.");
      setRows([]);
      return;
    }

    const res = Papa.parse(trimmed, { header: true, skipEmptyLines: true });
    if (res.errors?.length) {
      setParseError(res.errors[0].message);
      setRows([]);
      return;
    }

    const fields = (res.meta.fields ?? []).map(normalizeHeader);

    for (const h of REQUIRED_HEADERS) {
      if (!fields.includes(h)) {
        setParseError(`Header obrigatório ausente: ${h}`);
        setRows([]);
        return;
      }
    }

    const data = (res.data as any[]).map((r, idx) => {
      const _line = idx + 2; // header = linha 1
      const row: BulkRow = { _line };

      for (const originalKey of Object.keys(r)) {
        const nk = normalizeHeader(originalKey);
        if (!isBulkField(nk)) continue;
        row[nk] = String(r[originalKey] ?? "").trim();
      }

      return row;
    });

    setRows(data);
    setMsg(`Pré-visualização pronta: ${data.length} linhas.`);
  }

  async function saveAll() {
    setMsg(null);
    setLineErrors([]);

    if (!rows.length) {
      setMsg("Nada para salvar. Cole/Envie o CSV e clique em 'Pré-visualizar'.");
      return;
    }

    startSaving(async () => {
      const r = await fetch("/app/bulk/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const data: BulkSaveResponse = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMsg(data?.error ?? "Erro ao salvar.");
        return;
      }

      setMsg(`Concluído: ${data.ok ?? 0} ok, ${data.fail ?? 0} com erro.`);
      setLineErrors(data.errors ?? []);
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Bulk (CSV)</h1>

      <div className="border rounded p-4 space-y-3">
        <div className="text-sm text-gray-600">
          Header obrigatório: <span className="font-mono">base_url, utm_source, utm_medium, campaign</span>.
          <br />
          Opcionais: <span className="font-mono">content, term</span>.
        </div>

        <div className="flex gap-2 flex-wrap">
          <button className="border rounded px-3 py-2" type="button" onClick={insertExample}>
            Inserir exemplo
          </button>

          <label className="border rounded px-3 py-2 cursor-pointer">
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onUploadFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <textarea
          className="border rounded p-2 w-full h-44 font-mono text-sm"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="base_url,utm_source,utm_medium,campaign,content,term&#10;https://exemplo.com,facebook,cpc,promo_marco,criativo_a,"
        />

        <div className="flex gap-2 flex-wrap">
          <button className="border rounded px-3 py-2" type="button" onClick={parseCsv}>
            Pré-visualizar
          </button>
          <button className="border rounded px-3 py-2" type="button" disabled={saving} onClick={saveAll}>
            {saving ? "Salvando..." : "Salvar em lote"}
          </button>
        </div>

        {parseError && <div className="text-sm text-red-600">{parseError}</div>}
        {msg && <div className="text-sm">{msg}</div>}
      </div>

      <div className="border rounded p-4">
        <div className="font-medium text-sm pb-2">Preview (até 20 linhas)</div>
        <div className="text-sm text-gray-600 pb-2">Total: {rows.length}</div>

        <div className="space-y-2">
          {preview.map((r, i) => (
            <div key={i} className="border rounded p-2 text-sm">
              <div className="text-xs text-gray-500">Linha CSV: {r._line}</div>
              <div className="break-all">
                {r.base_url} | {r.utm_source}/{r.utm_medium} | {r.campaign} | {r.content ?? ""} | {r.term ?? ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!!lineErrors.length && (
        <div className="border rounded p-4 space-y-2">
          <div className="font-medium text-sm">Erros por linha</div>
          {lineErrors.slice(0, 50).map((e, idx) => (
            <div key={idx} className="text-sm">
              <span className="font-mono">Linha {e.line}:</span> {e.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}