# Real Explorer folder identities. Read-only COM query; no files or windows are modified.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FolderFrame {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[FolderFrame]::SetProcessDPIAware() | Out-Null
$explorer = New-Object -ComObject Shell.Application
$out = @()
foreach ($window in $explorer.Windows()) {
  try {
    if ([IO.Path]::GetFileName($window.FullName) -ne 'explorer.exe') { continue }
    $handle = [IntPtr]([long]$window.HWND)
    if (-not [FolderFrame]::IsWindowVisible($handle) -or [FolderFrame]::IsIconic($handle)) { continue }
    $folderPath = [string]$window.Document.Folder.Self.Path
    if (-not [IO.Path]::IsPathRooted($folderPath) -or -not [IO.Directory]::Exists($folderPath)) { continue }
    $r = New-Object FolderFrame+RECT
    if (-not [FolderFrame]::GetWindowRect($handle, [ref]$r)) { continue }
    $out += @{id=[long]$window.HWND;path=$folderPath;kind='folder';x=$r.L;y=$r.T;width=$r.R-$r.L;height=$r.B-$r.T}
  } catch { }
}
ConvertTo-Json -InputObject @($out) -Compress
