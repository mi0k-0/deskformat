"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";

type ToolNotice = (message: string, output?: string) => void;
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type SourceImage = { id: string; file: File; url: string; width: number; height: number };
type ImageResult = { id: string; name: string; blob: Blob; url: string; width: number; height: number; originalSize: number };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be read."));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser could not create that image format."))),
      type,
      quality,
    );
  });
}

export function ImageCompressor({ onNotice }: { onNotice: ToolNotice }) {
  const [sources, setSources] = useState<SourceImage[]>([]);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [format, setFormat] = useState("image/webp");
  const [quality, setQuality] = useState(82);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [targetKb, setTargetKb] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const sourceUrls = useRef<string[]>([]);
  const resultUrls = useRef<string[]>([]);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(
    () => () => {
      sourceUrls.current.forEach((url) => URL.revokeObjectURL(url));
      resultUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  async function openFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      onNotice("Choose one or more browser-readable images.");
      return;
    }
    const loaded = await Promise.all(
      files.map(async (file) => {
        const url = URL.createObjectURL(file);
        sourceUrls.current.push(url);
        const image = await loadImage(url);
        return {
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }),
    );
    setSources((current) => [...current, ...loaded]);
    setMaxWidth((current) => current || Math.min(loaded[0].width, 1920));
    setResults([]);
    onNotice(`${loaded.length} image${loaded.length === 1 ? "" : "s"} loaded locally.`);
  }

  async function compressSource(source: SourceImage) {
    const image = await loadImage(source.url);
    const width = Math.max(1, Math.min(source.width, maxWidth || source.width));
    const height = Math.max(1, Math.round(source.height * (width / source.width)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    if (format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    let selectedQuality = quality / 100;
    let blob = await canvasBlob(canvas, format, selectedQuality);
    if (targetKb > 0 && format !== "image/png") {
      const target = targetKb * 1024;
      let low = 0.12;
      let high = selectedQuality;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const candidateQuality = (low + high) / 2;
        const candidate = await canvasBlob(canvas, format, candidateQuality);
        blob = candidate;
        selectedQuality = candidateQuality;
        if (candidate.size > target) high = candidateQuality;
        else low = candidateQuality;
      }
    }
    const extension = format === "image/jpeg" ? "jpg" : format.split("/")[1];
    const stem = source.file.name.replace(/\.[^.]+$/, "") || "deskformat-image";
    const url = URL.createObjectURL(blob);
    resultUrls.current.push(url);
    return {
      id: source.id,
      name: `${stem}-converted.${extension}`,
      blob,
      url,
      width,
      height,
      originalSize: source.file.size,
    };
  }

  async function compressAll() {
    if (!sources.length) {
      onNotice("Drop images here or choose files first.");
      return;
    }
    setWorking(true);
    try {
      resultUrls.current.forEach((url) => URL.revokeObjectURL(url));
      resultUrls.current = [];
      const next = [];
      for (const source of sources) next.push(await compressSource(source));
      setResults(next);
      const before = next.reduce((sum, item) => sum + item.originalSize, 0);
      const after = next.reduce((sum, item) => sum + item.blob.size, 0);
      const saving = before ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;
      onNotice(`${next.length} image${next.length === 1 ? "" : "s"} ready.`, `${formatBytes(after)} total, ${saving}% smaller`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The images could not be converted.");
    } finally {
      setWorking(false);
    }
  }

  async function downloadAll() {
    if (!results.length) return;
    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].name);
    } else {
      const zip = new JSZip();
      results.forEach((result) => zip.file(result.name, result.blob));
      downloadBlob(await zip.generateAsync({ type: "blob" }), "deskformat-images.zip");
    }
    onNotice(results.length === 1 ? "Image downloaded." : "ZIP archive downloaded.");
  }

  function clearImages() {
    sourceUrls.current.forEach((url) => URL.revokeObjectURL(url));
    resultUrls.current.forEach((url) => URL.revokeObjectURL(url));
    sourceUrls.current = [];
    resultUrls.current = [];
    setSources([]);
    setResults([]);
  }

  return (
    <section className="image-compressor" aria-label="Image compressor and format converter">
      <div
        className={`image-drop-zone ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          void openFiles(event.dataTransfer.files);
        }}
      >
        <strong>{sources.length ? `${sources.length} image${sources.length === 1 ? "" : "s"} selected` : "Drop images or a folder here"}</strong>
        <span>{sources.length ? `${formatBytes(sources.reduce((sum, item) => sum + item.file.size, 0))} total` : "Metadata is removed during local conversion"}</span>
        <div className="file-picker-row">
          <label className="primary-action file-picker">
            Choose images
            <input type="file" accept="image/*" multiple onChange={(event) => event.target.files && void openFiles(event.target.files)} />
          </label>
          <label className="utility-action file-picker">
            Choose folder
            <input ref={folderInput} type="file" accept="image/*" multiple onChange={(event) => event.target.files && void openFiles(event.target.files)} />
          </label>
          {sources.length > 0 && <button className="utility-action" onClick={clearImages}>Clear</button>}
        </div>
      </div>

      <div className="compression-controls batch-controls">
        <label>
          Output format
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="image/webp">WebP</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/png">PNG</option>
          </select>
        </label>
        <label>
          Maximum width
          <input type="number" min="1" max="12000" value={maxWidth} onChange={(event) => setMaxWidth(Math.max(1, Math.min(12000, Number(event.target.value) || 1)))} />
        </label>
        <label>
          Target size KB
          <input type="number" min="0" max="50000" value={targetKb} onChange={(event) => setTargetKb(Math.max(0, Number(event.target.value) || 0))} disabled={format === "image/png"} />
        </label>
        <label className="quality-control">
          <span>Quality <strong>{quality}%</strong></span>
          <input type="range" min="20" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} disabled={format === "image/png"} />
        </label>
        <div className="compression-actions">
          <button className="primary-action" onClick={() => void compressAll()} disabled={!sources.length || working}>{working ? "Processing..." : "Process all"}</button>
          <button className="utility-action" onClick={() => void downloadAll()} disabled={!results.length}>Download {results.length > 1 ? "ZIP" : ""}</button>
        </div>
      </div>

      <div className="batch-image-grid">
        {sources.map((source) => {
          const result = results.find((item) => item.id === source.id);
          return (
            <figure key={source.id}>
              <img src={result?.url ?? source.url} alt={`Preview of ${source.file.name}`} />
              <figcaption>
                <strong>{source.file.name}</strong>
                <span>{source.width} x {source.height}px</span>
                <span>{formatBytes(source.file.size)}{result ? ` → ${formatBytes(result.blob.size)}` : ""}</span>
              </figcaption>
            </figure>
          );
        })}
        {!sources.length && <div className="empty-image-preview">Batch previews appear here</div>}
      </div>
      <p className="local-note">PNG and WebP preserve transparency. JPG places transparent areas on white.</p>
    </section>
  );
}

function secureRandomInt(max: number) {
  if (max <= 0) throw new Error("At least one character set must be selected.");
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % max;
}

function secureShuffle(items: string[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomInt(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function createPassword(length: number, sets: string[]) {
  if (!sets.length) throw new Error("Select at least one character set.");
  const size = Math.max(8, Math.min(128, length));
  const combined = sets.join("");
  const password = sets.map((set) => set[secureRandomInt(set.length)]);
  while (password.length < size) password.push(combined[secureRandomInt(combined.length)]);
  return secureShuffle(password).join("");
}

function createToken(bytes: number, encoding: "hex" | "base64url") {
  const values = crypto.getRandomValues(new Uint8Array(Math.max(8, Math.min(128, bytes))));
  if (encoding === "hex") return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
  return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const passphraseWords = [
  "amber", "anchor", "apple", "atlas", "bamboo", "beacon", "birch", "blue", "brisk", "cabin", "cactus", "cedar",
  "cloud", "cobalt", "comet", "coral", "delta", "ember", "falcon", "field", "fjord", "forest", "frost", "garden",
  "gold", "harbor", "hazel", "island", "jade", "juniper", "kite", "lake", "lantern", "maple", "meadow", "mint",
  "moon", "north", "ocean", "olive", "orchid", "pearl", "pine", "pixel", "quartz", "rain", "river", "robin",
  "sage", "silver", "solar", "sparrow", "stone", "storm", "summit", "teal", "thunder", "timber", "valley", "violet",
  "willow", "wind", "winter", "zenith",
];

function createPassphrase(count: number) {
  return Array.from({ length: Math.max(3, Math.min(12, count)) }, () => passphraseWords[secureRandomInt(passphraseWords.length)]).join("-");
}

function createUlid() {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = Date.now();
  let result = "";
  for (let index = 0; index < 10; index += 1) {
    result = alphabet[time % 32] + result;
    time = Math.floor(time / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  for (let index = 0; index < 16; index += 1) result += alphabet[random[index] % 32];
  return result;
}

function decodeJwt(value: string) {
  const parts = value.trim().split(".");
  if (parts.length < 2) throw new Error("Enter a JWT with header and payload sections.");
  const decode = (part: string) => {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))));
  };
  return JSON.stringify({ header: decode(parts[0]), payload: decode(parts[1]), signature: parts[2] || "" }, null, 2);
}

export function SecretGenerator({ onNotice }: { onNotice: ToolNotice }) {
  const [mode, setMode] = useState<"password" | "passphrase" | "token" | "uuid" | "jwt" | "checksum">("password");
  const [length, setLength] = useState(24);
  const [wordCount, setWordCount] = useState(5);
  const [tokenBytes, setTokenBytes] = useState(32);
  const [encoding, setEncoding] = useState<"hex" | "base64url">("base64url");
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [visible, setVisible] = useState(true);
  const [value, setValue] = useState("");
  const [jwt, setJwt] = useState("");
  const [checksumAlgorithm, setChecksumAlgorithm] = useState<"SHA-256" | "SHA-1">("SHA-256");

  function publish(next: string, label: string) {
    setValue(next);
    onNotice(`${label} created locally.`, next);
  }

  function generate() {
    try {
      if (mode === "token") return publish(createToken(tokenBytes, encoding), "Secure token");
      if (mode === "passphrase") return publish(createPassphrase(wordCount), "Passphrase");
      if (mode === "uuid") return publish(`${crypto.randomUUID()}\n${createUlid()}`, "UUID and ULID");
      publish(
        createPassword(
          length,
          [
            uppercase && "ABCDEFGHJKLMNPQRSTUVWXYZ",
            lowercase && "abcdefghijkmnopqrstuvwxyz",
            numbers && "23456789",
            symbols && "!@#$%^&*()-_=+[]{};:,.?",
          ].filter(Boolean) as string[],
        ),
        "Password",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "A secure value could not be generated.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(generate, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    onNotice("Copied securely generated value.", value);
  }

  async function checksum(file: File | undefined) {
    if (!file) return;
    const digest = await crypto.subtle.digest(checksumAlgorithm, await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    publish(`${hash}  ${file.name}`, `${checksumAlgorithm} checksum`);
  }

  const modes = [
    ["password", "Password"],
    ["passphrase", "Passphrase"],
    ["token", "Token"],
    ["uuid", "UUID / ULID"],
    ["jwt", "JWT Decoder"],
    ["checksum", "File Checksum"],
  ] as const;

  return (
    <section className="secret-generator" aria-label="Security tools">
      <div className="security-tabs" role="tablist">
        {modes.map(([id, label]) => <button className={mode === id ? "selected" : ""} key={id} onClick={() => {
          setMode(id);
          setValue("");
        }}>{label}</button>)}
      </div>

      {mode === "jwt" ? (
        <div className="jwt-decoder">
          <label>JWT<textarea value={jwt} onChange={(event) => setJwt(event.target.value)} placeholder="eyJhbGciOi..." spellCheck={false} /></label>
          <button className="primary-action" onClick={() => {
            try {
              publish(decodeJwt(jwt), "JWT");
            } catch (error) {
              onNotice(error instanceof Error ? error.message : "That JWT could not be decoded.");
            }
          }}>Decode JWT</button>
        </div>
      ) : mode === "checksum" ? (
        <div className="checksum-panel">
          <label>Algorithm<select value={checksumAlgorithm} onChange={(event) => setChecksumAlgorithm(event.target.value as "SHA-256" | "SHA-1")}><option>SHA-256</option><option>SHA-1</option></select></label>
          <label className="primary-action file-picker">Choose file<input type="file" onChange={(event) => void checksum(event.target.files?.[0])} /></label>
        </div>
      ) : (
        <>
          <div className="secret-output">
            <textarea aria-label="Generated value" value={value} readOnly className={visible ? "" : "masked-value"} />
            <button className="utility-action" onClick={() => setVisible((current) => !current)}>{visible ? "Hide" : "Show"}</button>
            <button className="utility-action" onClick={() => void copy()} disabled={!value}>Copy</button>
            <button className="primary-action" onClick={generate}>Generate</button>
          </div>
          {mode === "password" && (
            <div className="secret-options">
              <label className="secret-length"><span>Length <strong>{length}</strong></span><input type="range" min="8" max="128" value={length} onChange={(event) => setLength(Number(event.target.value))} /></label>
              {[
                ["Uppercase", uppercase, setUppercase],
                ["Lowercase", lowercase, setLowercase],
                ["Numbers", numbers, setNumbers],
                ["Symbols", symbols, setSymbols],
              ].map(([label, checked, setter]) => (
                <label className="check-option" key={String(label)}>
                  <input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />
                  <span>{String(label)}</span>
                </label>
              ))}
            </div>
          )}
          {mode === "passphrase" && <label className="secret-length compact-secret-option"><span>Words <strong>{wordCount}</strong></span><input type="range" min="3" max="12" value={wordCount} onChange={(event) => setWordCount(Number(event.target.value))} /></label>}
          {mode === "token" && (
            <div className="secret-options token-options">
              <label>Random bytes<input type="number" min="8" max="128" value={tokenBytes} onChange={(event) => setTokenBytes(Math.max(8, Math.min(128, Number(event.target.value) || 8)))} /></label>
              <label>Encoding<select value={encoding} onChange={(event) => setEncoding(event.target.value as "hex" | "base64url")}><option value="base64url">Base64 URL-safe</option><option value="hex">Hexadecimal</option></select></label>
            </div>
          )}
        </>
      )}

      {(mode === "jwt" || mode === "checksum") && value && <textarea className="security-result" value={value} readOnly spellCheck={false} />}
      <p className="local-note">Secure values and files are processed only on this device.</p>
    </section>
  );
}

export function OfflineInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "installed">("checking");
  const [updateReady, setUpdateReady] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const statusTimer = window.setTimeout(() => {
      if (standalone) setStatus("installed");
    }, 0);
    const controllerChanged = () => window.location.reload();

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then((nextRegistration) => {
        registration.current = nextRegistration;
        if (nextRegistration.waiting) setUpdateReady(true);
        nextRegistration.addEventListener("updatefound", () => {
          const worker = nextRegistration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
        return navigator.serviceWorker.ready;
      }).then(() => {
        if (!standalone) setStatus("ready");
      });
      navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    }

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setStatus("ready");
    };
    const handleInstalled = () => {
      setPrompt(null);
      setStatus("installed");
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(statusTimer);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  }

  return (
    <div className="offline-install">
      <span className={`offline-dot ${status}`} />
      <div>
        <strong>{updateReady ? "Update available" : status === "installed" ? "DeskFormat installed" : status === "ready" ? "Offline ready" : "Preparing offline use"}</strong>
        <small>{updateReady ? "A fresh version is ready" : status === "installed" ? "Runs as its own app" : "Available without a connection"}</small>
      </div>
      {updateReady ? (
        <button className="utility-action" onClick={() => registration.current?.waiting?.postMessage({ type: "SKIP_WAITING" })}>Update</button>
      ) : prompt ? (
        <button className="utility-action" onClick={() => void install()}>Install</button>
      ) : null}
    </div>
  );
}

export function ClearLocalData() {
  async function clear() {
    if (!window.confirm("Clear saved tabs, favorites, snippets, pipelines, histories, and offline files from this device?")) return;
    window.localStorage.clear();
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    window.location.reload();
  }
  return <button className="clear-local-data" onClick={() => void clear()}>Clear local data</button>;
}
