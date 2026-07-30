"use client";

import { useEffect, useMemo, useState } from "react";

type ToolId =
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
  {
    id: "json",
    name: "JSON Studio",
    category: "Formatters",
    description: "Format, minify, validate, and inspect JSON payloads.",
    sample: '{"project":"DeskFormat","active":true,"items":[{"name":"JSON","rank":1},{"name":"URL","rank":2}]}',
    quickActions: ["Format", "Minify", "Validate"],
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
  Hourly: {
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

function buildPlaceholderRecipe(config: PlaceholderConfig) {
  const background = normalizeHexColor(config.background).replace("#", "");
  const foreground = normalizeHexColor(config.foreground).replace("#", "");
  const text = config.text.trim() ? `?text=${encodeURIComponent(config.text.trim()).replace(/%20/g, "+")}` : "";
  return `${config.width}x${config.height}/${background}/${foreground}.${config.format}${text}`;
}

function buildPlaceholderSvg(config: PlaceholderConfig) {
  const background = normalizeHexColor(config.background);
  const foreground = normalizeHexColor(config.foreground);
  const width = Math.max(1, Math.round(config.width));
  const height = Math.max(1, Math.round(config.height));
  const label = config.text.trim() || `${width}x${height}`;
  const fontSize = Math.max(12, Math.min(height * 0.24, width / Math.max(label.length * 0.58, 5)));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(label)}"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${foreground}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700">${escapeSvgText(label)}</text></svg>`;
}

function buildPlaceholderDataUrl(config: PlaceholderConfig) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPlaceholderSvg(config))}`;
}

function createPlaceholderOutput(config: PlaceholderConfig) {
  const recipe = buildPlaceholderRecipe(config);
  const dataUrl = buildPlaceholderDataUrl(config);
  const alt = config.text.trim() || `${config.width}x${config.height} placeholder`;

  return [
    `Recipe: ${recipe}`,
    `Size: ${config.width} x ${config.height}`,
    `Format: ${config.format.toUpperCase()}`,
    "",
    "HTML:",
    `<img src="${dataUrl}" width="${config.width}" height="${config.height}" alt="${escapeEntities(alt)}" />`,
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
  const width = Math.max(1, Math.round(config.width));
  const height = Math.max(1, Math.round(config.height));
  const svg = buildPlaceholderSvg({ ...config, width, height });
  const slug = config.text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "placeholder";

  if (config.format === "svg") {
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${slug}-${width}x${height}.svg`);
    return;
  }

  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The placeholder preview could not be prepared for download."));
    image.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is not available in this browser.");
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(svgUrl);

  const mimeType = config.format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("The image could not be exported."))), mimeType, 0.94);
  });
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

export default function Home() {
  const [activeId, setActiveId] = useState<ToolId>(defaultToolId);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
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

  const activeTool = tools.find((tool) => tool.id === activeId) ?? tools[0];
  const generatedCron = buildCronExpression(cronConfig);
  const placeholderRecipe = useMemo(() => buildPlaceholderRecipe(placeholderConfig), [placeholderConfig]);
  const placeholderPreview = useMemo(() => buildPlaceholderDataUrl(placeholderConfig), [placeholderConfig]);
  const visibleTools = useMemo(
    () =>
      tools.filter((tool) => {
        const matchesCategory = category === "All" || tool.category === category;
        const searchable = `${tool.name} ${tool.category} ${tool.description}`.toLowerCase();
        return matchesCategory && searchable.includes(query.toLowerCase());
      }),
    [category, query],
  );

  useEffect(() => {
    setActiveId(defaultToolId);
    setInput(buildCronExpression({ preset: "Daily at noon", ...cronPresets["Daily at noon"] }));
  }, []);

  useEffect(() => {
    if (activeId === "image") setInput(placeholderRecipe);
  }, [activeId, placeholderRecipe]);

  function selectTool(tool: Tool) {
    setActiveId(tool.id);
    setInput(tool.id === "cron" ? generatedCron : tool.id === "image" ? placeholderRecipe : tool.sample);
    setOutput("");
    setNotice(`${tool.name} loaded.`);
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
    setInput(expression);
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

  async function runAction(action: string) {
    try {
      let result = "";

      if (activeTool.id === "json") {
        const parsed = JSON.parse(input);
        result = action === "Minify" ? JSON.stringify(parsed) : action === "Validate" ? "Valid JSON.\n\n" + JSON.stringify(parsed, null, 2) : JSON.stringify(parsed, null, 2);
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
        if (action === "Generate") setInput(expression);
      }

      if (activeTool.id === "image") {
        if (action === "Download") {
          await downloadPlaceholderImage(placeholderConfig);
          result = createPlaceholderOutput(placeholderConfig);
        } else {
          result = createPlaceholderOutput(placeholderConfig);
        }
        setInput(placeholderRecipe);
      }

      setOutput(result);
      setNotice(`${action} complete.`);
    } catch (error) {
      setOutput("");
      setNotice(error instanceof Error ? error.message : "That input could not be processed.");
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setNotice("Copied output.");
  }

  function swapOutput() {
    if (!output) return;
    setInput(output);
    setOutput("");
    setNotice("Output moved back into the editor.");
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
        </div>

        <label className="search">
          <span>Search tools</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="json, url, color..." />
        </label>

        <div className="category-tabs" aria-label="Tool categories">
          {categories.map((item) => (
            <button className={item === category ? "active" : ""} key={item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="tool-list">
          {visibleTools.map((tool) => (
            <button className={`tool-card ${tool.id === activeId ? "selected" : ""}`} key={tool.id} onClick={() => selectTool(tool)}>
              <span>{tool.category}</span>
              <strong>{tool.name}</strong>
              <small>{tool.description}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTool.category}</p>
            <h2>{activeTool.name}</h2>
            <p>{activeTool.description}</p>
          </div>
          <div className="status">{notice}</div>
        </header>

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
        </section>

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
          </section>
        )}

        {activeTool.id === "image" && (
          <section className="image-builder" aria-label="Placeholder image generator">
            <div className="placeholder-preview">
              <div className="placeholder-preview-header">
                <span>Preview</span>
                <code>{placeholderRecipe}</code>
              </div>
              <div className="placeholder-canvas" style={{ aspectRatio: `${placeholderConfig.width} / ${placeholderConfig.height}` }}>
                <img src={placeholderPreview} alt={placeholderConfig.text || "Generated placeholder"} />
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
                  onChange={(event) => setPlaceholderConfig((current) => ({ ...current, width: Math.max(1, Math.min(4000, Number(event.target.value) || 1)) }))}
                />
              </label>

              <label>
                Height
                <input
                  min="1"
                  max="4000"
                  type="number"
                  value={placeholderConfig.height}
                  onChange={(event) => setPlaceholderConfig((current) => ({ ...current, height: Math.max(1, Math.min(4000, Number(event.target.value) || 1)) }))}
                />
              </label>

              <label>
                Background
                <input type="color" value={placeholderConfig.background} onChange={(event) => setPlaceholderConfig((current) => ({ ...current, background: event.target.value }))} />
              </label>

              <label>
                Text color
                <input type="color" value={placeholderConfig.foreground} onChange={(event) => setPlaceholderConfig((current) => ({ ...current, foreground: event.target.value }))} />
              </label>

              <label>
                Format
                <select value={placeholderConfig.format} onChange={(event) => setPlaceholderConfig((current) => ({ ...current, format: event.target.value as ImageFormat }))}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="svg">SVG</option>
                </select>
              </label>

              <label className="image-text-control">
                Text
                <input value={placeholderConfig.text} onChange={(event) => setPlaceholderConfig((current) => ({ ...current, text: event.target.value }))} placeholder="Text shown in the image" />
              </label>
            </div>

            <div className="image-presets" aria-label="Common placeholder sizes">
              {[
                ["Ad tile", 300, 250],
                ["Card", 600, 400],
                ["HD", 1280, 720],
                ["Desktop", 1920, 1080],
              ].map(([label, width, height]) => (
                <button key={label} onClick={() => setPlaceholderConfig((current) => ({ ...current, width: Number(width), height: Number(height) }))}>
                  <strong>{label}</strong>
                  <span>
                    {width}x{height}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="editors">
          <label className="editor-panel">
            <span>Input</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} />
          </label>
          <label className="editor-panel output-panel">
            <span>Output</span>
            <textarea value={output} readOnly placeholder="Your transformed result appears here." spellCheck={false} />
          </label>
        </section>

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
