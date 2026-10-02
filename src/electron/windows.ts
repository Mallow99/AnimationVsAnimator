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

export interface WindowWatcher { stop(): void }

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
      else resolve(bin);
    });
  });
}

export function watchWindows(onUpdate: (wins: WinRect[]) => void, log: (m: string) => void): WindowWatcher {
  let child: ChildProcess | null = null;
  let stopped = false;
  let failures = 0;

  const launch = async () => {
    if (stopped) return;
    // For testing without real windows: PET_FAKE_WINDOWS='[{"id":1,"x":100,"y":500,"w":400,"h":300}]'
    if (process.env.PET_FAKE_WINDOWS) {
      const fake = JSON.parse(process.env.PET_FAKE_WINDOWS) as WinRect[];
      const timer = setInterval(() => (stopped ? clearInterval(timer) : onUpdate(fake)), 500);
      return;
    }
    if (process.platform === 'darwin') {
      const bin = await macHelper(log);
      if (!bin || stopped) return;
      child = spawn(bin, [String(process.pid)], { stdio: ['ignore', 'pipe', 'pipe'] });
    } else if (process.platform === 'win32') {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        path.join(nativeDir, 'windows-win.ps1'), '-SelfPid', String(process.pid)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } else {
      log('window awareness is only available on macOS and Windows');
      return;
    }
    let buf = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try { onUpdate(JSON.parse(line)); failures = 0; } catch { /* half a line or noise: skip */ }
      }
    });
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (d: string) => log(d.trim()));
    child.on('exit', (code) => {
      child = null;
      if (stopped) return;
      onUpdate([]);
      if (++failures > 5) { log(`window helper keeps exiting (code ${code}); giving up`); return; }
      setTimeout(launch, 2000 * failures); // try again, waiting a bit longer each time
    });
  };
  launch().catch((e) => log(String(e)));

  return { stop() { stopped = true; child?.kill(); } };
}
