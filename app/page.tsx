"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  buildTextDiffRows,
  createQrAssets,
  extendedTools,
  markdownDocument,
  runExtendedTool,
  type ExtendedToolId,
  type QrFormat,
  type SqlDialect,
  type TestDataKind,
  type TimestampZone,
} from "./extended-tools";
import {
  CommandPalette,
  CsvInspector,
  JsonStudioPanel,
  PipelineBuilder,
  QrTemplates,
  cronOffsetLabel,
  detectInput,
  formatLocatedError,
  nextCronOccurrences,
  normalizeStructuredText,
} from "./advanced-tools";
import { ClearLocalData, ImageCompressor, OfflineInstall, SecretGenerator } from "./power-tools";

type DiffPart = { value: string; added?: boolean; removed?: boolean };

function DiffContent({ parts, text, side }: { parts: DiffPart[]; text: string; side: "left" | "right" }) {
  if (!parts.length) return text || " ";
  return parts.map((part, index) => (
    <mark
      className={side === "left" && part.removed ? "word-removed" : side === "right" && part.added ? "word-added" : ""}
      key={`${index}-${part.value.length}`}
    >
      {part.value}
    </mark>
  ));
}

type ToolId =
  | ExtendedToolId
  | "image"
  | "json"
  | "xml"
  | "html"
  | "url"
  | "base64"
  | "entities"
  | "case"
  | "regex"
  | "hash"
  | "color"
  | "cron";

type Tool = {
  id: ToolId;
  name: string;
  category: string;
  description: string;
  sample: string;
  quickActions: string[];
};

type WorkspaceTab = {
  id: string;
  toolId: ToolId;
  input: string;
  output: string;
  name: string;
};

type DiffHistoryItem = {
  id: string;
  createdAt: string;
  left: string;
  right: string;
  syntax: "text" | "json" | "yaml";
};

type CronConfig = {
  preset: string;
  seconds: string;
  minutes: string;
  hours: string;
  dayMode: string;
  dayOfMonth: string;
  weekday: string;
  weekdaySet: string[];
  nth: string;
  monthMode: string;
  month: string;
  yearMode: string;
  year: string;
};

type Theme = "light" | "dark";
type ImageFormat = "png" | "jpg" | "svg";

type PlaceholderConfig = {
  width: number;
  height: number;
  background: string;
  foreground: string;
  format: ImageFormat;
  text: string;
};

const tools: Tool[] = [
  {
    id: "cron",
    name: "Cron Generator",
    category: "Generators",
    description: "Build and explain Quartz cron expressions with seven-field output.",
    sample: "0 0 12 ? * MON-FRI *",
    quickActions: ["Generate", "Describe"],
  },
  {
    id: "image",
    name: "Placeholder Image",
    category: "Generators",
    description: "Create local dummy images for mockups, wireframes, and test layouts.",
    sample: "600x400 / #0f766e / #ffffff / DeskFormat",
    quickActions: ["Generate", "Download"],
  },
  ...extendedTools,
  {
    id: "json",
    name: "JSON Studio",
    category: "Formatters",
    description: "Format, minify, validate, and inspect JSON payloads.",
    sample: '{"project":"DeskFormat","active":true,"items":[{"name":"JSON","rank":1},{"name":"URL","rank":2}]}',
    quickActions: ["Format", "Minify", "Validate", "Sort Keys"],
  },
  {
    id: "xml",
    name: "XML Formatter",
    category: "Formatters",
    description: "Pretty-print XML-ish markup for quick reading.",
    sample: "<root><tool name=\"formatter\"><enabled>true</enabled></tool></root>",
    quickActions: ["Format", "Minify"],
  },
  {
    id: "html",
    name: "HTML Cleaner",
    category: "Formatters",
    description: "Reflow, minify, and tidy HTML fragments.",
    sample: "<section><h1>Hello</h1><p>Paste markup here.</p></section>",
    quickActions: ["Format", "Minify"],
  },
  {
    id: "url",
    name: "URL Encoder",
    category: "Encoders",
    description: "Encode and decode URLs, query values, and webhook strings.",
    sample: "https://example.com/search?q=formatter desk&mode=personal",
    quickActions: ["Encode", "Decode"],
  },
  {
    id: "base64",
    name: "Base64",
    category: "Encoders",
    description: "Convert text to and from Base64.",
    sample: "Make the boring parts instant.",
    quickActions: ["Encode", "Decode"],
  },
  {
    id: "entities",
    name: "HTML Entities",
    category: "Encoders",
    description: "Escape and unescape text for HTML.",
    sample: '<button aria-label="Save & close">Save</button>',
    quickActions: ["Escape", "Unescape"],
  },
  {
    id: "case",
    name: "Case Converter",
    category: "Text",
    description: "Convert text into common developer-friendly casing.",
    sample: "personal formatter workspace",
    quickActions: ["camelCase", "PascalCase", "kebab-case", "snake_case"],
  },
  {
    id: "regex",
    name: "Regex Tester",
    category: "Text",
    description: "Test a JavaScript regular expression against pasted text.",
    sample: "alpha@example.com\nbeta@example.org\nnot-an-email",
    quickActions: ["Test"],
  },
  {
    id: "hash",
    name: "Hash Generator",
    category: "Security",
    description: "Generate SHA digests locally in your browser.",
    sample: "A small secret or file checksum seed",
    quickActions: ["SHA-256", "SHA-1"],
  },
  {
    id: "color",
    name: "Color Converter",
    category: "Design",
    description: "Convert HEX colors into RGB and HSL values.",
    sample: "#1f7a8c",
    quickActions: ["Convert"],
  },
];

const categories = ["All", ...Array.from(new Set(tools.map((tool) => tool.category)))];
const defaultToolId: ToolId = "cron";
const themeStorageKey = "deskformat-theme";
const favoriteStorageKey = "deskformat-favorites";
const recentStorageKey = "deskformat-recent";
const workspaceStorageKey = "deskformat-workspaces";
const snippetStorageKey = "deskformat-snippets";
const diffHistoryStorageKey = "deskformat-diff-history";
const weekdayNames: Record<string, string> = {
  SUN: "Sunday",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};
const monthNames: Record<string, string> = {
  JAN: "January",
  FEB: "February",
  MAR: "March",
  APR: "April",
  MAY: "May",
  JUN: "June",
  JUL: "July",
  AUG: "August",
  SEP: "September",
  OCT: "October",
  NOV: "November",
  DEC: "December",
};
const cronPresets: Record<string, Omit<CronConfig, "preset">> = {
  "Every minute": {
    seconds: "0",
    minutes: "*",
    hours: "*",
    dayMode: "daily",
    dayOfMonth: "*",
    weekday: "MON",
    weekdaySet: ["MON", "TUE", "WED", "THU", "FRI"],
    nth: "1",
    monthMode: "every",
    month: "*",
    yearMode: "any",
    year: "*",
  },
  "Every 15 minutes": {
    seconds: "0",
    minutes: "0/15",
    hours: "*",
    dayMode: "daily",
    dayOfMonth: "*",
    weekday: "MON",
    weekdaySet: ["MON", "TUE", "WED", "THU", "FRI"],
    nth: "1",
    monthMode: "every",
    month: "*",
    yearMode: "any",
    year: "*",
  },
  "Hourly": {
    seconds: "0",
    minutes: "0",
    hours: "*",
    dayMode: "daily",
    dayOfMonth: "*",
    weekday: "MON",
    weekdaySet: ["MON", "TUE", "WED", "THU", "FRI"],
    nth: "1",
    monthMode: "every",
    month: "*",
    yearMode: "any",
    year: "*",
  },
  "Daily at noon": {
    seconds: "0",
    minutes: "0",
    hours: "12",
    dayMode: "daily",
    dayOfMonth: "*",
    weekday: "MON",
    weekdaySet: ["MON", "TUE", "WED", "THU", "FRI"],
    nth: "1",
    monthMode: "every",
    month: "*",
    yearMode: "any",
    year: "*",
  },
  "Weekdays at 9am": {
    seconds: "0",
    minutes: "0",
    hours: "9",
    dayMode: "weekdays",
    dayOfMonth: "?",
    weekday: "MON",
    weekdaySet: ["MON", "TUE", "WED", "THU", "FRI"],
    nth: "1",
    monthMode: "every",
    month: "*",
    yearMode: "any",
    year: "*",
  },
  "Monthly on the 1st": {
    seconds: "0",
    minutes: "0",
    hours: "12",
    dayMode: "month-day",
    dayOfMonth: "1",
    weekday: "MON",
    weekdaySet: ["MON", "TUE", "WED", "THU", "FRI"],
    nth: "1",
    monthMode: "every",
    month: "*",
    yearMode: "any",
    year: "*",
  },
};

