// Watches where the other windows on screen are, using a small helper per OS:
//   macOS   — a tiny Swift program (compiled once, on first run)
//   Windows — a PowerShell script
// Both print one JSON line whenever windows move. Everything OS-specific lives
// here; the rest of the app only ever sees a list of rectangles.
// If anything fails, we give up quietly and he just lives on the floor.

import { app } from 'electron';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WinRect } from '../core/world';

export interface WindowWatcher {
  stop(): void;
  /** macOS: give focus back to the app the user was using. */
  refocus(): void;
  setKeyboard(on: boolean): void;
  /** Move the mouse cursor to (x, y) in screen coordinates (he grabbed it, or knocked it flying). */
  moveCursor(x: number, y: number): void;
  /** Move another app's window so its top-left is at (x, y), in the helper's own screen coordinates. */
  moveWindow(id: number, x: number, y: number): void;
  /** Report what you're doing (app, window title, where things are in it): on or off. */
  setUi(on: boolean): void;
  closeWindow(id: number): Promise<{ok: boolean; message: string}>;
}

/** What you're doing, from the helper: the app in front, its window's title, and rects of things in it (screen coords). */
export interface UiReport { app: string; title: string; win: number; trusted: boolean; document?:string; els: [number, number, number, number][] }

const nativeDir = path.join(__dirname, 'native');

/** macOS: compile the Swift helper once (cached by source hash) and return its path. */
async function macHelper(log: (m: string) => void): Promise<string | null> {
  const src = path.join(nativeDir, 'windows-mac.swift');
  const hash = createHash('sha1').update(fs.readFileSync(src)).digest('hex').slice(0, 10);
  const dir = path.join(app.getPath('userData'), 'bin');
  const bin = path.join(dir, `windows-mac-${hash}`);
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(dir, { recursive: true });
  log('compiling the window helper (first run only)…');
  return new Promise((resolve) => {
    execFile('xcrun', ['swiftc', '-O', src, '-o', bin], { timeout: 180_000 }, (err, _out, stderr) => {
      if (err) { log(`could not compile window helper: ${stderr || err.message}`); resolve(null); }
      else { log('window helper compiled'); resolve(bin); }
    });
  });
}

export function watchWindows(onUpdate: (wins: WinRect[]) => void, log: (m: string) => void, onUi: (ui: UiReport) => void = () => {}): WindowWatcher {
  let uiOn = false;
  let keyboard = false;
  let nextAction=0;
  const actions=new Map<number,{resolve:(r:{ok:boolean;message:string})=>void;timer:ReturnType<typeof setTimeout>}>();
  let child: ChildProcess | null = null;
  let stopped = false;
  let failures = 0;
  let seenAny = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let fakeTimer: ReturnType<typeof setInterval> | undefined;
  const send = (line: string) => {
    if (!stopped && child?.stdin?.writable && !child.stdin.destroyed) child.stdin.write(line);
  };

  const launch = async () => {
    if (stopped) return;
    // For testing without real windows: PET_FAKE_WINDOWS='[{"id":1,"x":100,"y":500,"w":400,"h":300}]'
    if (process.env.PET_FAKE_WINDOWS) {
      const fake = JSON.parse(process.env.PET_FAKE_WINDOWS) as WinRect[];
      fakeTimer = setInterval(() => onUpdate(fake), 500);
      return;
    }
    if (process.platform === 'darwin') {
      const bin = await macHelper(log);
      if (!bin || stopped) return;
      child = spawn(bin, [String(process.pid)], { stdio: ['pipe', 'pipe', 'pipe'] });
    } else if (process.platform === 'win32') {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        path.join(nativeDir, 'windows-win.ps1'), '-SelfPid', String(process.pid)], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } else {
      log('window awareness is only available on macOS and Windows');
      return;
    }
    const running = child;
    running.once('spawn', () => { if (uiOn) send('ui on\n'); if (keyboard && process.platform === 'darwin') send('keyboard on\n'); });
    // A helper that can't spawn, or a pipe closed while moving a window, should not crash the pet.
    running.on('error', (err) => log(`could not start window helper: ${err.message}`));
    running.stdin?.on('error', (err) => log(`window helper input closed: ${err.message}`));
    let buf = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const data = JSON.parse(line) as WinRect[] | { ui?: UiReport; action?: {id:number;ok:boolean;message:string} };
          if (!Array.isArray(data)) { if(data.action){const wait=actions.get(data.action.id);if(wait){clearTimeout(wait.timer);actions.delete(data.action.id);wait.resolve(data.action);}} if (data?.ui) onUi(data.ui); continue; }
          if (!seenAny) { seenAny = true; log(`helper running: sees ${data.length} window(s)`); }
          onUpdate(data); failures = 0;
        } catch { /* half a line or noise: skip */ }
      }
    });
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (d: string) => log(d.trim()));
    child.on('close', (code) => {
      if (child === running) child = null;
      if (stopped) return;
      onUpdate([]);
      if (++failures > 5) { log(`window helper keeps exiting (code ${code}); giving up`); return; }
      retry = setTimeout(() => { launch().catch((e) => log(String(e))); }, 2000 * failures);
    });
  };
  launch().catch((e) => log(String(e)));

  return {
    stop() { for(const wait of actions.values()){clearTimeout(wait.timer);wait.resolve({ok:false,message:'The window helper stopped.'});}actions.clear(); stopped = true; clearTimeout(retry); clearInterval(fakeTimer); child?.kill(); },
    refocus() { if (process.platform === 'darwin' && !keyboard) send('refocus\n'); },
    setKeyboard(on) { keyboard = on; if (process.platform === 'darwin') send(on ? 'keyboard on\n' : 'keyboard off\n'); },
    moveCursor(x, y) { if ([x, y].every(Number.isFinite)) send(`cursor ${Math.round(x)} ${Math.round(y)}\n`); },
    moveWindow(id, x, y) { if ([id, x, y].every(Number.isFinite)) send(`win ${Math.round(id)} ${Math.round(x)} ${Math.round(y)}\n`); },
    closeWindow(id) {
      if(!Number.isSafeInteger(id) || !child?.stdin?.writable)return Promise.resolve({ok:false,message:'The window helper is unavailable.'});
      const action=++nextAction;
      return new Promise(resolve=>{const timer=setTimeout(()=>{actions.delete(action);resolve({ok:false,message:'The window did not respond.'});},3000);actions.set(action,{resolve,timer});send(`close ${action} ${id}\n`);});
    },
    setUi(on) { uiOn = on; send(on ? 'ui on\n' : 'ui off\n'); },
  };
}
