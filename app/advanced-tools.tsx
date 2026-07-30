"use client";

import { useEffect, useMemo, useState } from "react";
import Ajv from "ajv";
import { CronExpressionParser } from "cron-parser";
import { dump, load } from "js-yaml";
import { JSONPath } from "jsonpath-plus";
import Papa from "papaparse";

export type PaletteTool = {
  id: string;
  name: string;
  category: string;
  description: string;
};

export type PipelineStep =
  | "base64-decode"
  | "base64-encode"
  | "json-format"
  | "json-minify"
  | "json-csv"
  | "csv-json"
  | "yaml-json"
  | "json-yaml"
  | "url-decode"
  | "url-encode";

const pipelineOperations: Array<{ id: PipelineStep; name: string }> = [
  { id: "base64-decode", name: "Base64 Decode" },
  { id: "base64-encode", name: "Base64 Encode" },
  { id: "json-format", name: "JSON Format" },
  { id: "json-minify", name: "JSON Minify" },
  { id: "json-csv", name: "JSON to CSV" },
  { id: "csv-json", name: "CSV to JSON" },
  { id: "yaml-json", name: "YAML to JSON" },
  { id: "json-yaml", name: "JSON to YAML" },
  { id: "url-decode", name: "URL Decode" },
  { id: "url-encode", name: "URL Encode" },
];

