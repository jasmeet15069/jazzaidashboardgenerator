import type {
  HealthResponse,
  KnowledgeDocument,
  QueryResponse,
  RowMutationResponse,
  TableDropResponse,
  TableImportResponse,
  TablePreview,
  TableSummary,
} from "@/types";

function normalizeApiBase(value?: string): string {
  const fallback = "https://45.79.124.28.sslip.io";

  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  const withoutLeadingSlashes = trimmed.replace(/^[\\/]+/, "");
  const normalized = withoutLeadingSlashes.startsWith("http")
    ? withoutLeadingSlashes
    : `https://${withoutLeadingSlashes}`;

  return normalized.replace(/\/+$/, "");
}

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.clone().json();
    return body.detail || body.error || JSON.stringify(body);
  } catch {
    try {
      return await res.clone().text();
    } catch {
      return `Request failed with status ${res.status}`;
    }
  }
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${input}`, init);
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE}. Check NEXT_PUBLIC_API_URL and redeploy.`);
  }
}

export async function queryDashboard(query: string): Promise<QueryResponse> {
  const res = await apiFetch("/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await readError(res)}`);
  }

  return res.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await apiFetch("/health", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

export async function getSchema(): Promise<Record<string, unknown>> {
  const res = await apiFetch("/schema", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Schema request failed: ${res.status}`);
  }
  return res.json();
}

export async function getTables(): Promise<TableSummary[]> {
  const res = await apiFetch("/tables", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Tables request failed: ${res.status}`);
  }
  return res.json();
}

export async function getTablePreview(table: string, limit = 25): Promise<TablePreview> {
  const res = await apiFetch(`/tables/${encodeURIComponent(table)}/preview?limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Preview request failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function createTableRow(
  table: string,
  values: Record<string, unknown>,
): Promise<RowMutationResponse> {
  const res = await apiFetch(`/tables/${encodeURIComponent(table)}/rows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(`Create failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function updateTableRow(
  table: string,
  rowId: string,
  values: Record<string, unknown>,
): Promise<RowMutationResponse> {
  const res = await apiFetch(`/tables/${encodeURIComponent(table)}/rows/${encodeURIComponent(rowId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(`Update failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function deleteTableRow(table: string, rowId: string): Promise<RowMutationResponse> {
  const res = await apiFetch(`/tables/${encodeURIComponent(table)}/rows/${encodeURIComponent(rowId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function dropTable(table: string, confirmName: string): Promise<TableDropResponse> {
  const res = await apiFetch(`/tables/${encodeURIComponent(table)}/drop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm_name: confirmName }),
  });
  if (!res.ok) {
    throw new Error(`Drop table failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function importTableFile(table: string, file: File): Promise<TableImportResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`/tables/${encodeURIComponent(table)}/import`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Import failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function importNewTableFile(tableName: string, file: File): Promise<TableImportResponse> {
  const formData = new FormData();
  formData.append("table_name", tableName);
  formData.append("file", file);

  const res = await apiFetch("/tables/import-new", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Import failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function getKnowledge(): Promise<KnowledgeDocument[]> {
  const res = await apiFetch("/knowledge", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Knowledge request failed: ${res.status}`);
  }
  return res.json();
}

export async function trainKnowledge(title: string, content: string): Promise<KnowledgeDocument> {
  const res = await apiFetch("/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) {
    throw new Error(`Training failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function deleteKnowledge(id: string): Promise<void> {
  const res = await apiFetch(`/knowledge/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete failed: ${await readError(res)}`);
  }
}
