const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, net, protocol, shell } = require("electron");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const isDev = !app.isPackaged;
const outDir = path.resolve(__dirname, "..", "out");

function resolveAssetPath(url) {
  const requestUrl = new URL(url);
  const pathname = decodeURIComponent(
    requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname,
  );
  const resolved = path.normalize(path.join(outDir, pathname));

  if (!resolved.startsWith(outDir)) {
    return null;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }

  return path.join(outDir, "index.html");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: "DeskFormat",
    backgroundColor: "#f6f3ee",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://deskformat")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  window.loadURL("app://deskformat/index.html");
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const assetPath = resolveAssetPath(request.url);

    if (!assetPath) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(assetPath).toString());
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
