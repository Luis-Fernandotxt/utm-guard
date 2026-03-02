"use client";

import Papa from "papaparse";

export default function HistoryClient({ links }: { links: any[] }) {
  function exportCsv() {
    const rows = links.map((l) => ({
      created_at: l.created_at,
      base_url: l.base_url,
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_campaign: l.utm_campaign,
      utm_content: l.utm_content ?? "",
      utm_term: l.utm_term ?? "",
      final_url: l.final_url,
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "utm-guard-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <button className="border rounded px-3 py-2" onClick={exportCsv}>
        Exportar CSV
      </button>
      <div className="text-sm text-gray-600 self-center">
        Exporta os {links.length} itens carregados (máx. 100).
      </div>
    </div>
  );
}