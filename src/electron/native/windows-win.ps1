# Prints the visible top-level windows (front-most first) as one JSON line whenever they change.
# Only positions and sizes are read: no window titles, no screen contents.
# "cursor X Y" on stdin moves the mouse pointer there (he grabbed it, or knocked it flying).
# "win ID X Y" moves that window so its visible top-left corner is at (X, Y) (he pushed or kicked it).
# "ui on" / "ui off": every couple of seconds, also report which app you're using and its window title
# (so he can comment on it). Nothing from inside the window.
param([int]$SelfPid = -1)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class PetWindows {
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  // Windows have invisible resize borders around what you see; the app sends where the visible
  // part should go, so shift by the difference. Maximized windows stay put.
  static void MoveWin(long id, int x, int y) {
    var h = new IntPtr(id);
    if (!IsWindow(h) || IsZoomed(h)) return;
    RECT wr, fr;
    if (!GetWindowRect(h, out wr)) return;
    if (DwmGetWindowAttribute(h, 9, out fr, 16) != 0) fr = wr;
    // NOSIZE | NOZORDER | NOACTIVATE | ASYNCWINDOWPOS (don't wait on a busy app)
    if (SetWindowPos(h, IntPtr.Zero, x - (fr.L - wr.L), y - (fr.T - wr.T), 0, 0, 0x0001 | 0x0004 | 0x0010 | 0x4000)) Note("ok", "move: moved a window");
    else Note("fail", "move: a window refused to move (it may belong to an app running as administrator)");
  }
  static System.Collections.Generic.HashSet<string> said = new System.Collections.Generic.HashSet<string>();
  static void Note(string key, string text) { lock (said) { if (said.Add(key)) { Console.Error.WriteLine(text); Console.Error.Flush(); } } }
  public static volatile bool UiOn = false;
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  static string Json(string s) {
    var b = new StringBuilder("\"");
    foreach (var c in s.Length > 80 ? s.Substring(0, 80) : s) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < ' ') b.Append(' '); else b.Append(c); }
    return b.Append('"').ToString();
  }
  /** The app you're using and its window's title, as one JSON line (or null if nothing's in front). */
  public static string Ui(uint self) {
    var h = GetForegroundWindow();
    if (h == IntPtr.Zero) return null;
    uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid == self) return null;
    var t = new StringBuilder(256); GetWindowText(h, t, 256);
    string app = "";
    try { app = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    return "{\"ui\":{\"app\":" + Json(app) + ",\"title\":" + Json(t.ToString()) + ",\"win\":" + h.ToInt64() + ",\"trusted\":true,\"els\":[]}}";
  }
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  static void CloseWin(int request, long id) {
    var h = new IntPtr(id);
    bool ok = IsWindow(h) && IsWindowVisible(h) && PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero);
    string message = ok ? "Close requested. The app may ask you to save." : "The app refused to close its window.";
    Console.Out.WriteLine("{\"action\":{\"id\":" + request + ",\"ok\":" + (ok ? "true" : "false") + ",\"message\":" + Json(message) + "}}"); Console.Out.Flush();
  }
  public static void ListenForCursor() {
    var t = new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        var p = line.Split(' ');
        int x, y; long id;
        if (p.Length == 3 && p[0] == "cursor" && int.TryParse(p[1], out x) && int.TryParse(p[2], out y)) SetCursorPos(x, y);
        else if (p.Length == 4 && p[0] == "win" && long.TryParse(p[1], out id) && int.TryParse(p[2], out x) && int.TryParse(p[3], out y)) MoveWin(id, x, y);
        else if (p.Length == 3 && p[0] == "close" && int.TryParse(p[1], out x) && long.TryParse(p[2], out id)) CloseWin(x, id);
        else if (line == "ui on") UiOn = true;
        else if (line == "ui off") UiOn = false;
      }
    });
    t.IsBackground = true;
    t.Start();
  }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static string List(uint self) {
    var sb = new StringBuilder("[");
    bool first = true;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;           // tool windows
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);       // hidden / other virtual desktop
      if (cloaked != 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == self) return true;                                    // our own windows
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true; // visible frame, no shadow
      int w = r.R - r.L, hh = r.B - r.T;
      if (w < 80 || hh < 40) return true;
      if (!first) sb.Append(","); first = false;
      sb.Append("{\"id\":").Append(h.ToInt64()).Append(",\"x\":").Append(r.L).Append(",\"y\":").Append(r.T)
        .Append(",\"w\":").Append(w).Append(",\"h\":").Append(hh).Append("}");
      return true;
    }, IntPtr.Zero);
    return sb.Append("]").ToString();
  }
}
"@
[PetWindows]::SetProcessDPIAware() | Out-Null   # report real pixels; the app converts them
[PetWindows]::ListenForCursor()
$last = ''
$lastUi = ''
$uiAt = [DateTime]::MinValue
$lastChange = [DateTime]::Now
while ($true) {
  $json = [PetWindows]::List([uint32]$SelfPid)
  if ($json -ne $last) { $last = $json; $lastChange = [DateTime]::Now; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
  if ([PetWindows]::UiOn -and ([DateTime]::Now - $uiAt).TotalSeconds -gt 1.5) {
    $uiAt = [DateTime]::Now
    $ui = [PetWindows]::Ui([uint32]$SelfPid)
    if ($ui -and $ui -ne $lastUi) { $lastUi = $ui; [Console]::Out.WriteLine($ui); [Console]::Out.Flush() }
  }
  # ~60 checks a second while windows are moving, 10 a second when nothing has moved for a bit.
  if (([DateTime]::Now - $lastChange).TotalSeconds -lt 1.5) { Start-Sleep -Milliseconds 16 } else { Start-Sleep -Milliseconds 100 }
}
