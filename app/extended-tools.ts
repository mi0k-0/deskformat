import { diffLines, diffWordsWithSpace } from "diff";
import { dump, load } from "js-yaml";
import { marked } from "marked";
import Papa from "papaparse";
import QRCode from "qrcode";
import { format as formatSql } from "sql-formatter";

export type ExtendedToolId =
  | "timestamp"
  | "test-data"
  | "qr"
  | "image-compressor"
  | "secrets"
  | "diff"
  | "data-converter"
  | "yaml"
  | "sql"
  | "markdown";

export type TimestampZone = "local" | "utc";
export type TestDataKind = "names" | "emails" | "addresses" | "paragraphs" | "records";
export type QrFormat = "png" | "svg";
export type SqlDialect =
  | "sql"
  | "bigquery"
  | "mysql"
  | "postgresql"
  | "sqlite"
  | "transactsql";

export const extendedTools = [
  {
    id: "timestamp" as const,
    name: "Timestamp Converter",
    category: "Converters",
    description: "Convert Unix timestamps and readable dates in local time or UTC.",
    sample: "1767225600",
    quickActions: ["To Date", "To Timestamp", "Now"],
  },
  {
    id: "test-data" as const,
    name: "Test Data Generator",
    category: "Generators",
    description: "Generate names, emails, addresses, paragraphs, or JSON records.",
    sample: "5",
    quickActions: ["Generate"],
  },
  {
    id: "qr" as const,
    name: "QR Code Generator",
    category: "Generators",
    description: "Turn text or a URL into a downloadable QR code in PNG or SVG.",
    sample: "https://deskformat.example",
    quickActions: ["Generate", "Download"],
  },
  {
    id: "image-compressor" as const,
    name: "Image Compressor",
    category: "Images",
    description: "Compress, resize, and convert images to WebP, JPG, or PNG locally.",
    sample: "",
    quickActions: [],
  },
  {
    id: "secrets" as const,
    name: "Password & Token Generator",
    category: "Security",
    description: "Create strong passwords and cryptographically secure tokens on this device.",
    sample: "",
    quickActions: [],
  },
  {
    id: "diff" as const,
    name: "Diff Checker",
    category: "Text",
    description: "Compare two text blocks and highlight additions and removals.",
    sample: "DeskFormat keeps useful tools close.\nThis line stays the same.",
    quickActions: ["Compare"],
  },
  {
    id: "data-converter" as const,
    name: "JSON / CSV Converter",
    category: "Converters",
    description: "Convert JSON records to CSV or CSV rows back to JSON.",
    sample: '[{"name":"Ada","role":"Engineer"},{"name":"Grace","role":"Admiral"}]',
    quickActions: ["JSON to CSV", "CSV to JSON"],
  },
  {
    id: "yaml" as const,
    name: "YAML Studio",
    category: "Formatters",
    description: "Format YAML and convert cleanly between YAML and JSON.",
    sample: "project: DeskFormat\ntools:\n  - cron\n  - json\nenabled: true",
    quickActions: ["Format YAML", "YAML to JSON", "JSON to YAML"],
  },
  {
    id: "sql" as const,
    name: "SQL Formatter",
    category: "Formatters",
    description: "Format SQL cleanly with support for common database dialects.",
    sample: "select u.id,u.name,count(o.id) as orders from users u left join orders o on o.user_id=u.id where u.active=true group by u.id,u.name order by orders desc;",
    quickActions: ["Format"],
  },
  {
    id: "markdown" as const,
    name: "Markdown Previewer",
    category: "Formatters",
    description: "Write Markdown and inspect the rendered result or generated HTML.",
    sample: "# DeskFormat\n\nA **private** toolbox for everyday data work.\n\n- Fast\n- Local\n- Useful",
    quickActions: ["Preview", "HTML"],
  },
];

export type ExtendedToolConfig = {
  timestampZone: TimestampZone;
  testDataKind: TestDataKind;
  testDataCount: number;
  sqlDialect: SqlDialect;
};

