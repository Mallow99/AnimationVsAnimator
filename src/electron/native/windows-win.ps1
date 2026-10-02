# Prints the visible top-level windows (front-most first) as one JSON line whenever they change.
# Only positions and sizes are read: no window titles, no screen contents.
param([int]$SelfPid = -1)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PetWindows {
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
      sb.Append("{\"id\":").Append(h.ToInt64() & 0x7fffffff).Append(",\"x\":").Append(r.L).Append(",\"y\":").Append(r.T)
        .Append(",\"w\":").Append(w).Append(",\"h\":").Append(hh).Append("}");
      return true;
    }, IntPtr.Zero);
    return sb.Append("]").ToString();
  }
}
"@
[PetWindows]::SetProcessDPIAware() | Out-Null   # report real pixels; the app converts them
$last = ''
while ($true) {
  $json = [PetWindows]::List([uint32]$SelfPid)
  if ($json -ne $last) { $last = $json; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 100
}
