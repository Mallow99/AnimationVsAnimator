// Prints the on-screen windows (front-most first) as one JSON line whenever they change.
// Also remembers which app you're using, and when the pet app sends "refocus" on
// stdin, hands focus straight back to it (clicking the pet briefly steals focus
// because of an Electron bug on recent macOS; this undoes it).
// "cursor X Y" on stdin moves the mouse pointer there (he grabbed it, or knocked it flying).
// "win ID X Y" moves window number ID so its top-left is at (X, Y) (he pushed or kicked it).
// Moving other apps' windows needs Accessibility permission: the first time, macOS asks.
// "ui on" / "ui off": every couple of seconds, report the app you're using, its window's title, and
// where the text and buttons in that window are (so he can sit on them). Positions only, no text
// from inside the window. Needs the same Accessibility permission.
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
var said = Set<String>()
/** Tell the pet app (once per kind of message): it shows up in the Terminal and in his settings. */
func note(_ key: String, _ text: String) {
  if said.contains(key) { return }
  said.insert(key)
  FileHandle.standardError.write((text + "\n").data(using: .utf8)!)
}
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
    }
    note("trust", "move: no Accessibility permission yet. System Settings > Privacy & Security > Accessibility: switch on the app he runs in (Terminal, or Electron), then restart him.")
    return
  }
  guard let w = axWindow(id) else {
    note("find\(pidOf[id] ?? 0)", "move: couldn't find window \(id) through Accessibility (app pid \(pidOf[id] ?? 0)); some apps don't allow it")
    return
  }
  var pt = p
  guard let v = AXValueCreate(.cgPoint, &pt) else { return }
  let err = AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, v)
  if err != .success { axCache[id] = nil; note("set\(err.rawValue)", "move: the window refused to move (AX error \(err.rawValue))") }
  else { note("ok", "move: moved a window, Accessibility works") }
}

// Lines to the pet app come from two threads: one at a time.
let outLock = NSLock()
func emit(_ s: String) { outLock.lock(); print(s); outLock.unlock() }

// ── what you're doing: the app in front, its window, and where things are in it ──
var uiOn = false
var frontPid: pid_t = -1
var frontName = ""
var manualAX = Set<pid_t>()
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func frameOf(_ e: AXUIElement) -> CGRect? {
  guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute) else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &pt)
  AXValueGetValue(s as! AXValue, .cgSize, &sz)
  return CGRect(origin: pt, size: sz)
}
func jsonString(_ s: String) -> String {
  var out = "\""
  for ch in s.prefix(80).unicodeScalars {
    switch ch {
    case "\"": out += "\\\""
    case "\\": out += "\\\\"
    default: if ch.value < 0x20 { out += " " } else { out.unicodeScalars.append(ch) }
    }
  }
  return out + "\""
}
let roles: Set<String> = ["AXStaticText", "AXButton", "AXTextField", "AXTextArea", "AXImage", "AXCheckBox", "AXPopUpButton", "AXLink"]
var lastUI = ""
var lastUIAt = Date.distantPast
func scanUI() {
  lock.lock(); let pid = frontPid, name = frontName; lock.unlock()
  if pid < 0 { return }
  var title = "", wid: CGWindowID = 0
  var els: [CGRect] = []
  if AXIsProcessTrusted() {
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.25) // never hang on a busy app
    // Apps built on Electron (Discord, Slack...) only show what's inside them when asked.
    if !manualAX.contains(pid) { manualAX.insert(pid); AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue) }
    if let w = attr(app, kAXFocusedWindowAttribute) {
      let win = w as! AXUIElement
      title = attr(win, kAXTitleAttribute) as? String ?? ""
      _ = _AXUIElementGetWindow(win, &wid)
      if let wf = frameOf(win) {
        var visited = 0
        func walk(_ e: AXUIElement, _ depth: Int) {
          if visited > 700 || els.count >= 40 || depth > 16 { return }
          visited += 1
          let role = attr(e, kAXRoleAttribute) as? String ?? ""
          if roles.contains(role), let f = frameOf(e), f.width >= 40, f.width <= 800, f.height >= 12, f.height <= 260,
             f.minY > wf.minY + 30, f.maxY < wf.maxY, f.minX >= wf.minX, f.maxX <= wf.maxX {
            els.append(f)
            return
          }
          guard let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement] else { return }
          for k in kids { walk(k, depth + 1) }
        }
        walk(win, 0)
      }
    }
  }
  let rects = els.map { "[\(Int($0.minX)),\(Int($0.minY)),\(Int($0.width)),\(Int($0.height))]" }.joined(separator: ",")
  let json = "{\"ui\":{\"app\":\(jsonString(name)),\"title\":\(jsonString(title)),\"win\":\(wid),\"trusted\":\(AXIsProcessTrusted()),\"els\":[\(rects)]}}"
  if json != lastUI || Date().timeIntervalSince(lastUIAt) > 10 { lastUI = json; lastUIAt = Date(); emit(json) }
}
DispatchQueue.global(qos: .utility).async {
  while true {
    lock.lock(); let on = uiOn; lock.unlock()
    if on { autoreleasepool { scanUI() } }
    Thread.sleep(forTimeInterval: 1.5)
  }
}

FileHandle.standardInput.readabilityHandler = { h in
  let data = h.availableData
  if data.isEmpty { exit(0) } // the pet app quit
  let text = String(decoding: data, as: UTF8.self)
  if text.contains("refocus") { lock.lock(); refocusWanted = true; lock.unlock() }
  if text.contains("ui on") { lock.lock(); uiOn = true; lock.unlock() }
  if text.contains("ui off") { lock.lock(); uiOn = false; lock.unlock() }
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
    if let front = NSWorkspace.shared.frontmostApplication, Int(front.processIdentifier) != selfPid {
      userApp = front
      lock.lock(); frontPid = front.processIdentifier; frontName = front.localizedName ?? ""; lock.unlock()
    }
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
    if json != last { last = json; lastChange = Date(); emit(json) }
  }
  // ~60 checks a second while windows are moving (or he's moving one), 10 a second when nothing has moved for a bit.
  // (Running the run loop instead of plain sleeping keeps "which app is in front" up to date.)
  lock.lock(); let more = !pendingMoves.isEmpty; lock.unlock()
  RunLoop.current.run(until: Date().addingTimeInterval(more || Date().timeIntervalSince(lastChange) < 1.5 ? 0.016 : 0.1))
}
