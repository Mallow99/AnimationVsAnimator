// Runs before the page loads. Exposes a tiny, safe "petShell" bridge so the
// page can ask the desktop shell to do OS things — and nothing else.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petShell', {
  setClickThrough: (ignore: boolean) => ipcRenderer.send('pet:clickThrough', ignore),
});
