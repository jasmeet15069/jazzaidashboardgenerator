import type {
  HealthResponse,
  KnowledgeDocument,
  QueryResponse,
  TablePreview,
  TableSummary,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail || body.error || JSON.stringify(body);
  } catch {
    return res.text();
  }
}

export async function queryDashboard(query: string): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/query`, {
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
  const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

export async function getSchema(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/schema`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Schema request failed: ${res.status}`);
  }
  return res.json();
}

export async function getTables(): Promise<TableSummary[]> {
  const res = await fetch(`${API_BASE}/tables`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Tables request failed: ${res.status}`);
  }
  return res.json();
}

export async function getTablePreview(table: string, limit = 25): Promise<TablePreview> {
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(table)}/preview?limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Preview request failed: ${await readError(res)}`);
  }
  return res.json();
}

export async function getKnowledge(): Promise<KnowledgeDocument[]> {
  const res = await fetch(`${API_BASE}/knowledge`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Knowledge request failed: ${res.status}`);
  }
  return res.json();
}

export async function trainKnowledge(title: string, content: string): Promise<KnowledgeDocument> {
  const res = await fetch(`${API_BASE}/knowledge`, {
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
  const res = await fetch(`${API_BASE}/knowledge/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete failed: ${await readError(res)}`);
  }
}
