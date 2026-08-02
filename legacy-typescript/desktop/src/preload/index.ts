import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type DesktopApi,
  type DesktopDiagnosticInput,
  type ExportRequest
} from "../shared/contracts.js";

const desktopApi: DesktopApi = {
  runDiagnostic: (input: DesktopDiagnosticInput) => ipcRenderer.invoke(IPC_CHANNELS.run, input),
  cancelDiagnostic: () => ipcRenderer.invoke(IPC_CHANNELS.cancel),
  exportReport: (request: ExportRequest) => ipcRenderer.invoke(IPC_CHANNELS.export, request)
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
