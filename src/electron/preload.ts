// Runs before each page loads. Exposes a small, safe "petShell" bridge so pages
// can talk to the desktop shell — and nothing else (no file or system access).
import { contextBridge, ipcRenderer } from 'electron';

const on = (channel: string) => (cb: (data: any) => void) => {
  ipcRenderer.on(channel, (_e, data) => cb(data));
};

contextBridge.exposeInMainWorld('petShell', {
  // overlay
  setClickThrough: (ignore: boolean) => ipcRenderer.send('pet:clickThrough', ignore),
  sendStats: (stats: unknown) => ipcRenderer.send('pet:stats', stats),
  onCommand: on('pet:command'),
  onWindows: on('world:windows'),
  pressed: () => ipcRenderer.send('pet:pressed'),
  // shared
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfig: on('config:changed'),
  openSettings: () => ipcRenderer.send('settings:open'),
  // settings window
  setConfig: (patch: unknown) => ipcRenderer.send('config:set', patch),
  resetConfig: () => ipcRenderer.send('config:reset'),
  command: (cmd: string) => ipcRenderer.send('pet:command', cmd),
  onStats: on('pet:stats'),
});
