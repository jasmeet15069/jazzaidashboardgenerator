"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Database,
  Eraser,
  FileText,
  Loader2,
  MessageSquarePlus,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import ChartRenderer from "@/components/ChartRenderer";
import {
  checkHealth,
  createTableRow,
  deleteKnowledge,
  deleteTableRow,
  dropTable,
  getKnowledge,
  getTablePreview,
  getTables,
  importNewTableFile,
  importTableFile,
  queryDashboard,
  trainKnowledge,
  updateTableRow,
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

type WorkspaceTab = "tables" | "knowledge" | "viewer";
type ImportMode = "append" | "create";

const EMPTY_COLUMNS: TableSummary["columns"] = [];

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

function RowSelectorGrid({
  rows,
  rowKey,
  selectedRowId,
  onSelect,
}: {
  rows: Record<string, unknown>[];
  rowKey?: string;
  selectedRowId?: string | null;
  onSelect?: (row: Record<string, unknown>) => void;
}) {
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
          {rows.slice(0, 25).map((row, rowIndex) => {
            const currentId = rowKey ? String(row[rowKey] ?? "") : String(rowIndex);
            const selected = Boolean(selectedRowId && currentId === selectedRowId);
            return (
              <tr
                key={currentId || rowIndex}
                onClick={() => onSelect?.(row)}
                className={`border-t border-white/5 transition ${onSelect ? "cursor-pointer" : ""} ${
                  selected ? "bg-blue-500/10" : "hover:bg-white/[0.03]"
                }`}
              >
                {columns.map((column) => (
                  <td key={column} className="max-w-72 truncate px-3 py-2 text-slate-300">
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            );
          })}
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

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function summarizeContextUsage({
  tables,
  knowledge,
  messages,
  query,
}: {
  tables: TableSummary[];
  knowledge: KnowledgeDocument[];
  messages: ChatMessage[];
  query: string;
}) {
  const schemaText = JSON.stringify(
    tables.map((table) => ({
      name: table.name,
      columns: table.columns.map((column) => `${column.name}:${column.type}`),
    })),
  );
  const knowledgeText = knowledge.map((doc) => `${doc.title} ${doc.preview}`).join(" ");
  const messageText = messages.map((message) => `${message.role}:${message.content}`).join(" ");
  const used = estimateTokens([schemaText, knowledgeText, messageText, query].join(" "));
  const capacity = 258_000;
  const fullness = Math.min(100, Math.round((used / capacity) * 100));
  return { used, capacity, fullness };
}

function getPrimaryKeyColumn(columns: TableSummary["columns"]) {
  return columns.find((column) => column.primary_key) ?? null;
}

export default function HomeClient() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableFilter, setTableFilter] = useState("");
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
  const [rowDraft, setRowDraft] = useState<Record<string, string>>({});
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [crudLoading, setCrudLoading] = useState(false);
  const [crudMessage, setCrudMessage] = useState<string | null>(null);
  const [dropConfirmName, setDropConfirmName] = useState("");
  const [dropLoading, setDropLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [newTableName, setNewTableName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("tables");
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const quickPrompts = [
    selectedTable ? `Show top metrics from ${selectedTable}` : "Show top metrics from the current table",
    selectedTable ? `Find monthly trends in ${selectedTable}` : "Find monthly trends in the data",
    selectedTable ? `What anomalies exist in ${selectedTable}?` : "What anomalies exist in this data?",
  ];

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

  function applyPrompt(text: string) {
    setQuery(text);
    requestAnimationFrame(() => queryRef.current?.focus());
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setQuery("");
    requestAnimationFrame(() => queryRef.current?.focus());
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuery();
    }
  }

  function buildEmptyDraft(columns: TableSummary["columns"]) {
    return Object.fromEntries(
      columns
        .filter((column) => !(column.primary_key && column.autoincrement))
        .map((column) => [column.name, ""]),
    );
  }

  function fillDraftFromRow(columns: TableSummary["columns"], row: Record<string, unknown>) {
    return Object.fromEntries(
      columns
        .filter((column) => !(column.primary_key && column.autoincrement))
        .map((column) => [column.name, row[column.name] == null ? "" : String(row[column.name])]),
    );
  }

  const selectedColumns = tables.find((table) => table.name === selectedTable)?.columns ?? EMPTY_COLUMNS;
  const primaryKeyColumn = getPrimaryKeyColumn(selectedColumns);

  function selectPreviewRow(row: Record<string, unknown>) {
    const pkColumn = getPrimaryKeyColumn(selectedColumns);
    if (!pkColumn) return;
    setSelectedRowId(String(row[pkColumn.name] ?? ""));
    setRowDraft(fillDraftFromRow(selectedColumns, row));
    setCrudMessage(null);
  }

  function resetRowEditor() {
    setSelectedRowId(null);
    setCrudMessage(null);
    setRowDraft(buildEmptyDraft(selectedColumns));
  }

  async function removeTable() {
    if (!selectedTable) return;
    setDropLoading(true);
    setError(null);
    setCrudMessage(null);
    try {
      await dropTable(selectedTable, dropConfirmName);
      setCrudMessage(`Table ${selectedTable} deleted.`);
      setDropConfirmName("");
      setSelectedTable("");
      setSelectedRowId(null);
      setPreview(null);
      setWorkspaceTab("tables");
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drop table failed");
    } finally {
      setDropLoading(false);
    }
  }

  async function handleTableImport() {
    const trimmedTableName = newTableName.trim();
    if (!importFile) return;
    if (importMode === "append" && !selectedTable) return;
    if (importMode === "create" && !trimmedTableName) return;

    setImportLoading(true);
    setError(null);
    setCrudMessage(null);
    try {
      const result =
        importMode === "create"
          ? await importNewTableFile(trimmedTableName, importFile)
          : await importTableFile(selectedTable, importFile);

      setCrudMessage(
        result.created
          ? `${result.table} created with ${result.inserted_count} imported rows.`
          : `${result.inserted_count} rows imported into ${result.table}.`,
      );
      setImportFile(null);
      setNewTableName("");
      await refreshWorkspace();
      setSelectedTable(result.table);
      setSelectedRowId(null);
      await loadPreview(result.table);
      setWorkspaceTab("viewer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!workspaceOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workspaceOpen]);

  useEffect(() => {
    setRowDraft(buildEmptyDraft(selectedColumns));
    setSelectedRowId(null);
    setCrudMessage(null);
    setDropConfirmName("");
  }, [selectedTable, tables.length]);

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
          item.id === assistantId ? { ...item, content: message, error: message, loading: false } : item,
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

  async function createRow() {
    if (!selectedTable) return;
    setCrudLoading(true);
    setError(null);
    setCrudMessage(null);
    try {
      await createTableRow(selectedTable, rowDraft);
      await loadPreview(selectedTable);
      setCrudMessage("Row inserted.");
      resetRowEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCrudLoading(false);
    }
  }

  async function updateRow() {
    if (!selectedTable || !selectedRowId) return;
    setCrudLoading(true);
    setError(null);
    setCrudMessage(null);
    try {
      await updateTableRow(selectedTable, selectedRowId, rowDraft);
      await loadPreview(selectedTable);
      setCrudMessage("Row updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setCrudLoading(false);
    }
  }

  async function removeRow() {
    if (!selectedTable || !selectedRowId) return;
    setCrudLoading(true);
    setError(null);
    setCrudMessage(null);
    try {
      await deleteTableRow(selectedTable, selectedRowId);
      await loadPreview(selectedTable);
      setCrudMessage("Row deleted.");
      resetRowEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setCrudLoading(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocTitle(file.name);
    setDocContent(await file.text());
    event.target.value = "";
  }

  const filteredTables = tables.filter((table) => {
    const needle = tableFilter.trim().toLowerCase();
    if (!needle) return true;
    return (
      table.name.toLowerCase().includes(needle) ||
      table.columns.some((column) => column.name.toLowerCase().includes(needle))
    );
  });
  const contextWindow = summarizeContextUsage({ tables, knowledge, messages, query });

  return (
    <main className="min-h-screen bg-[#0b0d10] text-white">
      <div className="min-h-screen">
        <section className="flex min-h-screen flex-col">
          <header className="border-b border-white/10 bg-[#0f1318] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen(true)}
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
                  onClick={clearChat}
                  disabled={!messages.length && !query}
                  aria-label="Clear chat"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-blue-300/40 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Clear chat"
                >
                  <Eraser className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill health={health} />
                {selectedTable && (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                    <Table2 className="h-3.5 w-3.5 text-emerald-300" />
                    <span>{selectedTable}</span>
                  </div>
                )}
                <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                  <FileText className="h-3.5 w-3.5 text-blue-300" />
                  <span>{knowledge.length} knowledge docs</span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                    <span>Context window</span>
                    <span className="text-slate-500">{contextWindow.fullness}% full</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {contextWindow.used.toLocaleString()} / {contextWindow.capacity.toLocaleString()} tokens used
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {!messages.length && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-400/10 text-blue-200">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold">Ready</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {selectedTable ? `Current table: ${selectedTable}` : "Schema loaded from the SQL connection."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                      Ask for KPIs, trends, comparisons, anomalies, or SQL explanations
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => applyPrompt(prompt)}
                        className="rounded-xl border border-white/10 bg-[#11151b] px-4 py-4 text-left transition hover:border-blue-300/30 hover:bg-white/[0.05]"
                      >
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <MessageSquarePlus className="h-3.5 w-3.5 text-blue-300" />
                          Prompt
                        </div>
                        <p className="text-sm leading-6 text-slate-200">{prompt}</p>
                      </button>
                    ))}
                  </div>
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
                        <div className="mb-5 flex flex-wrap items-center gap-2">
                          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                            {message.response!.data.length} rows
                          </div>
                          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                            {message.response!.charts.length} charts
                          </div>
                          {selectedTable && (
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                              table: {selectedTable}
                            </div>
                          )}
                        </div>

                        {message.response?.analysis && (
                          <div className="mb-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thinking Layer</p>
                                <p className="mt-1 text-sm text-slate-300">
                                  Intent: <span className="text-white">{message.response.analysis.intent}</span>
                                </p>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                                confidence {Math.round((message.response.analysis.confidence || 0) * 100)}%
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Table focus</p>
                                <p className="mt-2 text-sm text-slate-200">
                                  {message.response.analysis.selected_table || "Not narrowed yet"}
                                </p>
                                {!!message.response.analysis.table_candidates?.length && (
                                  <p className="mt-2 text-xs text-slate-500">
                                    candidates: {message.response.analysis.table_candidates.join(", ")}
                                  </p>
                                )}
                              </div>
                              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Visualization</p>
                                <p className="mt-2 text-sm text-slate-200">
                                  {message.response.analysis.visualization_strategy}
                                </p>
                                <p className="mt-2 text-xs text-slate-500">
                                  knowledge context: {message.response.analysis.knowledge_used ? "used" : "not used"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Metric candidates</p>
                                <p className="mt-2 text-sm text-slate-200">
                                  {message.response.analysis.metric_candidates?.length
                                    ? message.response.analysis.metric_candidates.join(", ")
                                    : "No strong numeric match"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Dimension context</p>
                                <p className="mt-2 text-sm text-slate-200">
                                  {message.response.analysis.dimension_candidates?.length
                                    ? message.response.analysis.dimension_candidates.join(", ")
                                    : "No strong category match"}
                                </p>
                                {!!message.response.analysis.time_candidates?.length && (
                                  <p className="mt-2 text-xs text-slate-500">
                                    time: {message.response.analysis.time_candidates.join(", ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

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
                onKeyDown={handleComposerKeyDown}
                rows={2}
                className="min-h-14 flex-1 resize-none rounded-lg border border-white/10 bg-[#0b0d10] p-3 text-sm leading-5 outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
                placeholder="Ask in natural language. Press Enter to send, Shift+Enter for a new line."
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
              className="fixed inset-y-0 left-0 z-50 flex w-[min(100vw,360px)] flex-col border-r border-white/10 bg-[#11151b] shadow-2xl shadow-black/40"
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
                      onClick={() => void refreshWorkspace()}
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

                <div className="mb-4 rounded-xl border border-white/10 bg-[#0b0d10] p-1">
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { key: "tables", label: "Tables", icon: Table2 },
                      { key: "knowledge", label: "Knowledge", icon: FileText },
                      { key: "viewer", label: "Viewer", icon: Database },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = workspaceTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setWorkspaceTab(tab.key as WorkspaceTab)}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition ${
                            active ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/[0.05]"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {workspaceTab === "tables" && (
                  <section className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <Table2 className="h-3.5 w-3.5" />
                        Tables
                      </div>
                      <div className="relative mb-2">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                        <input
                          value={tableFilter}
                          onChange={(event) => setTableFilter(event.target.value)}
                          className="h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] pl-9 pr-3 text-sm outline-none focus:border-blue-400/50"
                          placeholder="Search tables or columns"
                        />
                      </div>
                      <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                        {filteredTables.map((table) => (
                          <button
                            key={table.name}
                            type="button"
                            onClick={() => {
                              setWorkspaceTab("viewer");
                              setSelectedTable(table.name);
                              setSelectedRowId(null);
                              void loadPreview(table.name);
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
                        {!filteredTables.length && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                            No tables match your search.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Import Data</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Append rows into a selected table or create a brand new SQL table from CSV/XLSX.
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-[#0b0d10] p-1">
                        {[
                          { key: "append", label: "Append rows" },
                          { key: "create", label: "Create table" },
                        ].map((option) => {
                          const active = importMode === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setImportMode(option.key as ImportMode)}
                              className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-xs font-medium transition ${
                                active ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/[0.05]"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>

                      {importMode === "append" ? (
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          {selectedTable ? (
                            <>
                              Upload rows into <span className="font-semibold text-slate-300">{selectedTable}</span>.
                            </>
                          ) : (
                            "Select a table above before importing rows."
                          )}
                        </p>
                      ) : (
                        <>
                          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-400">New Table Name</label>
                          <input
                            value={newTableName}
                            onChange={(event) => setNewTableName(event.target.value)}
                            className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-slate-100 outline-none focus:border-blue-400/50"
                            placeholder="for example sales_q1_2026"
                          />
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            We will infer columns from the uploaded file and create a new SQL table automatically.
                          </p>
                        </>
                      )}

                      <label className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm text-slate-200 transition hover:border-white/20">
                        <Upload className="h-3.5 w-3.5" />
                        {importFile ? importFile.name : "Choose CSV or XLSX"}
                        <input
                          type="file"
                          accept=".csv,.txt,.xlsx,.xlsm"
                          className="hidden"
                          onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleTableImport()}
                        disabled={
                          importLoading ||
                          !importFile ||
                          (importMode === "append" ? !selectedTable : !newTableName.trim())
                        }
                        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-blue-500 px-3 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        {importLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : importMode === "create" ? (
                          "Create table from file"
                        ) : (
                          "Import file"
                        )}
                      </button>
                    </div>

                    {selectedTable && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/8 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-200">Drop Table</p>
                        <p className="mt-1 text-xs leading-5 text-red-200/80">
                          Type <span className="font-semibold text-red-100">{selectedTable}</span> to permanently drop this table.
                        </p>
                        <input
                          value={dropConfirmName}
                          onChange={(event) => setDropConfirmName(event.target.value)}
                          className="mt-3 h-10 w-full rounded-lg border border-red-500/25 bg-[#0b0d10] px-3 text-sm text-slate-100 outline-none focus:border-red-400/50"
                          placeholder={`Type ${selectedTable}`}
                        />
                        <button
                          type="button"
                          onClick={() => void removeTable()}
                          disabled={dropLoading || dropConfirmName.trim() !== selectedTable}
                          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {dropLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Drop ${selectedTable}`}
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {workspaceTab === "viewer" && (
                  <section className="space-y-4">
                    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                      <p className="truncate text-sm font-semibold text-white">{selectedTable || "No table selected"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedColumns.length} columns
                        {primaryKeyColumn ? ` - PK ${primaryKeyColumn.name}` : ""}
                      </p>
                    </div>

                    <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-[#0b0d10]">
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
                          onClick={() => void loadPreview(selectedTable)}
                          disabled={!selectedTable || previewLoading}
                          className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-200 transition hover:border-white/20 disabled:opacity-60"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${previewLoading ? "animate-spin" : ""}`} />
                          Refresh
                        </button>
                      </div>
                      {previewLoading ? (
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                          Loading preview...
                        </div>
                      ) : preview ? (
                        <RowSelectorGrid
                          rows={preview.rows}
                          rowKey={primaryKeyColumn?.name}
                          selectedRowId={selectedRowId}
                          onSelect={selectPreviewRow}
                        />
                      ) : (
                        <RowSelectorGrid rows={[]} />
                      )}
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Row Editor</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {selectedRowId
                              ? `Editing ${primaryKeyColumn?.name ?? "row"} ${selectedRowId}`
                              : "Insert a new row or click an existing row to edit it"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={resetRowEditor}
                          className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-200 transition hover:border-white/20"
                        >
                          <Eraser className="h-3.5 w-3.5" />
                          Reset
                        </button>
                      </div>

                      <div className="space-y-3">
                        {selectedColumns
                          .filter((column) => !(column.primary_key && column.autoincrement))
                          .map((column) => (
                            <label key={column.name} className="block">
                              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-400">
                                <span>{column.name}</span>
                                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-500">
                                  {column.type}
                                </span>
                                {column.nullable && <span className="text-[10px] text-slate-500">nullable</span>}
                              </div>
                              <input
                                value={rowDraft[column.name] ?? ""}
                                onChange={(event) =>
                                  setRowDraft((current) => ({
                                    ...current,
                                    [column.name]: event.target.value,
                                  }))
                                }
                                className="h-10 w-full rounded-lg border border-white/10 bg-[#0b0d10] px-3 text-sm outline-none focus:border-blue-400/50"
                                placeholder={`Enter ${column.name}`}
                              />
                            </label>
                          ))}
                      </div>

                      {crudMessage && (
                        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                          {crudMessage}
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => void createRow()}
                          disabled={crudLoading || !selectedTable}
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-500 px-3 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {crudLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Insert"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateRow()}
                          disabled={crudLoading || !selectedTable || !selectedRowId}
                          className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-slate-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Update
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRow()}
                          disabled={crudLoading || !selectedTable || !selectedRowId}
                          className="inline-flex h-10 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {workspaceTab === "knowledge" && (
                  <section className="space-y-4">
                    <div>
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
                          onClick={() => void submitKnowledge()}
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
                    </div>

                    <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                      {knowledge.map((doc) => (
                        <div key={doc.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">{doc.title}</p>
                              <p className="mt-1 text-xs text-slate-500">{doc.char_count} chars</p>
                              {doc.preview && (
                                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{doc.preview}</p>
                              )}
                              {doc.created_at && (
                                <p className="mt-2 text-[11px] text-slate-500">{formatDate(doc.created_at)}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void removeKnowledge(doc.id)}
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
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}
