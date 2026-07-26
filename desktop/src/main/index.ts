import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BrowserWindow, app, dialog, ipcMain, shell, type SaveDialogOptions } from "electron";
import { runDiagnostic } from "../../../dist/index.js";
import {
  IPC_CHANNELS,
  type DiagnosticRunResponse,
  type ExportRequest,
  type ExportResponse
} from "../shared/contracts.js";
import { validateDesktopInput } from "../shared/validation.js";

const activeRuns = new Map<number, AbortController>();

function sanitizeError(error: unknown, secret = ""): string {
  const message = error instanceof Error ? error.message : "Unexpected desktop application error.";
  return secret ? message.split(secret).join("sk-****") : message;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f6f3",
    title: "LLM API Doctor",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle(IPC_CHANNELS.run, async (event, rawInput: unknown): Promise<DiagnosticRunResponse> => {
  let apiKey = "";
  try {
    const input = validateDesktopInput(rawInput);
    apiKey = input.apiKey;
    const ownerId = event.sender.id;
    activeRuns.get(ownerId)?.abort();
    const controller = new AbortController();
    activeRuns.set(ownerId, controller);

    try {
      const report = await runDiagnostic({
        provider: input.provider,
        endpoint: input.baseUrl,
        model: input.model,
        apiKey: input.apiKey,
        ...(input.apiVersion ? { apiVersion: input.apiVersion } : {}),
        timeoutMs: input.timeoutSeconds * 1_000,
        testStream: input.testStream,
        signal: controller.signal
      });
      return { ok: true, report };
    } catch (error) {
      const cancelled = controller.signal.aborted;
      return {
        ok: false,
        cancelled,
        error: cancelled ? "Diagnostic run was cancelled." : sanitizeError(error, apiKey)
      };
    } finally {
      if (activeRuns.get(ownerId) === controller) activeRuns.delete(ownerId);
    }
  } catch (error) {
    return { ok: false, cancelled: false, error: sanitizeError(error, apiKey) };
  }
});

ipcMain.handle(IPC_CHANNELS.cancel, (event): boolean => {
  const controller = activeRuns.get(event.sender.id);
  if (!controller) return false;
  controller.abort();
  return true;
});

ipcMain.handle(IPC_CHANNELS.export, async (event, request: ExportRequest): Promise<ExportResponse> => {
  if (!request || (request.format !== "json" && request.format !== "markdown")) {
    return { ok: false, cancelled: false, error: "Unsupported report format." };
  }
  if (typeof request.content !== "string" || request.content.length > 2 * 1024 * 1024) {
    return { ok: false, cancelled: false, error: "Report content is invalid or too large." };
  }

  const extension = request.format === "json" ? "json" : "md";
  const saveOptions: SaveDialogOptions = {
    title: "Export diagnostic report",
    defaultPath: `llm-api-doctor-report.${extension}`,
    filters: [{ name: request.format === "json" ? "JSON report" : "Markdown report", extensions: [extension] }]
  };
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };

  try {
    await mkdir(dirname(result.filePath), { recursive: true });
    await writeFile(result.filePath, request.content, "utf8");
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, cancelled: false, error: sanitizeError(error) };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
