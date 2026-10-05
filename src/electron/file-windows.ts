// Discover real Finder / Explorer folder windows. Never create a surrogate file or room.
import { execFile, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { FileWindow } from '../shared/desktop';

// Fixed code, with no path interpolation. Finder may ask for Automation permission on macOS.
const finderScript = `ObjC.import('Foundation');
const finder=Application('Finder');
const out=[];
for(const w of finder.windows()) {
  try {
    const url=w.target().url(), b=w.bounds();
    if(!url.startsWith('file://'))continue;
    const p=$.NSURL.URLWithString($(url)).path.js;
    out.push({path:p,kind:'folder',id:0,x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]});
  }catch(e){}
}
JSON.stringify(out);`;
export function watchFileWindows(
  update: (windows: FileWindow[]) => void,
  note: (text: string) => void,
) {
  let stopped = false,
    busy = false,
    child: ChildProcess | null = null,
    lastError = '';
  const read = () => {
    if (stopped || busy) return;
    const args =
      process.platform === 'darwin'
        ? ['-l', 'JavaScript', '-e', finderScript]
        : [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            path.join(__dirname, 'native/file-windows-win.ps1'),
          ];
    if (!['darwin', 'win32'].includes(process.platform)) {
      note('Finder / Explorer visits need macOS or Windows.');
      return;
    }
    busy = true;
    child = execFile(
      process.platform === 'darwin' ? 'osascript' : 'powershell.exe',
      args,
      { timeout: 3000, maxBuffer: 300_000, windowsHide: true },
      (err, output) => {
        busy = false;
        child = null;
        if (stopped) return;
        if (err) {
          const message = err.message.includes('-1743')
            ? 'Allow Finder under System Settings → Privacy & Security → Automation for folder visits.'
            : 'Folder windows could not be read. Check Finder / Explorer permissions.';
          if (message !== lastError) {
            note(message);
            lastError = message;
          }
          update([]);
          return;
        }
        try {
          const parsed = JSON.parse(output);
          const windows = (Array.isArray(parsed) ? parsed : [parsed])
            .filter(
              (w: FileWindow) =>
                w &&
                typeof w.path === 'string' &&
                w.path.length < 4096 &&
                [w.id, w.x, w.y, w.width, w.height].every(Number.isFinite) &&
                w.width > 100 &&
                w.height > 100,
            )
            .slice(0, 40);
          update(windows);
          lastError = '';
        } catch {
          update([]);
        }
      },
    );
  };
  read();
  const timer = setInterval(read, 1500);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      child?.kill();
    },
  };
}
