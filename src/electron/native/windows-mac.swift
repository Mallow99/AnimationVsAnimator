// Prints the on-screen windows (front-most first) as one JSON line whenever they change.
// Also remembers which app you're using, and when the pet app sends "refocus" on
// stdin, hands focus straight back to it (clicking the pet briefly steals focus
// because of an Electron bug on recent macOS; this undoes it).
// "cursor X Y" on stdin moves the mouse pointer there (he grabbed it, or knocked it flying).
// "win ID X Y" moves window number ID so its top-left is at (X, Y) (he pushed or kicked it).
// Moving other apps' windows needs Accessibility permission: the first time, macOS asks.
// Compiled once on first run by the app (needs Xcode Command Line Tools, which come with git).
// Only positions and sizes are read: no window titles, no screen contents.
import Foundation
import CoreGraphics
import AppKit
import ApplicationServices

// Private but long-standing (window managers like Rectangle use it): which window number an
// accessibility window element is. That's how we find the window the pet app asked about.
@_silgen_name("_AXUIElementGetWindow") @discardableResult
func _AXUIElementGetWindow(_ element: AXUIElement, _ identifier: UnsafeMutablePointer<CGWindowID>) -> AXError

setvbuf(stdout, nil, _IOLBF, 0)
let selfPid = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? -1 : -1
var last = ""
var lastChange = Date()

// The app you were last using (anything that isn't us).
var userApp: NSRunningApplication? = nil
let lock = NSLock()
var refocusWanted = false
// Window moves waiting to happen (only the newest per window matters), done on the main loop.
var pendingMoves: [Int: CGPoint] = [:]
var pidOf: [Int: pid_t] = [:]
var axCache: [Int: AXUIElement] = [:]
var askedTrust = false
// Don't freeze the real mouse for a moment after we move the pointer (macOS does that by default).
CGEventSource(stateID: .combinedSessionState)?.localEventsSuppressionInterval = 0

func axWindow(_ id: Int) -> AXUIElement? {
  if let w = axCache[id] { return w }
  guard let pid = pidOf[id] else { return nil }
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXWindowsAttribute as CFString, &value) == .success,
        let wins = value as? [AXUIElement] else { return nil }
  for w in wins {
    var wid: CGWindowID = 0
    if _AXUIElementGetWindow(w, &wid) == .success && Int(wid) == id { axCache[id] = w; return w }
  }
  return nil
}

func moveWindow(_ id: Int, _ p: CGPoint) {
  if !AXIsProcessTrusted() {
    if !askedTrust {
      askedTrust = true
      _ = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
      FileHandle.standardError.write("moving windows needs Accessibility permission: System Settings > Privacy & Security > Accessibility\n".data(using: .utf8)!)
    }
    return
  }
  guard let w = axWindow(id) else { return }
  var pt = p
  guard let v = AXValueCreate(.cgPoint, &pt) else { return }
  if AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, v) != .success { axCache[id] = nil }
}

FileHandle.standardInput.readabilityHandler = { h in
  let data = h.availableData
  if data.isEmpty { exit(0) } // the pet app quit
  let text = String(decoding: data, as: UTF8.self)
  if text.contains("refocus") { lock.lock(); refocusWanted = true; lock.unlock() }
  for line in text.split(separator: "\n") where line.hasPrefix("win ") {
    let parts = line.split(separator: " ")
    if parts.count == 4, let id = Int(parts[1]), let x = Double(parts[2]), let y = Double(parts[3]) {
      lock.lock(); pendingMoves[id] = CGPoint(x: x, y: y); lock.unlock()
    }
  }
  // Only the newest cursor position matters.
  if let line = text.split(separator: "\n").last(where: { $0.hasPrefix("cursor ") }) {
    let parts = line.split(separator: " ")
    if parts.count == 3, let x = Double(parts[1]), let y = Double(parts[2]) {
      CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
      CGAssociateMouseAndMouseCursorPosition(1) // keep the mouse responsive right after the move
    }
  }
}

while true {
  autoreleasepool {
    if let front = NSWorkspace.shared.frontmostApplication, Int(front.processIdentifier) != selfPid { userApp = front }
    lock.lock(); let want = refocusWanted; refocusWanted = false; let moves = pendingMoves; pendingMoves = [:]; lock.unlock()
    if want, let app = userApp { app.activate(options: []) }
    for (id, p) in moves { moveWindow(id, p) }
    var out: [String] = []
    let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
      for w in list {
        guard (w[kCGWindowLayer as String] as? Int) == 0 else { continue } // normal app windows only
        if (w[kCGWindowOwnerPID as String] as? Int) == selfPid { continue } // not our own overlay
        if let a = w[kCGWindowAlpha as String] as? Double, a < 0.1 { continue }
        guard let b = w[kCGWindowBounds as String] as? [String: Any],
              let r = CGRect(dictionaryRepresentation: b as CFDictionary) else { continue }
        if r.width < 80 || r.height < 40 { continue }
        let id = w[kCGWindowNumber as String] as? Int ?? 0
        if let pid = w[kCGWindowOwnerPID as String] as? Int { pidOf[id] = pid_t(pid) }
        out.append("{\"id\":\(id),\"x\":\(Int(r.minX)),\"y\":\(Int(r.minY)),\"w\":\(Int(r.width)),\"h\":\(Int(r.height))}")
      }
    }
    let json = "[" + out.joined(separator: ",") + "]"
    if json != last { last = json; lastChange = Date(); print(json) }
  }
  // ~60 checks a second while windows are moving (or he's moving one), 10 a second when nothing has moved for a bit.
  // (Running the run loop instead of plain sleeping keeps "which app is in front" up to date.)
  lock.lock(); let more = !pendingMoves.isEmpty; lock.unlock()
  RunLoop.current.run(until: Date().addingTimeInterval(more || Date().timeIntervalSince(lastChange) < 1.5 ? 0.016 : 0.1))
}
