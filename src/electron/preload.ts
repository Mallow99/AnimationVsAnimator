// Runs before each page loads. Exposes a small, safe "petShell" bridge so pages
// can talk to the desktop shell — and nothing else (no file or system access).
import { contextBridge, ipcRenderer } from 'electron';

const on = (channel: string) => (cb: (data: any) => void) => {
  ipcRenderer.on(channel, (_e, data) => cb(data));
};

// Settings windows say which stick figure they're for in their address (settings/index.html?pet=1).
const petId = Number(new URLSearchParams(location.search).get('pet') ?? 0) || 0;

contextBridge.exposeInMainWorld('petShell', {
  // overlay (it hosts both stick figures, so it says which one each message is about)
  setClickThrough: (ignore: boolean) => ipcRenderer.send('pet:clickThrough', ignore),
  sendStats: (id: number, stats: unknown) => ipcRenderer.send('pet:stats', id, stats),
  sendCollections: (id: number, data: unknown) => ipcRenderer.send('pet:collections', id, data),
  onCommand: on('pet:command'),
  onWindows: on('world:windows'),
  onFileWindows:on('world:files'),
  onFileNote:on('world:fileNote'),
  onDesktopState:on('desktop:state'),
  onCutout:on('desktop:cutout'),
  onHabitat:on('desktop:habitat'),
  desktopAction:(id:number,action:string)=>ipcRenderer.invoke('desktop:action',id,action),
  desktopInfo:()=>ipcRenderer.invoke('desktop:info'),
  openExtensionFolder:()=>ipcRenderer.send('desktop:extensionFolder'),
  chooseHabitat:(kind='folder')=>ipcRenderer.invoke('desktop:chooseHabitat',petId,kind),
  fileHomes:(homes:unknown)=>ipcRenderer.send('desktop:fileHomes',homes),
  onWindowsLog: on('world:log'),
  onUi: on('world:ui'),
  pressed: () => ipcRenderer.send('pet:pressed'),
  moveCursor: (x: number, y: number) => ipcRenderer.send('pet:moveCursor', x, y),
  moveWindow: (id: number, x: number, y: number, w: number, h: number) => ipcRenderer.send('pet:moveWindow', id, x, y, w, h),
  ask: (id: number, req: unknown) => ipcRenderer.invoke('brain:ask', id, req),
  loadMemory: (id: number) => ipcRenderer.invoke('memory:load', id),
  saveMemory: (id: number, json: string) => ipcRenderer.send('memory:save', id, json),
  getItemDefs: () => ipcRenderer.invoke('items:defs'),
  onItemDefs: on('items:defs'),
  setTyping: (on: boolean) => ipcRenderer.send('pet:typing', on),
  getConfigs: () => ipcRenderer.invoke('config:all'),
  openSettings: (id = petId, tab?: string) => ipcRenderer.send('settings:open', id, tab),
  // shared: config changes arrive as { id, config } for either stick figure
  onConfig: on('config:changed'),
  // settings window (for the stick figure in its address)
  petId,
  getConfig: () => ipcRenderer.invoke('config:get', petId),
  setConfig: (patch: unknown) => ipcRenderer.send('config:set', petId, patch),
  resetConfig: () => ipcRenderer.send('config:reset', petId),
  command: (cmd: string) => ipcRenderer.send('pet:command', petId, cmd),
  onStats: on('pet:stats'),
  onCollections: on('pet:collections'),
  keyStatus: (provider: string) => ipcRenderer.invoke('brain:keyStatus', provider),
  listModels: () => ipcRenderer.invoke('brain:models'),
  onKeyStatus: on('brain:keyStatus'),
  setKey: (key: string) => ipcRenderer.send('brain:setKey', key),
  onTab: on('settings:tab'),
  openItemsFolder: () => ipcRenderer.send('items:openFolder'),
  reloadItems: () => ipcRenderer.send('items:reload'),
});