const firstNames = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Katherine", "James", "Radia", "Ken", "Barbara"];
const lastNames = ["Lovelace", "Hopper", "Torvalds", "Hamilton", "Turing", "Johnson", "Gosling", "Perlman", "Thompson", "Liskov"];
const streets = ["Maple", "Market", "Oak", "Station", "King", "River", "Victoria", "Church", "Park", "Bridge"];
const cities = ["Bristol", "Manchester", "Leeds", "Glasgow", "Cardiff", "London", "York", "Bath"];
const loremSentences = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Integer posuere erat a ante venenatis dapibus posuere velit aliquet.",
  "Praesent commodo cursus magna, vel scelerisque nisl consectetur.",
  "Donec sed odio dui, aenean lacinia bibendum nulla sed consectetur.",
  "Maecenas faucibus mollis interdum, vivamus sagittis lacus vel augue.",
];

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function makePerson(index: number) {
  const firstName = pick(firstNames);
  const lastName = pick(lastNames);
  const email = `${firstName}.${lastName}${index + 1}@example.com`.toLowerCase();
  const address = `${Math.floor(Math.random() * 220) + 1} ${pick(streets)} Street, ${pick(cities)}, ${pick(["AB", "BS", "CF", "LS", "M", "YO"])}${Math.floor(Math.random() * 9) + 1} ${Math.floor(Math.random() * 9)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
  return { id: index + 1, firstName, lastName, name: `${firstName} ${lastName}`, email, address };
}

function generateTestData(kind: TestDataKind, count: number) {
  const safeCount = Math.max(1, Math.min(100, Math.round(count)));
  if (kind === "paragraphs") {
    return Array.from({ length: safeCount }, () =>
      Array.from({ length: 4 }, () => pick(loremSentences)).join(" "),
    ).join("\n\n");
  }

  const people = Array.from({ length: safeCount }, (_, index) => makePerson(index));
  if (kind === "names") return people.map((person) => person.name).join("\n");
  if (kind === "emails") return people.map((person) => person.email).join("\n");
  if (kind === "addresses") return people.map((person) => person.address).join("\n");
  return JSON.stringify(
    people.map(({ id, name, email, address }) => ({ id, name, email, address })),
    null,
    2,
  );
}

function timestampToDate(value: string, zone: TimestampZone) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) throw new Error("Enter a Unix timestamp in seconds or milliseconds.");
  const milliseconds = Math.abs(parsed) < 1e12 ? parsed * 1000 : parsed;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error("That timestamp is outside the supported date range.");
  return zone === "utc"
    ? `${date.toISOString()}\n\nUnix seconds: ${Math.floor(milliseconds / 1000)}\nUnix milliseconds: ${milliseconds}`
    : `${date.toString()}\n\nUnix seconds: ${Math.floor(milliseconds / 1000)}\nUnix milliseconds: ${milliseconds}`;
}

function dateToTimestamp(value: string, zone: TimestampZone) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a readable date.");
  const normalized = zone === "utc" && !/(z|[+-]\d\d:\d\d)$/i.test(trimmed) ? `${trimmed}Z` : trimmed;
  const milliseconds = Date.parse(normalized);
  if (Number.isNaN(milliseconds)) throw new Error("Use a date such as 2026-01-01 12:00:00 or an ISO date.");
  return `Unix seconds: ${Math.floor(milliseconds / 1000)}\nUnix milliseconds: ${milliseconds}\nISO: ${new Date(milliseconds).toISOString()}`;
}

function currentTimestamp(zone: TimestampZone) {
  const now = new Date();
  return `${zone === "utc" ? now.toISOString() : now.toString()}\n\nUnix seconds: ${Math.floor(now.getTime() / 1000)}\nUnix milliseconds: ${now.getTime()}`;
}

function jsonToCsv(value: string) {
  const parsed = JSON.parse(value);
  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (!records.every((record) => record && typeof record === "object" && !Array.isArray(record))) {
    throw new Error("JSON to CSV expects an object or an array of objects.");
  }
  return Papa.unparse(records);
}

function csvToJson(value: string) {
  const result = Papa.parse<Record<string, unknown>>(value, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  if (result.errors.length) throw new Error(result.errors[0].message);
  return JSON.stringify(result.data, null, 2);
}

export async function runExtendedTool(
  id: ExtendedToolId,
  action: string,
  input: string,
  config: ExtendedToolConfig,
) {
  if (id === "timestamp") {
    if (action === "Now") return currentTimestamp(config.timestampZone);
    return action === "To Timestamp"
      ? dateToTimestamp(input, config.timestampZone)
      : timestampToDate(input, config.timestampZone);
  }

  if (id === "test-data") return generateTestData(config.testDataKind, config.testDataCount);
  if (id === "data-converter") return action === "CSV to JSON" ? csvToJson(input) : jsonToCsv(input);

  if (id === "yaml") {
    if (action === "JSON to YAML") return dump(JSON.parse(input), { indent: 2, lineWidth: 120, noRefs: true });
    const parsed = load(input);
    return action === "YAML to JSON"
      ? JSON.stringify(parsed, null, 2)
      : dump(parsed, { indent: 2, lineWidth: 120, noRefs: true });
  }

  if (id === "sql") {
    return formatSql(input, {
      language: config.sqlDialect,
      keywordCase: "upper",
      tabWidth: 2,
      linesBetweenQueries: 2,
    });
  }

  if (id === "markdown") return String(await marked.parse(input, { gfm: true, breaks: true }));
  return "";
}

export function markdownDocument(markdown: string) {
  const content = String(marked.parse(markdown, { gfm: true, breaks: true }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{color-scheme:light dark}body{margin:0;padding:22px;font:16px/1.6 Arial,sans-serif;color:#172026;background:#fffdfa}
    h1,h2,h3{line-height:1.2}a{color:#0f766e}pre,code{font-family:Consolas,monospace}pre{overflow:auto;padding:14px;background:#101719;color:#f5f3ea;border-radius:6px}
    blockquote{margin-left:0;padding-left:16px;border-left:4px solid #0f766e;color:#63717a}table{border-collapse:collapse}th,td{border:1px solid #d9dedb;padding:8px 10px}
    img{max-width:100%}@media(prefers-color-scheme:dark){body{color:#eef6f2;background:#18211f}a{color:#86e0d4}blockquote{color:#9aaba5}th,td{border-color:#2d3b38}}
  </style></head><body>${content}</body></html>`;
}

