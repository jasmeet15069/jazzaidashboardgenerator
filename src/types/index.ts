export interface ChartConfig {
  type: "line" | "bar" | "pie" | "donut" | "kpi" | "area" | "scatter";
  title: string;
  description?: string;
  x: string;
  y: string;
  color_field?: string;
}

export interface QueryResponse {
  sql: string;
  data: Record<string, unknown>[];
  charts: ChartConfig[];
  summary: string;
  error?: string | null;
}

export interface HealthResponse {
  status: string;
  database: string;
  rag: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key?: boolean;
  autoincrement?: boolean;
}

export interface TableSummary {
  name: string;
  column_count: number;
  columns: ColumnInfo[];
}

export interface TablePreview {
  table: string;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  limit: number;
}

export interface RowMutationResponse {
  table: string;
  row: Record<string, unknown>;
  deleted?: boolean;
}

export interface TableDropResponse {
  table: string;
  deleted: boolean;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  created_at: string;
  char_count: number;
  preview: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: QueryResponse;
  timestamp: Date;
  loading?: boolean;
}