const pipelineStorageKey = "deskformat-pipelines";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeBase64(value: string) {
  const bytes = Uint8Array.from(atob(value.trim()), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function applyPipelineStep(value: string, step: PipelineStep) {
  if (step === "base64-decode") return decodeBase64(value);
  if (step === "base64-encode") return encodeBase64(value);
  if (step === "json-format") return JSON.stringify(JSON.parse(value), null, 2);
  if (step === "json-minify") return JSON.stringify(JSON.parse(value));
  if (step === "url-decode") return decodeURIComponent(value);
  if (step === "url-encode") return encodeURIComponent(value);
  if (step === "yaml-json") return JSON.stringify(load(value), null, 2);
  if (step === "json-yaml") return dump(JSON.parse(value), { indent: 2, lineWidth: 120, noRefs: true });
  if (step === "json-csv") {
    const parsed = JSON.parse(value);
    return Papa.unparse(Array.isArray(parsed) ? parsed : [parsed]);
  }
  const parsed = Papa.parse<Record<string, unknown>>(value, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  return JSON.stringify(parsed.data, null, 2);
}

export function CommandPalette({
  tools,
  onSelect,
}: {
  tools: PaletteTool[];
  onSelect: (toolId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools
      .filter((tool) => `${tool.name} ${tool.category} ${tool.description}`.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [query, tools]);

  if (!open) {
    return (
      <button className="command-trigger" onClick={() => setOpen(true)} title="Open command palette">
        <span>Search tools</span>
        <kbd>Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <label>
          <span>Open a tool</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                onSelect(matches[0].id);
                setOpen(false);
                setQuery("");
              }
            }}
            placeholder="Type a tool name..."
          />
        </label>
        <div className="command-results">
          {matches.map((tool) => (
            <button
              key={tool.id}
              onClick={() => {
                onSelect(tool.id);
                setOpen(false);
                setQuery("");
              }}
            >
              <span>{tool.category}</span>
              <strong>{tool.name}</strong>
              <small>{tool.description}</small>
            </button>
          ))}
          {!matches.length && <p>No matching tools.</p>}
        </div>
      </section>
    </div>
  );
}

export function PipelineBuilder({
  input,
  onResult,
  onNotice,
}: {
  input: string;
  onResult: (value: string) => void;
  onNotice: (message: string) => void;
}) {
  const [steps, setSteps] = useState<PipelineStep[]>(["base64-decode", "json-format"]);
  const [nextStep, setNextStep] = useState<PipelineStep>("json-format");
  const [recipes, setRecipes] = useState<Record<string, PipelineStep[]>>({});
  const [selectedRecipe, setSelectedRecipe] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setRecipes(JSON.parse(window.localStorage.getItem(pipelineStorageKey) ?? "{}"));
      } catch {
        setRecipes({});
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function run() {
    try {
      const result = steps.reduce((value, step) => applyPipelineStep(value, step), input);
      onResult(result);
      onNotice(`${steps.length} pipeline step${steps.length === 1 ? "" : "s"} complete.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The pipeline could not process that input.");
    }
  }

  function save() {
    const name = window.prompt("Name this pipeline");
    if (!name?.trim()) return;
    const next = { ...recipes, [name.trim()]: steps };
    setRecipes(next);
    setSelectedRecipe(name.trim());
    window.localStorage.setItem(pipelineStorageKey, JSON.stringify(next));
    onNotice(`${name.trim()} saved on this device.`);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <section className="pipeline-builder" aria-label="Tool pipeline builder">
      <header>
        <div>
          <strong>Recipe</strong>
          <span>Input flows through each step from top to bottom.</span>
        </div>
        <div className="pipeline-saved">
          <select
            aria-label="Saved pipelines"
            value={selectedRecipe}
            onChange={(event) => {
              const name = event.target.value;
              setSelectedRecipe(name);
              if (recipes[name]) setSteps(recipes[name]);
            }}
          >
            <option value="">Saved pipelines</option>
            {Object.keys(recipes).map((name) => <option key={name}>{name}</option>)}
          </select>
          <button className="utility-action" onClick={save}>Save</button>
        </div>
      </header>

      <div className="pipeline-steps">
        {steps.map((step, index) => (
          <div className="pipeline-step" key={`${step}-${index}`}>
            <span>{index + 1}</span>
            <strong>{pipelineOperations.find((operation) => operation.id === step)?.name}</strong>
            <button title="Move up" aria-label={`Move step ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
            <button title="Move down" aria-label={`Move step ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
            <button title="Remove" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>
        ))}
        {!steps.length && <p>Add an operation to begin.</p>}
      </div>

      <footer>
        <select aria-label="Pipeline operation" value={nextStep} onChange={(event) => setNextStep(event.target.value as PipelineStep)}>
          {pipelineOperations.map((operation) => <option value={operation.id} key={operation.id}>{operation.name}</option>)}
        </select>
        <button className="utility-action" onClick={() => setSteps((current) => [...current, nextStep])}>Add step</button>
        <button className="primary-action" onClick={run} disabled={!steps.length}>Run pipeline</button>
      </footer>
    </section>
  );
}

function JsonNode({ name, value, depth = 0 }: { name?: string; value: unknown; depth?: number }) {
  const label = name === undefined ? "root" : name;
  if (value === null || typeof value !== "object") {
    return (
      <div className="json-leaf" style={{ paddingLeft: `${depth * 14}px` }}>
        <span>{label}</span>
        <code>{JSON.stringify(value)}</code>
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <details className="json-branch" open={depth < 2} style={{ marginLeft: `${depth * 10}px` }}>
      <summary>{label} <small>{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</small></summary>
      {entries.map(([key, item]) => <JsonNode key={key} name={key} value={item} depth={depth + 1} />)}
    </details>
  );
}

export function JsonStudioPanel({
  input,
  onOutput,
  onNotice,
}: {
  input: string;
  onOutput: (value: string) => void;
  onNotice: (message: string) => void;
}) {
  const [path, setPath] = useState("$");
  const [schema, setSchema] = useState('{\n  "type": "object"\n}');
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(input), error: "" };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" };
    }
  }, [input]);

  function searchPath() {
    if (parsed.error) return onNotice(formatLocatedError(new Error(parsed.error), input));
    try {
      const result = JSONPath({ path, json: parsed.value as object });
      onOutput(JSON.stringify(result, null, 2));
      onNotice(`${result.length} JSONPath result${result.length === 1 ? "" : "s"} found.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "That JSONPath could not be evaluated.");
    }
  }

  function validateSchema() {
    if (parsed.error) return onNotice(formatLocatedError(new Error(parsed.error), input));
    try {
      const validator = new Ajv({ allErrors: true }).compile(JSON.parse(schema));
      const valid = validator(parsed.value);
      onOutput(valid ? "Valid against schema." : JSON.stringify(validator.errors, null, 2));
      onNotice(valid ? "Schema validation passed." : `${validator.errors?.length ?? 0} schema issue(s) found.`);
    } catch (error) {
      onNotice(formatLocatedError(error, schema));
    }
  }

  return (
    <section className="json-inspector" aria-label="JSON tree and validation tools">
      <div className="json-query">
        <label>
          JSONPath
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="$.items[*].name" />
        </label>
        <button className="utility-action" onClick={searchPath}>Run query</button>
      </div>
      <div className="json-tree">
        <span className="panel-label">Tree view</span>
        {parsed.error ? <p>{formatLocatedError(new Error(parsed.error), input)}</p> : <JsonNode value={parsed.value} />}
      </div>
      <label className="json-schema">
        <span>JSON Schema</span>
        <textarea value={schema} onChange={(event) => setSchema(event.target.value)} spellCheck={false} />
        <button className="utility-action" onClick={validateSchema}>Validate schema</button>
      </label>
    </section>
  );
}

export function CsvInspector({
  input,
  onOutput,
  onNotice,
}: {
  input: string;
  onOutput: (value: string) => void;
  onNotice: (message: string) => void;
}) {
  const parsed = useMemo(
    () => Papa.parse<Record<string, unknown>>(input, { header: true, dynamicTyping: true, skipEmptyLines: true }),
    [input],
  );
  const columns = parsed.meta.fields ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const activeColumns = selected.length ? selected.filter((column) => columns.includes(column)) : columns;

  function applyColumns() {
    const rows = parsed.data.map((row) => Object.fromEntries(activeColumns.map((column) => [column, row[column]])));
    onOutput(Papa.unparse(rows));
    onNotice(`${activeColumns.length} column${activeColumns.length === 1 ? "" : "s"} selected.`);
  }

  function exportExcel() {
    if (!columns.length) return;
    const rows = parsed.data.map((row) => activeColumns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join(""));
    const table = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${activeColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row}</tr>`).join("")}</tbody></table></body></html>`;
    downloadBlob(new Blob([table], { type: "application/vnd.ms-excel" }), "deskformat-data.xls");
    onNotice("Excel-compatible table downloaded.");
  }

  if (!columns.length || parsed.errors.length) return null;
  return (
    <section className="csv-inspector" aria-label="CSV table preview">
      <header>
        <div>
          <strong>Table preview</strong>
          <span>Detected delimiter: <code>{parsed.meta.delimiter === "\t" ? "Tab" : parsed.meta.delimiter}</code></span>
        </div>
        <div>
          <button className="utility-action" onClick={applyColumns}>Use columns</button>
          <button className="primary-action" onClick={exportExcel}>Export Excel</button>
        </div>
      </header>
      <div className="csv-columns">
        {columns.map((column) => (
          <label key={column}>
            <input
              type="checkbox"
              checked={activeColumns.includes(column)}
              onChange={(event) => {
                const base = selected.length ? selected : columns;
                setSelected(event.target.checked ? [...new Set([...base, column])] : base.filter((item) => item !== column));
              }}
            />
            <span>{column}</span>
          </label>
        ))}
      </div>
      <div className="csv-table-wrap">
        <table>
          <thead><tr>{activeColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {parsed.data.slice(0, 12).map((row, index) => (
              <tr key={index}>{activeColumns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function QrTemplates({ onValue }: { onValue: (value: string) => void }) {
  const [template, setTemplate] = useState("text");
  const [fields, setFields] = useState<Record<string, string>>({});
  const update = (name: string, value: string) => setFields((current) => ({ ...current, [name]: value }));

  function apply() {
    let value = fields.text ?? "";
    if (template === "wifi") value = `WIFI:T:${fields.security || "WPA"};S:${fields.ssid || ""};P:${fields.password || ""};;`;
    if (template === "email") value = `mailto:${fields.email || ""}?subject=${encodeURIComponent(fields.subject || "")}&body=${encodeURIComponent(fields.body || "")}`;
    if (template === "phone") value = `tel:${fields.phone || ""}`;
    if (template === "contact") value = `BEGIN:VCARD\nVERSION:3.0\nFN:${fields.name || ""}\nTEL:${fields.phone || ""}\nEMAIL:${fields.email || ""}\nEND:VCARD`;
    if (template === "event") value = `BEGIN:VEVENT\nSUMMARY:${fields.title || ""}\nDTSTART:${(fields.start || "").replace(/[-:]/g, "")}\nDTEND:${(fields.end || "").replace(/[-:]/g, "")}\nLOCATION:${fields.location || ""}\nEND:VEVENT`;
    onValue(value);
  }

  const field = (name: string, label: string, type = "text") => (
    <label key={name}>{label}<input type={type} value={fields[name] ?? ""} onChange={(event) => update(name, event.target.value)} /></label>
  );

  return (
    <section className="qr-templates" aria-label="QR templates">
      <label>
        Template
        <select value={template} onChange={(event) => setTemplate(event.target.value)}>
          <option value="text">Text or URL</option>
          <option value="wifi">Wi-Fi network</option>
          <option value="email">Email</option>
          <option value="phone">Telephone</option>
          <option value="contact">Contact card</option>
          <option value="event">Calendar event</option>
        </select>
      </label>
      <div className="qr-template-fields">
        {template === "text" && field("text", "Text or URL")}
        {template === "wifi" && <>{field("ssid", "Network name")}{field("password", "Password")}<label>Security<select value={fields.security ?? "WPA"} onChange={(event) => update("security", event.target.value)}><option>WPA</option><option>WEP</option><option value="nopass">None</option></select></label></>}
        {template === "email" && <>{field("email", "Email", "email")}{field("subject", "Subject")}{field("body", "Message")}</>}
        {template === "phone" && field("phone", "Telephone", "tel")}
        {template === "contact" && <>{field("name", "Name")}{field("phone", "Telephone", "tel")}{field("email", "Email", "email")}</>}
        {template === "event" && <>{field("title", "Title")}{field("start", "Starts", "datetime-local")}{field("end", "Ends", "datetime-local")}{field("location", "Location")}</>}
      </div>
      <button className="utility-action" onClick={apply}>Use template</button>
    </section>
  );
}

export type Detection = { toolId: string; label: string };

export function detectInput(value: string): Detection | null {
  const text = value.trim();
  if (!text) return null;
  try {
    JSON.parse(text);
    return { toolId: "json", label: "JSON" };
  } catch {
    // Continue through the cheaper format checks.
  }
  if (/^https?:\/\/\S+$/i.test(text)) return { toolId: "url", label: "URL" };
  if (/^\d{10,13}$/.test(text)) return { toolId: "timestamp", label: "Unix timestamp" };
  if (text.includes("\n") && /[,;\t]/.test(text.split("\n")[0])) {
    const parsed = Papa.parse(text, { preview: 3 });
    if (!parsed.errors.length && parsed.data.length > 1) return { toolId: "data-converter", label: "CSV" };
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length >= 12 && text.length % 4 === 0) {
    try {
      atob(text);
      return { toolId: "base64", label: "Base64" };
    } catch {
      // Continue to YAML detection.
    }
  }
  if (/^[\w-]+\s*:/m.test(text)) {
    try {
      const parsed = load(text);
      if (parsed && typeof parsed === "object") return { toolId: "yaml", label: "YAML" };
    } catch {
      return null;
    }
  }
  return null;
}

export function formatLocatedError(error: unknown, source: string) {
  const message = error instanceof Error ? error.message : "That input could not be processed.";
  const yamlMark = (error as { mark?: { line?: number; column?: number } })?.mark;
  if (yamlMark && typeof yamlMark.line === "number") {
    return `${message.split("\n")[0]} (line ${yamlMark.line + 1}, column ${(yamlMark.column ?? 0) + 1})`;
  }
  const lineColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumn) return message;
  const position = message.match(/position\s+(\d+)/i);
  if (!position) return message;
  const offset = Number(position[1]);
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return `${message} (line ${line}, column ${column})`;
}

export function normalizeStructuredText(value: string, syntax: "text" | "json" | "yaml") {
  if (syntax === "json") return JSON.stringify(JSON.parse(value), null, 2);
  if (syntax === "yaml") return dump(load(value), { indent: 2, lineWidth: 120, noRefs: true });
  return value;
}

export function nextCronOccurrences(expression: string, timeZone: string) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 6 && parts.length !== 7) throw new Error("Quartz expressions should have 6 or 7 fields.");
  const cron = parts.slice(0, 6).map((part) => (part === "?" ? "*" : part)).join(" ");
  const options = timeZone === "local" ? {} : { tz: timeZone };
  const interval = CronExpressionParser.parse(cron, options);
  return Array.from({ length: 10 }, () => interval.next().toDate());
}

export function cronOffsetLabel(date: Date, timeZone: string) {
  if (timeZone === "local") return date.getTimezoneOffset();
  const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;
  return part ?? timeZone;
}
