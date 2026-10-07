import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AccessDeskApi } from '../shared/ipc';

const api: AccessDeskApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    save: (input) => ipcRenderer.invoke(IPC.settingsSave, input),
    testConnection: (input) => ipcRenderer.invoke(IPC.settingsTest, input),
  },
  auth: {
    status: () => ipcRenderer.invoke(IPC.authStatus),
    login: () => ipcRenderer.invoke(IPC.authLogin),
    cancelLogin: () => ipcRenderer.invoke(IPC.authCancel),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
  },
  api: {
    get: (path, query) => ipcRenderer.invoke(IPC.apiGet, { path, query }),
  },
};

contextBridge.exposeInMainWorld('accessdesk', api);
