"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  PanelLeftOpen,
  PanelRightOpen,
  RefreshCw,
  Send,
  Table2,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import ChartRenderer from "@/components/ChartRenderer";
import {
  checkHealth,
  deleteKnowledge,
  getKnowledge,
  getTablePreview,
  getTables,
  queryDashboard,
  trainKnowledge,
} from "@/lib/api";
import type {
  HealthResponse,
  KnowledgeDocument,
  QueryResponse,
  TablePreview,
  TableSummary,
} from "@/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: QueryResponse;
  error?: string;
  loading?: boolean;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function StatusPill({ health }: { health: HealthResponse | null }) {
  const healthy = health?.status === "ok" && health.database === "connected";
  const Icon = healthy ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
        healthy
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
          : "border-amber-400/25 bg-amber-400/10 text-amber-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{health?.database ?? "checking"}</span>
    </div>
  );
}

function DataGrid({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No rows.</div>;
  }

  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0b0d10]">
      <table className="w-full text-left text-xs">
        <thead className="bg-white/[0.04] text-slate-400">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-white/5">
              {columns.map((column) => (
                <td key={column} className="max-w-72 truncate px-3 py-2 text-slate-300">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-[#0b0d10] p-3 text-xs leading-6 text-slate-300">
      {sql || "No SQL generated."}
    </pre>
  );
}

function hasStructuredResult(response?: QueryResponse) {
  return Boolean(response && (response.sql || response.data.length || response.charts.length));
}

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeDocument[]>([]);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refreshWorkspace() {
    setLoadingMeta(true);
    setError(null);
    try {
      const [healthResult, tablesResult, knowledgeResult] = await Promise.all([
        checkHealth(),
        getTables(),
        getKnowledge(),
      ]);
      setHealth(healthResult);
      setTables(tablesResult);
      setKnowledge(knowledgeResult);

      const nextSelected = selectedTable || tablesResult[0]?.name || "";
      if (nextSelected) {
        setSelectedTable(nextSelected);
        await loadPreview(nextSelected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace refresh failed");
    } finally {
      setLoadingMeta(false);
    }
  }

  async function loadPreview(tableName: string) {
    if (!tableName) return;
    setPreviewLoading(true);
    setError(null);
    try {
      setPreview(await getTablePreview(tableName, 25));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    refreshWorkspace();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!workspaceOpen && !viewerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceOpen(false);
        setViewerOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workspaceOpen, viewerOpen]);

  async function submitQuery(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = (queryRef.current?.value || query).trim();
    if (!text || loadingQuery) return;

    const userMessage: ChatMessage = { id: newId(), role: "user", content: text };
    const assistantId = newId();
    setMessages((items) => [
      ...items,
      userMessage,
      { id: assistantId, role: "assistant", content: "Thinking...", loading: true },
    ]);
    setQuery("");
    setLoadingQuery(true);
    setError(null);

    try {
      const response = await queryDashboard(text);
      setMessages((items) =>
        items.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: response.error ? "I could not complete that request." : response.summary || "Done.",
                response,
                error: response.error || undefined,
                loading: false,
              }
            : item,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setMessages((items) =>
        items.map((item) =>
          item.id === assistantId
            ? { ...item, content: message, error: message, loading: false }
            : item,
        ),
      );
    } finally {
      setLoadingQuery(false);
    }
  }

  async function submitKnowledge() {
    if (!docContent.trim()) return;
    setTraining(true);
    setError(null);
    try {
      const document = await trainKnowledge(docTitle, docContent);
      setKnowledge((items) => [document, ...items]);
      setDocTitle("");
      setDocContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed");
    } finally {
      setTraining(false);
    }
  }

  async function removeKnowledge(id: string) {
    setError(null);
    try {
      await deleteKnowledge(id);
      setKnowledge((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocTitle(file.name);
    setDocContent(await file.text());
    event.target.value = "";
  }

  const selectedColumns = tables.find((table) => table.name === selectedTable)?.columns ?? [];

  return (
    <main className="min-h-screen bg-[#0b0d10] text-white">
      <div className="min-h-screen">
        <section className="flex min-h-screen flex-col">
          <header className="border-b border-white/10 bg-[#0f1318] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceOpen(true);
                    setViewerOpen(false);
                  }}
                  aria-controls="sql-workspace"
                  aria-expanded={workspaceOpen}
                  aria-label="Open SQL workspace"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-blue-300/40 hover:text-blue-100"
                  title="Open SQL workspace"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-200">AI SQL Chat</p>
                  <h2 className="truncate text-lg font-semibold sm:text-xl">Ask anything in the connected database</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {loadingQuery && <Loader2 className="h-5 w-5 animate-spin text-blue-300" />}
                <button
                  type="button"
                  onClick={() => {
                    setViewerOpen(true);
                    setWorkspaceOpen(false);
                  }}
                  aria-controls="table-viewer"
                  aria-expanded={viewerOpen}
                  aria-label="Open table viewer"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-blue-300/40 hover:text-blue-100"
                  title="Open table viewer"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {!messages.length && (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-400/10 text-blue-200">
                  <Bot className="h-5 w-5" />
                </div>
                <p className="text-lg font-semibold">Ready</p>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedTable ? `Current table: ${selectedTable}` : "Schema loaded from the SQL connection."}
                </p>
              </div>
            )}

            {messages.map((message) => {
              const structured = hasStructuredResult(message.response);

              if (message.role === "assistant" && structured) {
                return (
                  <article key={message.id} className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-blue-200">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          <span>Assistant</span>
                        </div>
                        <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.content}</p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-[#161514] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
                      <ChartRenderer response={message.response!} />

                      <details className="mt-5 rounded-2xl border border-white/8 bg-black/20">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-300">
                          View SQL and data
                        </summary>
                        <div className="space-y-4 border-t border-white/8 px-4 py-4">
                          <SqlBlock sql={message.response!.sql} />
                          <DataGrid rows={message.response!.data} />
                        </div>
                      </details>
                    </div>
                  </article>
                );
              }

              return (
                <article
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-200">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[92%] rounded-2xl border p-4 ${
                      message.role === "user"
                        ? "border-blue-400/30 bg-blue-500/15"
                        : "border-white/10 bg-[#11151b]"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {message.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      {message.role}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{message.content}</p>

                    {message.loading && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking
                      </div>
                    )}

                    {message.error && (
                      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                        {message.error}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            <div ref={bottomRef} />
            </div>
          </div>

          <form onSubmit={submitQuery} className="border-t border-white/10 bg-[#0f1318] p-4">
            <div className="flex gap-3">
              <textarea
                ref={queryRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onInput={(event) => setQuery(event.currentTarget.value)}
                rows={2}
                className="min-h-14 flex-1 resize-none rounded-lg border border-white/10 bg-[#0b0d10] p-3 text-sm leading-5 outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
                placeholder="Ask in natural language"
              />
              <button
                type="submit"
                disabled={loadingQuery}
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                title="Send"
              >
                {loadingQuery ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </form>
        </section>

        {workspaceOpen && (
          <>
            <button
              type="button"
              aria-label="Dismiss workspace overlay"
              onClick={() => setWorkspaceOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-black/60"
            />
            <aside
              id="sql-workspace"
              className="fixed inset-y-0 left-0 z-50 flex w-[min(100vw,340px)] flex-col border-r border-white/10 bg-[#11151b] shadow-2xl shadow-black/40"
            >
              <div className="border-b border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-300" />
                    <h1 className="text-sm font-semibold tracking-wide">SQL Workspace</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={refreshWorkspace}
                      disabled={loadingMeta}
                      aria-label="Refresh SQL workspace"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-white/20 disabled:opacity-60"
                      title="Refresh SQL workspace"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingMeta ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceOpen(false)}
                      aria-label="Close SQL workspace"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-white/20"
                      title="Close SQL workspace"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <StatusPill health={health} />
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                    {tables.length} tables
                  </div>
                </div>

                <section className="mb-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Table2 className="h-3.5 w-3.5" />
                    Tables
                  </div>
                  <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
                    {tables.map((table) => (
                      <button
                        key={table.name}
                        type="button"
                        onClick={() => {
                          setSelectedTable(table.name);
                          loadPreview(table.name);
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedTable === table.name
                            ? "border-blue-400/40 bg-blue-400/10"
                            : "border-white/10 bg-white/[0.035] hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-white">{table.name}</span>
                          <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs text-slate-400">
                            {table.column_count}
                          </span>
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                          {table.columns.map((column) => column.name).join(", ")}
                        </div>
                      </button>
                    ))}
                    {!tables.length && (
                      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                        No tables found.
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <FileText className="h-3.5 w-3.5" />
                    Knowledge
                  </div>
                  <input
                    value={docTitle}
                    onChange={(event) => setDocTitle(event.target.value)}
                    className="mb-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm outline-none focus:border-blue-400/50"
                    placeholder="Document title"
                  />
                  <textarea
                    value={docContent}
                    onChange={(event) => setDocContent(event.target.value)}
                    className="mb-2 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-[#0b0d10] p-3 text-sm leading-5 outline-none focus:border-blue-400/50"
                    placeholder="Metric rules, joins, business definitions"
                  />
                  <div className="mb-3 flex gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:border-white/20">
                      <Upload className="h-3.5 w-3.5" />
                      File
                      <input type="file" accept=".txt,.md,.csv,.json,.sql" onChange={handleFile} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={submitKnowledge}
                      disabled={training || !docContent.trim()}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {training ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      Train
                    </button>
                  </div>
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {knowledge.map((doc) => (
                      <div key={doc.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{doc.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{doc.char_count} chars</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeKnowledge(doc.id)}
                            className="rounded-md p-1 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </aside>
          </>
        )}

        {viewerOpen && (
          <>
            <button
              type="button"
              aria-label="Dismiss table viewer overlay"
              onClick={() => setViewerOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-black/60"
            />
            <aside
              id="table-viewer"
              className="fixed inset-y-0 right-0 z-50 flex w-[min(100vw,390px)] flex-col border-l border-white/10 bg-[#11151b] shadow-2xl shadow-black/40"
            >
              <div className="border-b border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Table2 className="h-5 w-5 text-emerald-300" />
                    <h2 className="text-sm font-semibold tracking-wide">Table Viewer</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {previewLoading && <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />}
                    <button
                      type="button"
                      onClick={() => setViewerOpen(false)}
                      aria-label="Close table viewer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-white/20"
                      title="Close table viewer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <p className="truncate text-sm font-semibold text-white">{selectedTable || "No table selected"}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedColumns.length} columns</p>
                </div>

                <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#0b0d10]">
                  {selectedColumns.map((column) => (
                    <div
                      key={column.name}
                      className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2 first:border-t-0"
                    >
                      <span className="truncate text-xs font-medium text-slate-200">{column.name}</span>
                      <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-slate-500">
                        {column.type}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rows</p>
                    <button
                      type="button"
                      onClick={() => loadPreview(selectedTable)}
                      disabled={!selectedTable || previewLoading}
                      className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-200 transition hover:border-white/20 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${previewLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  </div>
                  {preview ? <DataGrid rows={preview.rows} /> : <DataGrid rows={[]} />}
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}