const defaultPlaceholder: PlaceholderConfig = {
  width: 600,
  height: 400,
  background: "#0f766e",
  foreground: "#ffffff",
  format: "png",
  text: "DeskFormat",
};

function prettyXml(value: string) {
  const compact = value.replace(/>\s+</g, "><").trim();
  if (!compact) return "";

  let depth = 0;
  return compact
    .replace(/(>)(<)(\/*)/g, "$1\n$2$3")
    .split("\n")
    .map((node) => {
      const isClosing = /^<\//.test(node);
      const isOpening = /^<[^!?/][^>]*[^/]?>$/.test(node);
      if (isClosing) depth = Math.max(depth - 1, 0);
      const line = `${"  ".repeat(depth)}${node}`;
      if (isOpening) depth += 1;
      return line;
    })
    .join("\n");
}

function prettyHtml(value: string) {
  return value
    .replace(/>\s+</g, "><")
    .replace(/(>)(<)(\/*)/g, "$1\n$2$3")
    .split("\n")
    .map((line, index, lines) => {
      const previousClosings = lines
        .slice(0, index)
        .reduce((total, item) => total + (item.match(/^<\//) ? -1 : /^<[^!/][^>]*[^/]?>$/.test(item) ? 1 : 0), 0);
      const depth = Math.max(previousClosings + (line.match(/^<\//) ? -1 : 0), 0);
      return `${"  ".repeat(depth)}${line.trim()}`;
    })
    .join("\n");
}

function minifyMarkup(value: string) {
  return value.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}

function escapeEntities(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function unescapeEntities(value: string) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function toWords(value: string) {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function convertCase(value: string, action: string) {
  const words = toWords(value);
  if (action === "camelCase") {
    return words
      .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join("");
  }
  if (action === "PascalCase") {
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  }
  if (action === "kebab-case") return words.join("-");
  if (action === "snake_case") return words.join("_");
  return value;
}

async function makeHash(value: string, algorithm: "SHA-1" | "SHA-256") {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(algorithm, data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function convertColor(value: string) {
  const match = value.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) throw new Error("Enter a 6-digit hex color such as #1f7a8c.");

  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    if (max === bn) hue = 60 * ((rn - gn) / delta + 4);
  }

  const h = Math.round((hue + 360) % 360);
  const s = Math.round(saturation * 100);
  const l = Math.round(lightness * 100);
  return [`HEX #${match[1]}${match[2]}${match[3]}`.toUpperCase(), `RGB ${r}, ${g}, ${b}`, `HSL ${h}, ${s}%, ${l}%`].join("\n");
}

function escapeSvgText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalizeHexColor(value: string) {
  const clean = value.trim().replace(/^#/, "");
  if (/^[a-f\d]{3}$/i.test(clean)) {
    return `#${clean
      .split("")
      .map((part) => part + part)
      .join("")}`.toLowerCase();
  }
  if (/^[a-f\d]{6}$/i.test(clean)) return `#${clean}`.toLowerCase();
  throw new Error("Use a 3-digit or 6-digit hex color.");
}

function placeholderSize(config: PlaceholderConfig) {
  return {
    width: Math.max(1, Math.round(config.width)),
    height: Math.max(1, Math.round(config.height)),
  };
}

function buildPlaceholderRecipe(config: PlaceholderConfig) {
  const { width, height } = placeholderSize(config);
  const background = normalizeHexColor(config.background).replace("#", "");
  const foreground = normalizeHexColor(config.foreground).replace("#", "");
  const text = config.text.trim() ? `?text=${encodeURIComponent(config.text.trim()).replace(/%20/g, "+")}` : "";
  return `${width}x${height}/${background}/${foreground}.${config.format}${text}`;
}

function buildPlaceholderSvg(config: PlaceholderConfig) {
  const background = normalizeHexColor(config.background);
  const foreground = normalizeHexColor(config.foreground);
  const { width, height } = placeholderSize(config);
  const label = config.text.trim() || `${width}x${height}`;
  const fontSize = Math.max(12, Math.min(height * 0.24, width / Math.max(label.length * 0.58, 5)));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(label)}"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${foreground}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700">${escapeSvgText(label)}</text></svg>`;
}

function buildPlaceholderDataUrl(config: PlaceholderConfig) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPlaceholderSvg(config))}`;
}

async function renderPlaceholderDataUrl(config: PlaceholderConfig) {
  if (config.format === "svg") return buildPlaceholderDataUrl(config);

  const { width, height } = placeholderSize(config);
  const svg = buildPlaceholderSvg({ ...config, width, height });
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The placeholder image could not be prepared."));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is not available in this browser.");

    if (config.format === "jpg") {
      context.fillStyle = normalizeHexColor(config.background);
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);

    const mimeType = config.format === "jpg" ? "image/jpeg" : "image/png";
    return canvas.toDataURL(mimeType, 0.94);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function createPlaceholderOutput(config: PlaceholderConfig) {
  const recipe = buildPlaceholderRecipe(config);
  const dataUrl = await renderPlaceholderDataUrl(config);
  const { width, height } = placeholderSize(config);
  const alt = config.text.trim() || `${width}x${height} placeholder`;

  return [
    `Recipe: ${recipe}`,
    `Size: ${width} x ${height}`,
    `Format: ${config.format.toUpperCase()}`,
    "",
    "HTML:",
    `<img src="${dataUrl}" width="${width}" height="${height}" alt="${escapeEntities(alt)}" />`,
    "",
    "Markdown:",
    `![${alt}](${dataUrl})`,
    "",
    "Data URL:",
    dataUrl,
  ].join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function downloadPlaceholderImage(config: PlaceholderConfig) {
  const { width, height } = placeholderSize(config);
  const exportConfig = { ...config, width, height };
  const slug = config.text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "placeholder";

  if (config.format === "svg") {
    const svg = buildPlaceholderSvg(exportConfig);
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${slug}-${width}x${height}.svg`);
    return;
  }

  const mimeType = config.format === "jpg" ? "image/jpeg" : "image/png";
  const response = await fetch(await renderPlaceholderDataUrl(exportConfig));
  const blob = await response.blob();
  if (blob.type !== mimeType) throw new Error("The image could not be exported in the selected format.");
  downloadBlob(blob, `${slug}-${width}x${height}.${config.format}`);
}

function matchRegex(pattern: string, flags: string, sample: string) {
  const regex = new RegExp(pattern, flags);
  const matches = Array.from(sample.matchAll(regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`)));
  if (!matches.length) return "No matches found.";
  return matches
    .map((match, index) => `Match ${index + 1}: ${match[0]} at index ${match.index}`)
    .join("\n");
}

function ordinal(value: string) {
  const number = Number(value);
  const suffix = number % 10 === 1 && number !== 11 ? "st" : number % 10 === 2 && number !== 12 ? "nd" : number % 10 === 3 && number !== 13 ? "rd" : "th";
  return `${number}${suffix}`;
}

function monthField(config: CronConfig) {
  if (config.monthMode === "specific") return config.month;
  if (config.monthMode === "quarterly") return "JAN,APR,JUL,OCT";
  if (config.monthMode === "range") return "JAN-DEC";
  return "*";
}

function dayFields(config: CronConfig) {
  if (config.dayMode === "weekdays") return { dayOfMonth: "?", dayOfWeek: "MON-FRI" };
  if (config.dayMode === "weekends") return { dayOfMonth: "?", dayOfWeek: "SUN,SAT" };
  if (config.dayMode === "weekday-set") return { dayOfMonth: "?", dayOfWeek: config.weekdaySet.join(",") || "MON" };
  if (config.dayMode === "month-day") return { dayOfMonth: config.dayOfMonth || "1", dayOfWeek: "?" };
  if (config.dayMode === "last-day") return { dayOfMonth: "L", dayOfWeek: "?" };
  if (config.dayMode === "last-weekday") return { dayOfMonth: "LW", dayOfWeek: "?" };
  if (config.dayMode === "nearest-weekday") return { dayOfMonth: `${config.dayOfMonth || "1"}W`, dayOfWeek: "?" };
  if (config.dayMode === "last-weekday-of-month") return { dayOfMonth: "?", dayOfWeek: `${config.weekday}L` };
  if (config.dayMode === "nth-weekday") return { dayOfMonth: "?", dayOfWeek: `${config.weekday}#${config.nth}` };
  return { dayOfMonth: "*", dayOfWeek: "?" };
}

function buildCronExpression(config: CronConfig) {
  const day = dayFields(config);
  const year = config.yearMode === "specific" ? config.year : config.yearMode === "range" ? "2026-2030" : "*";
  return [config.seconds || "0", config.minutes || "0", config.hours || "*", day.dayOfMonth, monthField(config), day.dayOfWeek, year].join(" ");
}

function describeField(value: string, unit: string, names?: Record<string, string>) {
  if (value === "*") return `every ${unit}`;
  if (value === "?") return `no specific ${unit}`;
  if (value.includes("/")) {
    const [start, step] = value.split("/");
    return `every ${step} ${unit}s starting at ${start}`;
  }
  if (value.includes("-")) {
    const [from, to] = value.split("-");
    return `from ${names?.[from] ?? from} through ${names?.[to] ?? to}`;
  }
  if (value.includes(",")) {
    return value
      .split(",")
      .map((part) => names?.[part] ?? part)
      .join(", ");
  }
  if (value === "L") return "the last day of the month";
  if (value === "LW") return "the last weekday of the month";
  if (value.endsWith("W")) return `the weekday nearest the ${ordinal(value.replace("W", ""))} day of the month`;
  if (value.endsWith("L")) return `the last ${names?.[value.replace("L", "")] ?? value.replace("L", "")} of the month`;
  if (value.includes("#")) {
    const [day, nth] = value.split("#");
    return `the ${ordinal(nth)} ${names?.[day] ?? day} of the month`;
  }
  return names?.[value] ?? value;
}

function describeCronExpression(expression: string) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 6 && parts.length !== 7) {
    throw new Error("Quartz expressions should have 6 or 7 fields.");
  }

  const [seconds, minutes, hours, dayOfMonth, month, dayOfWeek, year = "*"] = parts;
  return [
    `Runs at ${describeField(seconds, "second")}, ${describeField(minutes, "minute")}, ${describeField(hours, "hour")}.`,
    `Day rule: ${describeField(dayOfMonth, "day of month")} / ${describeField(dayOfWeek, "day of week", weekdayNames)}.`,
    `Month rule: ${describeField(month, "month", monthNames)}.`,
    `Year rule: ${describeField(year, "year")}.`,
    "",
    "Field breakdown:",
    `Seconds: ${seconds}`,
    `Minutes: ${minutes}`,
    `Hours: ${hours}`,
    `Day of month: ${dayOfMonth}`,
    `Month: ${month}`,
    `Day of week: ${dayOfWeek}`,
    `Year: ${year}`,
  ].join("\n");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

export default function Home() {
  const [activeId, setActiveId] = useState<ToolId>(defaultToolId);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [input, setInput] = useState("0 0 12 * * ? *");
  const [output, setOutput] = useState("");
  const [notice, setNotice] = useState("Ready for paste-and-go cleanup.");
  const [regexPattern, setRegexPattern] = useState("[\\w.-]+@[\\w.-]+\\.\\w+");
  const [regexFlags, setRegexFlags] = useState("gi");
  const [cronConfig, setCronConfig] = useState<CronConfig>({
    preset: "Daily at noon",
    ...cronPresets["Daily at noon"],
  });
  const [placeholderConfig, setPlaceholderConfig] = useState<PlaceholderConfig>(defaultPlaceholder);
  const [timestampZone, setTimestampZone] = useState<TimestampZone>("local");
  const [testDataKind, setTestDataKind] = useState<TestDataKind>("records");
  const [testDataCount, setTestDataCount] = useState(5);
  const [qrFormat, setQrFormat] = useState<QrFormat>("png");
  const [qrSize, setQrSize] = useState(320);
  const [qrAssets, setQrAssets] = useState<Awaited<ReturnType<typeof createQrAssets>> | null>(null);
  const [diffRight, setDiffRight] = useState("DeskFormat keeps useful tools nearby.\nThis line stays the same.\nThis line was added.");
  const [diffCompared, setDiffCompared] = useState(false);
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
  const [diffIgnoreWhitespace, setDiffIgnoreWhitespace] = useState(false);
  const [diffHideUnchanged, setDiffHideUnchanged] = useState(false);
  const [diffChangeCursor, setDiffChangeCursor] = useState(0);
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>("sql");
  const [favorites, setFavorites] = useState<ToolId[]>([]);
  const [recentTools, setRecentTools] = useState<ToolId[]>([]);
  const [savedToolsReady, setSavedToolsReady] = useState(false);
  const [paneSplit, setPaneSplit] = useState(50);
  const [workspaceDragging, setWorkspaceDragging] = useState(false);
  const [cronTimezone, setCronTimezone] = useState("local");
  const [diffSyntax, setDiffSyntax] = useState<"text" | "json" | "yaml">("text");
  const [diffWrap, setDiffWrap] = useState(true);
  const [diffHistory, setDiffHistory] = useState<DiffHistoryItem[]>([]);
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>([
    { id: "workspace-1", toolId: "cron", input: "0 0 12 * * ? *", output: "", name: "Cron Generator" },
  ]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("workspace-1");
  const [workspacesReady, setWorkspacesReady] = useState(false);
  const [snippets, setSnippets] = useState<Record<string, string>>({});
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [inputError, setInputError] = useState("");
  const lastTypedInput = useRef(input);

  const activeTool = tools.find((tool) => tool.id === activeId) ?? tools[0];
  const isExtendedTool = extendedTools.some((tool) => tool.id === activeTool.id);
  const generatedCron = buildCronExpression(cronConfig);
  const placeholderDimensions = useMemo(() => placeholderSize(placeholderConfig), [placeholderConfig]);
  const placeholderRecipe = useMemo(() => buildPlaceholderRecipe(placeholderConfig), [placeholderConfig]);
  const placeholderPreview = useMemo(() => buildPlaceholderDataUrl(placeholderConfig), [placeholderConfig]);
  const preparedDiff = useMemo(() => {
    try {
      return {
        left: normalizeStructuredText(input, diffSyntax),
        right: normalizeStructuredText(diffRight, diffSyntax),
        error: "",
      };
    } catch (error) {
      return { left: input, right: diffRight, error: formatLocatedError(error, input) };
    }
  }, [diffRight, diffSyntax, input]);
  const diffRows = useMemo(
    () => buildTextDiffRows(preparedDiff.left, preparedDiff.right, diffIgnoreWhitespace),
    [diffIgnoreWhitespace, preparedDiff.left, preparedDiff.right],
  );
  const diffChangeRows = useMemo(
    () => diffRows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind !== "same"),
    [diffRows],
  );
  const displayedDiffRows = useMemo(
    () =>
      diffRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !diffHideUnchanged || row.kind !== "same"),
    [diffRows, diffHideUnchanged],
  );
  const diffStats = useMemo(
    () => ({
      added: diffRows.filter((row) => row.kind === "added" || row.kind === "changed").length,
      removed: diffRows.filter((row) => row.kind === "removed" || row.kind === "changed").length,
    }),
    [diffRows],
  );
  const markdownPreview = useMemo(() => markdownDocument(input), [input]);
  const detection = useMemo(() => detectInput(input), [input]);
  const cronSchedule = useMemo(() => {
    try {
      const dates = nextCronOccurrences(generatedCron, cronTimezone);
      const offsets = new Set(dates.map((date) => cronOffsetLabel(date, cronTimezone)));
      return { dates, warning: offsets.size > 1 ? "This schedule crosses a daylight-saving offset change." : "", error: "" };
    } catch (error) {
      return { dates: [] as Date[], warning: "", error: error instanceof Error ? error.message : "Schedule unavailable." };
    }
  }, [cronTimezone, generatedCron]);
  const visibleTools = useMemo(() => {
    return tools.filter((tool) => {
        const matchesCategory = category === "All" || tool.category === category;
        const searchable = `${tool.name} ${tool.category} ${tool.description}`.toLowerCase();
        return matchesCategory && searchable.includes(query.toLowerCase());
      });
  }, [category, query]);

  useEffect(() => {
    if (activeId !== "qr" || !input.trim()) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void createQrAssets(input, qrSize)
        .then((assets) => {
          if (current) setQrAssets(assets);
        })
        .catch(() => {
          if (current) setQrAssets(null);
        });
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [activeId, input, qrSize]);

  useEffect(() => {
    const validIds = new Set(tools.map((tool) => tool.id));
    const readIds = (key: string) => {
      try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
        return Array.isArray(value) ? value.filter((id): id is ToolId => validIds.has(id as ToolId)) : [];
      } catch {
        return [];
      }
    };
    const timer = window.setTimeout(() => {
      setFavorites(readIds(favoriteStorageKey));
      setRecentTools(readIds(recentStorageKey));
      setSavedToolsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!savedToolsReady) return;
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favorites));
    window.localStorage.setItem(recentStorageKey, JSON.stringify(recentTools));
  }, [favorites, recentTools, savedToolsReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedTabs = JSON.parse(window.localStorage.getItem(workspaceStorageKey) ?? "[]") as WorkspaceTab[];
        const validTabs = Array.isArray(savedTabs)
          ? savedTabs.filter((tab) => tab && tools.some((tool) => tool.id === tab.toolId)).slice(0, 12)
          : [];
        if (validTabs.length) {
          const first = validTabs[0];
          setWorkspaceTabs(validTabs);
          setActiveWorkspaceId(first.id);
          setActiveId(first.toolId);
          setInput(first.input);
          setOutput(first.output);
          lastTypedInput.current = first.input;
        }
      } catch {
        window.localStorage.removeItem(workspaceStorageKey);
      }
      try {
        setSnippets(JSON.parse(window.localStorage.getItem(snippetStorageKey) ?? "{}"));
      } catch {
        setSnippets({});
      }
      try {
        const savedHistory = JSON.parse(window.localStorage.getItem(diffHistoryStorageKey) ?? "[]");
        setDiffHistory(Array.isArray(savedHistory) ? savedHistory.slice(0, 12) : []);
      } catch {
        setDiffHistory([]);
      }
      setWorkspacesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!workspacesReady) return;
    const timer = window.setTimeout(() => {
      setWorkspaceTabs((current) => {
        const next = current.map((tab) =>
          tab.id === activeWorkspaceId
            ? { ...tab, toolId: activeId, input, output, name: activeTool.name }
            : tab,
        );
        window.localStorage.setItem(workspaceStorageKey, JSON.stringify(next));
        return next;
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeId, activeTool.name, activeWorkspaceId, input, output, workspacesReady]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : prefersDark ? "dark" : "light";
    const timer = window.setTimeout(() => setTheme(nextTheme), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function replaceInput(value: string) {
    lastTypedInput.current = value;
    setInput(value);
    setUndoStack([]);
    setRedoStack([]);
    setInputError("");
  }

  function changeInput(value: string) {
    if (value !== lastTypedInput.current) {
      setUndoStack((current) => [...current.slice(-49), lastTypedInput.current]);
      setRedoStack([]);
      lastTypedInput.current = value;
    }
    setInput(value);
    setInputError("");
  }

  function undoInput() {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, input]);
    lastTypedInput.current = previous;
    setInput(previous);
  }

  function redoInput() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, input]);
    lastTypedInput.current = next;
    setInput(next);
  }

  function selectTool(tool: Tool) {
    setActiveId(tool.id);
    replaceInput(tool.id === "cron" ? generatedCron : tool.id === "image" ? placeholderRecipe : tool.sample);
    setOutput("");
    setRecentTools((current) => [tool.id, ...current.filter((id) => id !== tool.id)].slice(0, 5));
    if (tool.id === "diff") setDiffCompared(false);
    setNotice(`${tool.name} loaded.`);
  }

  function selectToolById(toolId: string) {
    const tool = tools.find((item) => item.id === toolId);
    if (tool) selectTool(tool);
  }

  function snapshotCurrentTabs(tabs: WorkspaceTab[]) {
    return tabs.map((tab) =>
      tab.id === activeWorkspaceId ? { ...tab, toolId: activeId, input, output, name: activeTool.name } : tab,
    );
  }

  function switchWorkspace(tabId: string) {
    const target = workspaceTabs.find((tab) => tab.id === tabId);
    if (!target || target.id === activeWorkspaceId) return;
    setWorkspaceTabs((current) => snapshotCurrentTabs(current));
    setActiveWorkspaceId(target.id);
    setActiveId(target.toolId);
    replaceInput(target.input);
    setOutput(target.output);
    setDiffCompared(false);
    setNotice(`${target.name} workspace restored.`);
  }

  function addWorkspace() {
    const id = crypto.randomUUID();
    const nextTab: WorkspaceTab = { id, toolId: "cron", input: generatedCron, output: "", name: "Cron Generator" };
    setWorkspaceTabs((current) => [...snapshotCurrentTabs(current), nextTab].slice(-12));
    setActiveWorkspaceId(id);
    setActiveId("cron");
    replaceInput(generatedCron);
    setOutput("");
    setNotice("New workspace opened.");
  }

  function closeWorkspace(tabId: string) {
    if (workspaceTabs.length === 1) return;
    const index = workspaceTabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = snapshotCurrentTabs(workspaceTabs).filter((tab) => tab.id !== tabId);
    setWorkspaceTabs(nextTabs);
    if (tabId === activeWorkspaceId) {
      const target = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
      setActiveWorkspaceId(target.id);
      setActiveId(target.toolId);
      replaceInput(target.input);
      setOutput(target.output);
    }
  }

  function saveSnippet() {
    const name = window.prompt("Name this snippet");
    if (!name?.trim() || !input) return;
    const next = { ...snippets, [name.trim()]: input };
    setSnippets(next);
    window.localStorage.setItem(snippetStorageKey, JSON.stringify(next));
    setNotice(`${name.trim()} saved on this device.`);
  }

  function loadSnippet(name: string) {
    if (!name || snippets[name] === undefined) return;
    replaceInput(snippets[name]);
    setNotice(`${name} loaded.`);
  }

  function toggleFavorite(toolId: ToolId) {
    setFavorites((current) =>
      current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId],
    );
  }

  async function loadWorkspaceFile(file: File | undefined) {
    if (!file) return;
    if (activeId === "image-compressor" || activeId === "image" || activeId === "secrets") return;
    try {
      const value = await file.text();
      replaceInput(value);
      if (activeId === "diff") setDiffCompared(false);
      setNotice(`${file.name} loaded locally.`);
    } catch {
      setNotice("That file could not be read as text.");
    }
  }

  function beginPaneResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const move = (pointerEvent: PointerEvent) => {
      const percentage = ((pointerEvent.clientX - bounds.left) / bounds.width) * 100;
      setPaneSplit(Math.max(25, Math.min(75, percentage)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function updatePowerToolNotice(message: string, nextOutput?: string) {
    setNotice(message);
    if (nextOutput !== undefined) setOutput(nextOutput);
  }

  function updateCronConfig(next: Partial<CronConfig>) {
    setCronConfig((current) => ({ ...current, ...next, preset: next.preset ?? "Custom" }));
  }

  function applyCronPreset(preset: string) {
    if (!cronPresets[preset]) {
      updateCronConfig({ preset });
      return;
    }
    const nextConfig = { preset, ...cronPresets[preset] };
    setCronConfig(nextConfig);
    const expression = buildCronExpression(nextConfig);
    replaceInput(expression);
    setOutput(describeCronExpression(expression));
    setNotice(`${preset} schedule loaded.`);
  }

  function toggleWeekday(day: string) {
    setCronConfig((current) => {
      const exists = current.weekdaySet.includes(day);
      const nextSet = exists ? current.weekdaySet.filter((item) => item !== day) : [...current.weekdaySet, day];
      return { ...current, weekdaySet: nextSet, preset: "Custom" };
    });
  }

  function updatePlaceholderConfig(next: Partial<PlaceholderConfig>) {
    const nextConfig = { ...placeholderConfig, ...next };
    setPlaceholderConfig(nextConfig);
    if (activeId === "image") replaceInput(buildPlaceholderRecipe(nextConfig));
  }

  async function loadDiffFile(file: File | undefined, side: "left" | "right") {
    if (!file) return;
    const value = await file.text();
    if (side === "left") replaceInput(value);
    else setDiffRight(value);
    setDiffCompared(false);
    setNotice(`${file.name} loaded locally.`);
  }

  function swapDiffInputs() {
    const previousLeft = input;
    replaceInput(diffRight);
    setDiffRight(previousLeft);
    setDiffChangeCursor(0);
    setNotice("Original and changed text swapped.");
  }

  function navigateDiff(direction: -1 | 1) {
    if (!diffChangeRows.length) return;
    const nextCursor = (diffChangeCursor + direction + diffChangeRows.length) % diffChangeRows.length;
    setDiffChangeCursor(nextCursor);
    const rowIndex = diffChangeRows[nextCursor].index;
    window.requestAnimationFrame(() => {
      document.getElementById(`diff-row-${rowIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function runAction(action: string) {
    try {
      let result = "";

      if (activeTool.id === "json") {
        const parsed = JSON.parse(input);
        result =
          action === "Minify"
            ? JSON.stringify(parsed)
            : action === "Validate"
              ? "Valid JSON.\n\n" + JSON.stringify(parsed, null, 2)
              : action === "Sort Keys"
                ? JSON.stringify(sortJsonValue(parsed), null, 2)
                : JSON.stringify(parsed, null, 2);
      }

      if (activeTool.id === "xml") {
        result = action === "Minify" ? minifyMarkup(input) : prettyXml(input);
      }

      if (activeTool.id === "html") {
        result = action === "Minify" ? minifyMarkup(input) : prettyHtml(input);
      }

      if (activeTool.id === "url") {
        result = action === "Decode" ? decodeURIComponent(input) : encodeURIComponent(input);
      }

      if (activeTool.id === "base64") {
        result = action === "Decode" ? atob(input.trim()) : btoa(unescape(encodeURIComponent(input)));
      }

      if (activeTool.id === "entities") {
        result = action === "Unescape" ? unescapeEntities(input) : escapeEntities(input);
      }

      if (activeTool.id === "case") {
        result = convertCase(input, action);
      }

      if (activeTool.id === "regex") {
        result = matchRegex(regexPattern, regexFlags, input);
      }

      if (activeTool.id === "hash") {
        result = await makeHash(input, action as "SHA-1" | "SHA-256");
      }

      if (activeTool.id === "color") {
        result = convertColor(input);
      }

      if (activeTool.id === "cron") {
        const expression = action === "Generate" ? generatedCron : input;
        result = action === "Generate" ? `${expression}\n\n${describeCronExpression(expression)}` : describeCronExpression(expression);
        if (action === "Generate") replaceInput(expression);
      }

      if (activeTool.id === "image") {
        if (action === "Download") {
          await downloadPlaceholderImage(placeholderConfig);
          result = await createPlaceholderOutput(placeholderConfig);
        } else {
          result = await createPlaceholderOutput(placeholderConfig);
        }
        replaceInput(placeholderRecipe);
      }

      if (activeTool.id === "diff") {
        if (preparedDiff.error) throw new Error(preparedDiff.error);
        const added = diffStats.added;
        const removed = diffStats.removed;
        setDiffCompared(true);
        setDiffChangeCursor(0);
        result = [
          `${added} added line${added === 1 ? "" : "s"}, ${removed} removed line${removed === 1 ? "" : "s"}.`,
          "",
          ...diffRows.flatMap((row) => {
            if (row.kind === "same") return [`  ${row.left}`];
            if (row.kind === "changed") return [`- ${row.left}`, `+ ${row.right}`];
            return [row.kind === "added" ? `+ ${row.right}` : `- ${row.left}`];
          }),
        ].join("\n");
        const historyItem: DiffHistoryItem = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          left: input,
          right: diffRight,
          syntax: diffSyntax,
        };
        const nextHistory = [historyItem, ...diffHistory].slice(0, 12);
        setDiffHistory(nextHistory);
        window.localStorage.setItem(diffHistoryStorageKey, JSON.stringify(nextHistory));
      } else if (activeTool.id === "qr") {
        const assets = await createQrAssets(input, qrSize);
        setQrAssets(assets);
        if (action === "Download") {
          if (qrFormat === "svg") {
            downloadBlob(new Blob([assets.svg], { type: "image/svg+xml" }), "deskformat-qr.svg");
          } else {
            const blob = await fetch(assets.png).then((response) => response.blob());
            downloadBlob(blob, "deskformat-qr.png");
          }
        }
        result = qrFormat === "svg" ? assets.svg : `PNG QR code ready at ${assets.width} x ${assets.width}px.`;
      } else if (isExtendedTool) {
        result = await runExtendedTool(activeTool.id as ExtendedToolId, action, input, {
          timestampZone,
          testDataKind,
          testDataCount,
          sqlDialect,
        });
      }

      setOutput(result);
      setInputError("");
      setNotice(`${action} complete.`);
    } catch (error) {
      setOutput("");
      const message = formatLocatedError(error, input);
      setInputError(message);
      setNotice(message);
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setNotice("Copied output.");
  }

  function swapOutput() {
    if (!output) return;
    replaceInput(output);
    setOutput("");
    setNotice("Output moved back into the editor.");
  }

  function downloadDiff() {
    if (!output) return;
    downloadBlob(new Blob([output], { type: "text/x-diff" }), "deskformat-comparison.patch");
    setNotice("Patch file downloaded.");
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Tool catalog">
        <div className="brand">
          <span className="brand-mark">DF</span>
          <div>
            <p>Personal formatter</p>
            <h1>DeskFormat</h1>
          </div>
          <label className="theme-switch">
            <input checked={theme === "dark"} onChange={toggleTheme} type="checkbox" />
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </label>
        </div>

        <CommandPalette tools={tools} onSelect={selectToolById} />

        <label className="search">
          <span>Search tools</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="json, url, color..." />
        </label>

        {(favorites.length > 0 || recentTools.length > 0) && (
          <div className="quick-tool-sections">
            {favorites.length > 0 && (
              <section>
                <span>Favorites</span>
                <div>{favorites.map((id) => {
                  const tool = tools.find((item) => item.id === id);
                  return tool ? <button className={activeId === id ? "selected" : ""} key={id} onClick={() => selectTool(tool)}>{tool.name}</button> : null;
                })}</div>
              </section>
            )}
            {recentTools.length > 0 && (
              <section>
                <span>Recent</span>
                <div>{recentTools.filter((id) => !favorites.includes(id)).map((id) => {
                  const tool = tools.find((item) => item.id === id);
                  return tool ? <button className={activeId === id ? "selected" : ""} key={id} onClick={() => selectTool(tool)}>{tool.name}</button> : null;
                })}</div>
              </section>
            )}
          </div>
        )}

        <div className="category-tabs" aria-label="Tool categories">
          {categories.map((item) => (
            <button className={item === category ? "active" : ""} key={item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="tool-list">
          {visibleTools.map((tool) => (
            <div className={`tool-card ${tool.id === activeId ? "selected" : ""}`} key={tool.id}>
              <button className="tool-select" onClick={() => selectTool(tool)}>
                <span>{tool.category}</span>
                <strong>{tool.name}</strong>
                <small>{tool.description}</small>
              </button>
              <button
                className={`favorite-button ${favorites.includes(tool.id) ? "selected" : ""}`}
                aria-label={`${favorites.includes(tool.id) ? "Remove" : "Add"} ${tool.name} ${favorites.includes(tool.id) ? "from" : "to"} favorites`}
                title={favorites.includes(tool.id) ? "Remove favorite" : "Add favorite"}
                onClick={() => toggleFavorite(tool.id)}
              >
                {favorites.includes(tool.id) ? "★" : "☆"}
              </button>
            </div>
          ))}
        </div>
        <OfflineInstall />
        <ClearLocalData />
      </aside>

      <section
        className="workspace"
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) setWorkspaceDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setWorkspaceDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setWorkspaceDragging(false);
          void loadWorkspaceFile(event.dataTransfer.files[0]);
        }}
      >
        {workspaceDragging && activeId !== "image-compressor" && <div className="drop-overlay">Drop file to load it locally</div>}
        <nav className="workspace-tabs" aria-label="Open workspaces">
          <div>
            {workspaceTabs.map((tab) => (
              <span className={tab.id === activeWorkspaceId ? "selected" : ""} key={tab.id}>
                <button onClick={() => switchWorkspace(tab.id)}>{tab.name}</button>
                <button aria-label={`Close ${tab.name} workspace`} title="Close workspace" onClick={() => closeWorkspace(tab.id)} disabled={workspaceTabs.length === 1}>×</button>
              </span>
            ))}
          </div>
          <button className="workspace-add" aria-label="New workspace" title="New workspace" onClick={addWorkspace}>+</button>
        </nav>
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTool.category}</p>
            <h2>{activeTool.name}</h2>
            <p>{activeTool.description}</p>
          </div>
          <div className="status">{notice}</div>
        </header>

        {detection && detection.toolId !== activeId && (
          <button className="detection-suggestion" onClick={() => selectToolById(detection.toolId)}>
            <span>Detected {detection.label}</span>
            <strong>Open {tools.find((tool) => tool.id === detection.toolId)?.name}</strong>
          </button>
        )}

        {inputError && <div className="input-error" role="alert">{inputError}</div>}

        {activeTool.id !== "diff" && activeTool.id !== "image-compressor" && activeTool.id !== "secrets" && activeTool.id !== "pipeline" && (
          <section className="action-row" aria-label="Actions">
            {activeTool.quickActions.map((action) => (
              <button className="primary-action" key={action} onClick={() => void runAction(action)}>
                {action}
              </button>
            ))}
            <button className="utility-action" onClick={copyOutput} disabled={!output}>
              Copy
            </button>
            <button className="utility-action" onClick={swapOutput} disabled={!output}>
              Reuse Output
            </button>
            <button className="utility-action" onClick={undoInput} disabled={!undoStack.length}>Undo</button>
            <button className="utility-action" onClick={redoInput} disabled={!redoStack.length}>Redo</button>
            <button className="utility-action" onClick={saveSnippet} disabled={!input}>Save Snippet</button>
            <select className="snippet-select" aria-label="Saved snippets" defaultValue="" onChange={(event) => {
              loadSnippet(event.target.value);
              event.target.value = "";
            }}>
              <option value="">Load snippet</option>
              {Object.keys(snippets).map((name) => <option key={name}>{name}</option>)}
            </select>
          </section>
        )}

        {activeTool.id === "regex" && (
          <section className="regex-panel" aria-label="Regex options">
            <label>
              Pattern
              <input value={regexPattern} onChange={(event) => setRegexPattern(event.target.value)} />
            </label>
            <label>
              Flags
              <input value={regexFlags} onChange={(event) => setRegexFlags(event.target.value)} />
            </label>
          </section>
        )}

        {activeTool.id === "image-compressor" && <ImageCompressor onNotice={updatePowerToolNotice} />}

        {activeTool.id === "secrets" && <SecretGenerator onNotice={updatePowerToolNotice} />}

        {activeTool.id === "pipeline" && (
          <PipelineBuilder input={input} onResult={setOutput} onNotice={setNotice} />
        )}

        {activeTool.id === "json" && (
          <JsonStudioPanel input={input} onOutput={setOutput} onNotice={setNotice} />
        )}

        {activeTool.id === "data-converter" && input.includes("\n") && /[,;\t]/.test(input.split("\n")[0]) && (
          <CsvInspector input={input} onOutput={setOutput} onNotice={setNotice} />
        )}

        {activeTool.id === "timestamp" && (
          <section className="tool-options compact-options" aria-label="Timestamp timezone">
            <span>Interpret dates as</span>
            <div className="segmented-control">
              {(["local", "utc"] as TimestampZone[]).map((zone) => (
                <button className={timestampZone === zone ? "selected" : ""} key={zone} onClick={() => setTimestampZone(zone)}>
                  {zone === "local" ? "Local time" : "UTC"}
                </button>
              ))}
            </div>
          </section>
        )}

        {activeTool.id === "test-data" && (
          <section className="tool-options" aria-label="Test data options">
            <label>
              Data type
              <select value={testDataKind} onChange={(event) => setTestDataKind(event.target.value as TestDataKind)}>
                <option value="names">Names</option>
                <option value="emails">Emails</option>
                <option value="addresses">Addresses</option>
                <option value="paragraphs">Paragraphs</option>
                <option value="records">JSON records</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                max="100"
                value={testDataCount}
                onChange={(event) => setTestDataCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
              />
            </label>
          </section>
        )}

        {activeTool.id === "qr" && (
          <>
            <QrTemplates onValue={(value) => {
              replaceInput(value);
              setNotice("QR template applied.");
            }} />
            <section className="qr-builder" aria-label="QR code options and preview">
              <div className="qr-preview">
                {qrAssets ? <img src={qrAssets.png} alt="Generated QR code preview" /> : <span>Enter text to generate a QR code.</span>}
              </div>
              <div className="tool-options">
                <label>
                  Download format
                  <select value={qrFormat} onChange={(event) => setQrFormat(event.target.value as QrFormat)}>
                    <option value="png">PNG</option>
                    <option value="svg">SVG</option>
                  </select>
                </label>
                <label>
                  Size
                  <select value={qrSize} onChange={(event) => setQrSize(Number(event.target.value))}>
                    <option value="256">256 px</option>
                    <option value="320">320 px</option>
                    <option value="512">512 px</option>
                    <option value="1024">1024 px</option>
                  </select>
                </label>
              </div>
            </section>
          </>
        )}

        {activeTool.id === "sql" && (
          <section className="tool-options compact-options" aria-label="SQL dialect">
            <label>
              SQL dialect
              <select value={sqlDialect} onChange={(event) => setSqlDialect(event.target.value as SqlDialect)}>
                <option value="sql">Standard SQL</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL / MariaDB</option>
                <option value="sqlite">SQLite</option>
                <option value="bigquery">BigQuery</option>
                <option value="transactsql">SQL Server</option>
              </select>
            </label>
          </section>
        )}

        {activeTool.id === "diff" && (
          diffCompared ? (
            <section className="diff-result-workspace" aria-label="Text comparison results">
              <header className="diff-result-header">
                <div className="diff-stat diff-stat-removed">
                  <strong>{diffStats.removed}</strong>
                  <span>{diffStats.removed === 1 ? "removed line" : "removed lines"}</span>
                </div>
                <div className="diff-stat diff-stat-added">
                  <strong>{diffStats.added}</strong>
                  <span>{diffStats.added === 1 ? "added line" : "added lines"}</span>
                </div>
                <div className="diff-result-actions">
                  <button className="utility-action" onClick={() => setDiffCompared(false)}>Edit input</button>
                  <button className="utility-action" onClick={swapDiffInputs}>Swap</button>
                  <button className="utility-action" onClick={copyOutput} disabled={!output}>Copy diff</button>
                  <button className="utility-action" onClick={downloadDiff} disabled={!output}>Download patch</button>
                </div>
              </header>

              <div className="diff-control-bar">
                <div className="segmented-control diff-layout-control" aria-label="Diff layout">
                  <button className={diffMode === "split" ? "selected" : ""} onClick={() => setDiffMode("split")}>Split</button>
                  <button className={diffMode === "unified" ? "selected" : ""} onClick={() => setDiffMode("unified")}>Unified</button>
                </div>
                <label className="diff-toggle">
                  <input checked={diffIgnoreWhitespace} onChange={(event) => setDiffIgnoreWhitespace(event.target.checked)} type="checkbox" />
                  Ignore whitespace
                </label>
                <label className="diff-toggle">
                  <input checked={diffHideUnchanged} onChange={(event) => setDiffHideUnchanged(event.target.checked)} type="checkbox" />
                  Hide unchanged
                </label>
                <label className="diff-toggle">
                  <input checked={diffWrap} onChange={(event) => setDiffWrap(event.target.checked)} type="checkbox" />
                  Wrap lines
                </label>
                <div className="diff-navigation">
                  <button onClick={() => navigateDiff(-1)} disabled={!diffChangeRows.length}>Previous</button>
                  <span>{diffChangeRows.length ? `${diffChangeCursor + 1} of ${diffChangeRows.length}` : "No changes"}</span>
                  <button onClick={() => navigateDiff(1)} disabled={!diffChangeRows.length}>Next</button>
                </div>
              </div>

              <div className={`diff-results ${diffMode} ${diffWrap ? "wrap-lines" : ""}`}>
                {diffMode === "split" && (
                  <div className="diff-column-headings">
                    <span>Original text</span>
                    <span>Changed text</span>
                  </div>
                )}
                {displayedDiffRows.map(({ row, index }) =>
                  diffMode === "split" ? (
                    <div
                      className={`diff-split-row ${row.kind} ${diffChangeRows[diffChangeCursor]?.index === index ? "current-change" : ""}`}
                      id={`diff-row-${index}`}
                      key={index}
                    >
                      <div className={`diff-line left ${row.kind === "added" ? "empty" : row.kind}`}>
                        <span className="diff-line-number">{row.leftNumber ?? ""}</span>
                        <code><DiffContent parts={row.leftParts} text={row.left} side="left" /></code>
                      </div>
                      <div className={`diff-line right ${row.kind === "removed" ? "empty" : row.kind}`}>
                        <span className="diff-line-number">{row.rightNumber ?? ""}</span>
                        <code><DiffContent parts={row.rightParts} text={row.right} side="right" /></code>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`diff-unified-group ${row.kind} ${diffChangeRows[diffChangeCursor]?.index === index ? "current-change" : ""}`}
                      id={`diff-row-${index}`}
                      key={index}
                    >
                      {(row.kind === "same" || row.kind === "removed" || row.kind === "changed") && (
                        <div className={`diff-line ${row.kind === "same" ? "same" : "removed"}`}>
                          <span className="diff-line-number">{row.leftNumber ?? ""}</span>
                          <span className="diff-prefix">{row.kind === "same" ? " " : "-"}</span>
                          <code><DiffContent parts={row.leftParts} text={row.left} side="left" /></code>
                        </div>
                      )}
                      {(row.kind === "added" || row.kind === "changed") && (
                        <div className="diff-line added">
                          <span className="diff-line-number">{row.rightNumber ?? ""}</span>
                          <span className="diff-prefix">+</span>
                          <code><DiffContent parts={row.rightParts} text={row.right} side="right" /></code>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </section>
          ) : (
            <>
              <section className="diff-source-options" aria-label="Comparison type and history">
                <label>
                  Compare as
                  <select value={diffSyntax} onChange={(event) => setDiffSyntax(event.target.value as "text" | "json" | "yaml")}>
                    <option value="text">Plain text</option>
                    <option value="json">JSON structure</option>
                    <option value="yaml">YAML structure</option>
                  </select>
                </label>
                <label>
                  Comparison history
                  <select defaultValue="" onChange={(event) => {
                    const item = diffHistory.find((history) => history.id === event.target.value);
                    if (item) {
                      replaceInput(item.left);
                      setDiffRight(item.right);
                      setDiffSyntax(item.syntax);
                      setNotice("Previous comparison restored.");
                    }
                    event.target.value = "";
                  }}>
                    <option value="">Load previous</option>
                    {diffHistory.map((item) => <option value={item.id} key={item.id}>{new Date(item.createdAt).toLocaleString()}</option>)}
                  </select>
                </label>
              </section>
              <section
                className="diff-input-workspace resizable-panes"
                aria-label="Text comparison"
                style={{ gridTemplateColumns: `minmax(0, ${paneSplit}fr) 10px minmax(0, ${100 - paneSplit}fr)` }}
              >
              <div
                className="diff-editor-card"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void loadDiffFile(event.dataTransfer.files[0], "left");
                }}
              >
                <header>
                  <strong>Original text</strong>
                  <label className="diff-file-button">
                    Open file
                    <input
                      type="file"
                      accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.sql,text/*"
                      onChange={(event) => void loadDiffFile(event.target.files?.[0], "left")}
                    />
                  </label>
                </header>
                <div className={`diff-editor-shell ${diffWrap ? "wrap-lines" : ""}`}>
                  <div className="diff-editor-lines" aria-hidden="true">
                    {Array.from({ length: Math.max(input.split(/\r\n?|\n/).length, 1) }, (_, index) => <span key={index}>{index + 1}</span>)}
                  </div>
                  <textarea
                    aria-label="Original text"
                    value={input}
                    onChange={(event) => changeInput(event.target.value)}
                    onScroll={(event) => {
                      const gutter = event.currentTarget.previousElementSibling as HTMLElement | null;
                      if (gutter) gutter.scrollTop = event.currentTarget.scrollTop;
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>

              <button
                className="pane-resizer"
                type="button"
                role="separator"
                aria-label="Resize comparison editors"
                aria-orientation="vertical"
                aria-valuemin={25}
                aria-valuemax={75}
                aria-valuenow={Math.round(paneSplit)}
                onPointerDown={beginPaneResize}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") setPaneSplit((current) => Math.max(25, current - 5));
                  if (event.key === "ArrowRight") setPaneSplit((current) => Math.min(75, current + 5));
                }}
              />

              <div
                className="diff-editor-card"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void loadDiffFile(event.dataTransfer.files[0], "right");
                }}
              >
                <header>
                  <strong>Changed text</strong>
                  <label className="diff-file-button">
                    Open file
                    <input
                      type="file"
                      accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.sql,text/*"
                      onChange={(event) => void loadDiffFile(event.target.files?.[0], "right")}
                    />
                  </label>
                </header>
                <div className={`diff-editor-shell ${diffWrap ? "wrap-lines" : ""}`}>
                  <div className="diff-editor-lines" aria-hidden="true">
                    {Array.from({ length: Math.max(diffRight.split(/\r\n?|\n/).length, 1) }, (_, index) => <span key={index}>{index + 1}</span>)}
                  </div>
                  <textarea
                    aria-label="Changed text"
                    value={diffRight}
                    onChange={(event) => setDiffRight(event.target.value)}
                    onScroll={(event) => {
                      const gutter = event.currentTarget.previousElementSibling as HTMLElement | null;
                      if (gutter) gutter.scrollTop = event.currentTarget.scrollTop;
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>

              <footer className="diff-input-actions">
                <button className="utility-action" onClick={() => { replaceInput(""); setDiffRight(""); }}>Clear</button>
                <button className="utility-action" onClick={swapDiffInputs}>Swap</button>
                <button className="primary-action" onClick={() => void runAction("Compare")}>Find differences</button>
              </footer>
              </section>
            </>
          )
        )}

        {activeTool.id === "markdown" && (
          <section className="markdown-preview" aria-label="Rendered Markdown preview">
            <label className="comparison-input">
              <span>Markdown</span>
              <textarea value={input} onChange={(event) => changeInput(event.target.value)} spellCheck={false} />
            </label>
            <div className="markdown-rendered">
              <span className="panel-label">Rendered preview</span>
              <iframe title="Rendered Markdown" sandbox="" srcDoc={markdownPreview} />
            </div>
          </section>
        )}

        {activeTool.id === "cron" && (
          <section className="cron-builder" aria-label="Quartz cron generator">
            <div className="cron-result">
              <span>Quartz expression</span>
              <code>{generatedCron}</code>
            </div>

            <div className="cron-controls">
              <label>
                Preset
                <select value={cronConfig.preset} onChange={(event) => applyCronPreset(event.target.value)}>
                  {Object.keys(cronPresets).map((preset) => (
                    <option key={preset}>{preset}</option>
                  ))}
                  <option>Custom</option>
                </select>
              </label>

              <label>
                Timezone
                <select value={cronTimezone} onChange={(event) => setCronTimezone(event.target.value)}>
                  <option value="local">Device local time</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe / London</option>
                  <option value="America/New_York">America / New York</option>
                  <option value="America/Los_Angeles">America / Los Angeles</option>
                  <option value="Asia/Tokyo">Asia / Tokyo</option>
                  <option value="Australia/Sydney">Australia / Sydney</option>
                </select>
              </label>

              <label>
                Seconds
                <input value={cronConfig.seconds} onChange={(event) => updateCronConfig({ seconds: event.target.value })} placeholder="0, *, 0/15" />
              </label>

              <label>
                Minutes
                <input value={cronConfig.minutes} onChange={(event) => updateCronConfig({ minutes: event.target.value })} placeholder="0, *, 0/5" />
              </label>

              <label>
                Hours
                <input value={cronConfig.hours} onChange={(event) => updateCronConfig({ hours: event.target.value })} placeholder="9, 9-17, */2" />
              </label>

              <label>
                Day rule
                <select value={cronConfig.dayMode} onChange={(event) => updateCronConfig({ dayMode: event.target.value })}>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekends">Weekends</option>
                  <option value="weekday-set">Specific weekdays</option>
                  <option value="month-day">Specific day of month</option>
                  <option value="last-day">Last day of month</option>
                  <option value="last-weekday">Last weekday of month</option>
                  <option value="nearest-weekday">Nearest weekday to day</option>
                  <option value="last-weekday-of-month">Last selected weekday</option>
                  <option value="nth-weekday">Nth weekday of month</option>
                </select>
              </label>

              <label>
                Day of month
                <input value={cronConfig.dayOfMonth} onChange={(event) => updateCronConfig({ dayOfMonth: event.target.value })} placeholder="1-31" />
              </label>

              <label>
                Weekday
                <select value={cronConfig.weekday} onChange={(event) => updateCronConfig({ weekday: event.target.value })}>
                  {Object.entries(weekdayNames).map(([value, name]) => (
                    <option value={value} key={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Nth
                <select value={cronConfig.nth} onChange={(event) => updateCronConfig({ nth: event.target.value })}>
                  <option value="1">First</option>
                  <option value="2">Second</option>
                  <option value="3">Third</option>
                  <option value="4">Fourth</option>
                  <option value="5">Fifth</option>
                </select>
              </label>

              <label>
                Month
                <select value={cronConfig.monthMode} onChange={(event) => updateCronConfig({ monthMode: event.target.value })}>
                  <option value="every">Every month</option>
                  <option value="specific">Specific month</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="range">January through December</option>
                </select>
              </label>

              <label>
                Month value
                <select value={cronConfig.month} onChange={(event) => updateCronConfig({ month: event.target.value })}>
                  {Object.entries(monthNames).map(([value, name]) => (
                    <option value={value} key={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Year
                <select value={cronConfig.yearMode} onChange={(event) => updateCronConfig({ yearMode: event.target.value })}>
                  <option value="any">Any year</option>
                  <option value="specific">Specific year</option>
                  <option value="range">2026 through 2030</option>
                </select>
              </label>

              <label>
                Year value
                <input value={cronConfig.year} onChange={(event) => updateCronConfig({ year: event.target.value })} placeholder="2026" />
              </label>
            </div>

            <div className="weekday-grid" aria-label="Specific weekdays">
              {Object.entries(weekdayNames).map(([value, name]) => (
                <button className={cronConfig.weekdaySet.includes(value) ? "selected" : ""} key={value} onClick={() => toggleWeekday(value)}>
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>

            <section className="cron-next-runs" aria-label="Next scheduled runs">
              <header>
                <strong>Next 10 runs</strong>
                <span>{cronTimezone === "local" ? "Device local time" : cronTimezone}</span>
              </header>
              {cronSchedule.error ? (
                <p className="cron-run-error">{cronSchedule.error}</p>
              ) : (
                <ol>
                  {cronSchedule.dates.map((date) => (
                    <li key={date.toISOString()}>
                      <time dateTime={date.toISOString()}>
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "long",
                          ...(cronTimezone === "local" ? {} : { timeZone: cronTimezone }),
                        }).format(date)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
              {cronSchedule.warning && <p className="cron-dst-warning">{cronSchedule.warning}</p>}
              {cronConfig.yearMode !== "any" && <p className="cron-dst-warning">The preview uses the repeating six-field schedule; the selected Quartz year still remains in the generated expression.</p>}
            </section>
          </section>
        )}

        {activeTool.id === "image" && (
          <section className="image-builder" aria-label="Placeholder image generator">
            <div className="placeholder-preview">
              <div className="placeholder-preview-header">
                <span>Preview</span>
                <code>{placeholderRecipe}</code>
                <small>
                  Exports at {placeholderDimensions.width} x {placeholderDimensions.height}px. Preview may be scaled to fit.
                </small>
              </div>
              <div className="placeholder-stage">
                <div
                  className="placeholder-canvas"
                  style={{
                    width: `min(${placeholderDimensions.width}px, 100%)`,
                    aspectRatio: `${placeholderDimensions.width} / ${placeholderDimensions.height}`,
                  }}
                >
                  <img src={placeholderPreview} alt={placeholderConfig.text || "Generated placeholder"} />
                </div>
              </div>
            </div>

            <div className="image-controls">
              <label>
                Width
                <input
                  min="1"
                  max="4000"
                  type="number"
                  value={placeholderConfig.width}
                  onChange={(event) => updatePlaceholderConfig({ width: Math.max(1, Math.min(4000, Number(event.target.value) || 1)) })}
                />
              </label>

              <label>
                Height
                <input
                  min="1"
                  max="4000"
                  type="number"
                  value={placeholderConfig.height}
                  onChange={(event) => updatePlaceholderConfig({ height: Math.max(1, Math.min(4000, Number(event.target.value) || 1)) })}
                />
              </label>

              <label>
                Background
                <input type="color" value={placeholderConfig.background} onChange={(event) => updatePlaceholderConfig({ background: event.target.value })} />
              </label>

              <label>
                Text color
                <input type="color" value={placeholderConfig.foreground} onChange={(event) => updatePlaceholderConfig({ foreground: event.target.value })} />
              </label>

              <label>
                Format
                <select value={placeholderConfig.format} onChange={(event) => updatePlaceholderConfig({ format: event.target.value as ImageFormat })}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="svg">SVG</option>
                </select>
              </label>

              <label className="image-text-control">
                Text
                <input value={placeholderConfig.text} onChange={(event) => updatePlaceholderConfig({ text: event.target.value })} placeholder="Text shown in the image" />
              </label>
            </div>

            <div className="image-presets" aria-label="Common placeholder sizes">
              {[
                ["Ad tile", 300, 250],
                ["Card", 600, 400],
                ["HD", 1280, 720],
                ["Desktop", 1920, 1080],
              ].map(([label, width, height]) => (
                <button key={label} onClick={() => updatePlaceholderConfig({ width: Number(width), height: Number(height) })}>
                  <strong>{label}</strong>
                  <span>
                    {width}x{height}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {activeTool.id !== "diff" && activeTool.id !== "markdown" && activeTool.id !== "image-compressor" && activeTool.id !== "secrets" && (
          <section
            className="editors resizable-panes"
            style={{ gridTemplateColumns: `minmax(0, ${paneSplit}fr) 10px minmax(0, ${100 - paneSplit}fr)` }}
          >
            <label className="editor-panel">
              <span>Input</span>
              <textarea value={input} onChange={(event) => changeInput(event.target.value)} spellCheck={false} />
            </label>
            <button
              className="pane-resizer"
              type="button"
              role="separator"
              aria-label="Resize input and output editors"
              aria-orientation="vertical"
              aria-valuemin={25}
              aria-valuemax={75}
              aria-valuenow={Math.round(paneSplit)}
              onPointerDown={beginPaneResize}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") setPaneSplit((current) => Math.max(25, current - 5));
                if (event.key === "ArrowRight") setPaneSplit((current) => Math.min(75, current + 5));
              }}
            />
            <label className="editor-panel output-panel">
              <span>Output</span>
              <textarea value={output} readOnly placeholder="Your transformed result appears here." spellCheck={false} />
            </label>
          </section>
        )}

        {activeTool.id === "markdown" && output && (
          <label className="editor-panel markdown-html-output">
            <span>Generated HTML</span>
            <textarea value={output} readOnly spellCheck={false} />
          </label>
        )}

        <section className="insight-strip" aria-label="Quick stats">
          <div>
            <strong>{input.length.toLocaleString()}</strong>
            <span>input chars</span>
          </div>
          <div>
            <strong>{output.length.toLocaleString()}</strong>
            <span>output chars</span>
          </div>
          <div>
            <strong>{tools.length}</strong>
            <span>local tools</span>
          </div>
          <div>
            <strong>0</strong>
            <span>uploads needed</span>
          </div>
        </section>
      </section>
    </main>
  );
}