export function getLineDiff(before: string, after: string) {
  return diffLines(before, after);
}

export type TextDiffRow = {
  kind: "same" | "changed" | "added" | "removed";
  leftNumber: number | null;
  rightNumber: number | null;
  left: string;
  right: string;
  leftParts: ReturnType<typeof diffWordsWithSpace>;
  rightParts: ReturnType<typeof diffWordsWithSpace>;
};

type RawDiffRow = {
  kind: "same" | "added" | "removed";
  leftNumber: number | null;
  rightNumber: number | null;
  left: string;
  right: string;
};

function splitDiffLines(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
}

function comparableLine(value: string, ignoreWhitespace: boolean) {
  return ignoreWhitespace ? value.replace(/\s+/g, " ").trim() : value;
}

export function buildTextDiffRows(before: string, after: string, ignoreWhitespace = false): TextDiffRow[] {
  const leftLines = splitDiffLines(before);
  const rightLines = splitDiffLines(after);
  const leftComparable = leftLines.map((line) => comparableLine(line, ignoreWhitespace));
  const rightComparable = rightLines.map((line) => comparableLine(line, ignoreWhitespace));
  const table = Array.from({ length: leftLines.length + 1 }, () => new Uint32Array(rightLines.length + 1));

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] =
        leftComparable[leftIndex] === rightComparable[rightIndex]
          ? table[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }

  const rawRows: RawDiffRow[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    if (
      leftIndex < leftLines.length &&
      rightIndex < rightLines.length &&
      leftComparable[leftIndex] === rightComparable[rightIndex]
    ) {
      rawRows.push({
        kind: "same",
        leftNumber: leftIndex + 1,
        rightNumber: rightIndex + 1,
        left: leftLines[leftIndex],
        right: rightLines[rightIndex],
      });
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < rightLines.length &&
      (leftIndex >= leftLines.length || table[leftIndex][rightIndex + 1] > table[leftIndex + 1][rightIndex])
    ) {
      rawRows.push({
        kind: "added",
        leftNumber: null,
        rightNumber: rightIndex + 1,
        left: "",
        right: rightLines[rightIndex],
      });
      rightIndex += 1;
    } else {
      rawRows.push({
        kind: "removed",
        leftNumber: leftIndex + 1,
        rightNumber: null,
        left: leftLines[leftIndex],
        right: "",
      });
      leftIndex += 1;
    }
  }

  const rows: TextDiffRow[] = [];
  let rawIndex = 0;
  while (rawIndex < rawRows.length) {
    const row = rawRows[rawIndex];
    if (row.kind === "same") {
      rows.push({ ...row, leftParts: [], rightParts: [] });
      rawIndex += 1;
      continue;
    }

    const changedBlock: RawDiffRow[] = [];
    while (rawIndex < rawRows.length && rawRows[rawIndex].kind !== "same") {
      changedBlock.push(rawRows[rawIndex]);
      rawIndex += 1;
    }

    const removedRows = changedBlock.filter((item) => item.kind === "removed");
    const addedRows = changedBlock.filter((item) => item.kind === "added");
    const pairCount = Math.max(removedRows.length, addedRows.length);

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const removed = removedRows[pairIndex];
      const added = addedRows[pairIndex];
      if (removed && added) {
        const parts = diffWordsWithSpace(removed.left, added.right);
        rows.push({
          kind: "changed",
          leftNumber: removed.leftNumber,
          rightNumber: added.rightNumber,
          left: removed.left,
          right: added.right,
          leftParts: parts.filter((part) => !part.added),
          rightParts: parts.filter((part) => !part.removed),
        });
      } else if (removed) {
        rows.push({ ...removed, leftParts: [], rightParts: [] });
      } else if (added) {
        rows.push({ ...added, leftParts: [], rightParts: [] });
      }
    }
  }

  return rows;
}

export async function createQrAssets(value: string, size: number) {
  const text = value.trim();
  if (!text) throw new Error("Enter text or a URL for the QR code.");
  const width = Math.max(128, Math.min(1200, Math.round(size)));
  const options = {
    width,
    margin: 2,
    errorCorrectionLevel: "M" as const,
    color: { dark: "#172026ff", light: "#fffdfaff" },
  };
  const [png, svg] = await Promise.all([
    QRCode.toDataURL(text, { ...options, type: "image/png" }),
    QRCode.toString(text, { ...options, type: "svg" }),
  ]);
  return { png, svg, width };
}
