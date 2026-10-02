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
  sendCollections: (data: unknown) => ipcRenderer.send('pet:collections', data),
  onCommand: on('pet:command'),
  onWindows: on('world:windows'),
  pressed: () => ipcRenderer.send('pet:pressed'),
  moveCursor: (x: number, y: number) => ipcRenderer.send('pet:moveCursor', x, y),
  moveWindow: (id: number, x: number, y: number, w: number, h: number) => ipcRenderer.send('pet:moveWindow', id, x, y, w, h),
  ask: (req: unknown) => ipcRenderer.invoke('brain:ask', req),
  loadMemory: () => ipcRenderer.invoke('memory:load'),
  getItemDefs: () => ipcRenderer.invoke('items:defs'),
  onItemDefs: on('items:defs'),
  setTyping: (on: boolean) => ipcRenderer.send('pet:typing', on),
  openItemsFolder: () => ipcRenderer.send('items:openFolder'),
  reloadItems: () => ipcRenderer.send('items:reload'),
  saveMemory: (json: string) => ipcRenderer.send('memory:save', json),
  // shared
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfig: on('config:changed'),
  openSettings: () => ipcRenderer.send('settings:open'),
  // settings window
  setConfig: (patch: unknown) => ipcRenderer.send('config:set', patch),
  resetConfig: () => ipcRenderer.send('config:reset'),
  command: (cmd: string) => ipcRenderer.send('pet:command', cmd),
  onStats: on('pet:stats'),
  onCollections: on('pet:collections'),
  keyStatus: (provider: string) => ipcRenderer.invoke('brain:keyStatus', provider),
  listModels: () => ipcRenderer.invoke('brain:models'),
  onKeyStatus: on('brain:keyStatus'),
  setKey: (key: string) => ipcRenderer.send('brain:setKey', key),
  onTab: on('settings:tab'),
});
