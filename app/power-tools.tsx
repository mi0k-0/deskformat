"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

type ToolNotice = (message: string, output?: string) => void;
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
  const [source, setSource] = useState<{ file: File; url: string; width: number; height: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string; width: number; height: number } | null>(null);
  const [format, setFormat] = useState("image/webp");
  const [quality, setQuality] = useState(82);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [dragging, setDragging] = useState(false);
  const sourceUrl = useRef("");
  const resultUrl = useRef("");

  useEffect(
    () => () => {
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    },
    [],
  );

  async function openFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotice("Choose a PNG, JPG, WebP, GIF, or other browser-readable image.");
      return;
    }
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    const url = URL.createObjectURL(file);
    sourceUrl.current = url;
    resultUrl.current = "";
    try {
      const image = await loadImage(url);
      setSource({ file, url, width: image.naturalWidth, height: image.naturalHeight });
      setResult(null);
      setMaxWidth(Math.min(image.naturalWidth, 1920));
      onNotice(`${file.name} loaded locally.`);
    } catch (error) {
      URL.revokeObjectURL(url);
      sourceUrl.current = "";
      onNotice(error instanceof Error ? error.message : "That image could not be read.");
    }
  }

  async function compress() {
    if (!source) {
      onNotice("Drop an image here or choose one first.");
      return;
    }
    try {
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
      const blob = await canvasBlob(canvas, format, quality / 100);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      const url = URL.createObjectURL(blob);
      resultUrl.current = url;
      setResult({ blob, url, width, height });
      const saving = source.file.size ? Math.round((1 - blob.size / source.file.size) * 100) : 0;
      const summary = `${width} x ${height}px ${formatBytes(blob.size)}${saving > 0 ? `, ${saving}% smaller` : ""}`;
      onNotice("Image ready to download.", summary);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The image could not be converted.");
    }
  }

  function download() {
    if (!source || !result) return;
    const extension = format === "image/jpeg" ? "jpg" : format.split("/")[1];
    const stem = source.file.name.replace(/\.[^.]+$/, "") || "deskformat-image";
    downloadBlob(result.blob, `${stem}-converted.${extension}`);
    onNotice("Image downloaded.");
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
          void openFile(event.dataTransfer.files[0]);
        }}
      >
        <strong>{source ? source.file.name : "Drop an image here"}</strong>
        <span>{source ? `${source.width} x ${source.height}px, ${formatBytes(source.file.size)}` : "PNG, JPG, WebP, GIF, BMP, or AVIF"}</span>
        <label className="primary-action file-picker">
          Choose image
          <input type="file" accept="image/*" onChange={(event) => void openFile(event.target.files?.[0])} />
        </label>
      </div>

      <div className="compression-controls">
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
          <input
            type="number"
            min="1"
            max="12000"
            value={maxWidth}
            onChange={(event) => setMaxWidth(Math.max(1, Math.min(12000, Number(event.target.value) || 1)))}
          />
        </label>
        <label className="quality-control">
          <span>Quality <strong>{quality}%</strong></span>
          <input type="range" min="20" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} disabled={format === "image/png"} />
        </label>
        <div className="compression-actions">
          <button className="primary-action" onClick={() => void compress()} disabled={!source}>Compress image</button>
          <button className="utility-action" onClick={download} disabled={!result}>Download</button>
        </div>
      </div>

      <div className="image-comparison">
        <figure>
          <figcaption>Original {source && <span>{formatBytes(source.file.size)}</span>}</figcaption>
          {source ? <img src={source.url} alt="Original upload preview" /> : <div className="empty-image-preview">No image selected</div>}
        </figure>
        <figure>
          <figcaption>Converted {result && <span>{formatBytes(result.blob.size)}</span>}</figcaption>
          {result ? <img src={result.url} alt="Converted image preview" /> : <div className="empty-image-preview">Your result appears here</div>}
        </figure>
      </div>
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

export function SecretGenerator({ onNotice }: { onNotice: ToolNotice }) {
  const [mode, setMode] = useState<"password" | "token">("password");
  const [length, setLength] = useState(24);
  const [tokenBytes, setTokenBytes] = useState(32);
  const [encoding, setEncoding] = useState<"hex" | "base64url">("base64url");
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [visible, setVisible] = useState(true);
  const [value, setValue] = useState("");

  function generate() {
    try {
      const next =
        mode === "token"
          ? createToken(tokenBytes, encoding)
          : createPassword(
              length,
              [
                uppercase && "ABCDEFGHJKLMNPQRSTUVWXYZ",
                lowercase && "abcdefghijkmnopqrstuvwxyz",
                numbers && "23456789",
                symbols && "!@#$%^&*()-_=+[]{};:,.?",
              ].filter(Boolean) as string[],
            );
      setValue(next);
      onNotice(`${mode === "token" ? "Secure token" : "Password"} generated locally.`, next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "A secure value could not be generated.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(generate, 0);
    return () => window.clearTimeout(timer);
    // Generate once when the tool opens; later changes remain under the user's control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    onNotice("Copied securely generated value.", value);
  }

  return (
    <section className="secret-generator" aria-label="Password and secure token generator">
      <div className="segmented-control secret-mode">
        <button className={mode === "password" ? "selected" : ""} onClick={() => setMode("password")}>Password</button>
        <button className={mode === "token" ? "selected" : ""} onClick={() => setMode("token")}>Secure token</button>
      </div>

      <div className="secret-output">
        <input aria-label="Generated value" type={visible ? "text" : "password"} value={value} readOnly />
        <button className="utility-action" onClick={() => setVisible((current) => !current)}>{visible ? "Hide" : "Show"}</button>
        <button className="utility-action" onClick={() => void copy()} disabled={!value}>Copy</button>
        <button className="primary-action" onClick={generate}>Generate</button>
      </div>

      {mode === "password" ? (
        <div className="secret-options">
          <label className="secret-length">
            <span>Length <strong>{length}</strong></span>
            <input type="range" min="8" max="128" value={length} onChange={(event) => setLength(Number(event.target.value))} />
          </label>
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
      ) : (
        <div className="secret-options token-options">
          <label>
            Random bytes
            <input type="number" min="8" max="128" value={tokenBytes} onChange={(event) => setTokenBytes(Math.max(8, Math.min(128, Number(event.target.value) || 8)))} />
          </label>
          <label>
            Encoding
            <select value={encoding} onChange={(event) => setEncoding(event.target.value as "hex" | "base64url")}>
              <option value="base64url">Base64 URL-safe</option>
              <option value="hex">Hexadecimal</option>
            </select>
          </label>
        </div>
      )}
      <p className="local-note">Generated with your device&apos;s secure random source. Nothing leaves this device.</p>
    </section>
  );
}

export function OfflineInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "installed">("checking");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const statusTimer = window.setTimeout(() => {
      if (standalone) setStatus("installed");
    }, 0);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => {
        if (!standalone) setStatus("ready");
      });
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
        <strong>{status === "installed" ? "DeskFormat installed" : status === "ready" ? "Offline ready" : "Preparing offline use"}</strong>
        <small>{status === "installed" ? "Runs as its own app" : "Available without a connection"}</small>
      </div>
      {prompt && <button className="utility-action" onClick={() => void install()}>Install</button>}
    </div>
  );
}
