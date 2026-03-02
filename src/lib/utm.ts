export type Rules = {
  force_lowercase: boolean;
  strip_accents: boolean;
  replace_spaces_with: string;
  allowed_sources: string[];
  allowed_mediums: string[];
};

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function sanitize(value: string, rules: Rules) {
  let v = value.trim();
  if (rules.strip_accents) v = stripAccents(v);
  v = v.replace(/\s+/g, rules.replace_spaces_with);
  v = v.replace(/[^a-zA-Z0-9_\-\.]/g, "");
  if (rules.force_lowercase) v = v.toLowerCase();
  return v;
}

export function validateAllowed(value: string, allowed: string[], field: string) {
  if (!allowed || allowed.length === 0) return;
  if (!allowed.includes(value)) {
    throw new Error(`${field} inválido. Valores permitidos: ${allowed.join(", ")}`);
  }
}

export function buildFinalUrl(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function monthRangeUTC(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}