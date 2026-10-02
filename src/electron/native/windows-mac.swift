// Prints the on-screen windows (front-most first) as one JSON line whenever they change.
// Also remembers which app you're using, and when the pet app sends "refocus" on
// stdin, hands focus straight back to it (clicking the pet briefly steals focus
// because of an Electron bug on recent macOS; this undoes it).
// Compiled once on first run by the app (needs Xcode Command Line Tools, which come with git).
// Only positions and sizes are read: no window titles, no screen contents.
import Foundation
import CoreGraphics
import AppKit

setvbuf(stdout, nil, _IOLBF, 0)
let selfPid = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? -1 : -1
var last = ""
var lastChange = Date()

// The app you were last using (anything that isn't us).
var userApp: NSRunningApplication? = nil
let lock = NSLock()
var refocusWanted = false
FileHandle.standardInput.readabilityHandler = { h in
  let data = h.availableData
  if data.isEmpty { exit(0) } // the pet app quit
  if String(decoding: data, as: UTF8.self).contains("refocus") { lock.lock(); refocusWanted = true; lock.unlock() }
}

while true {
  autoreleasepool {
    if let front = NSWorkspace.shared.frontmostApplication, Int(front.processIdentifier) != selfPid { userApp = front }
    lock.lock(); let want = refocusWanted; refocusWanted = false; lock.unlock()
    if want, let app = userApp { app.activate(options: []) }
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
        out.append("{\"id\":\(id),\"x\":\(Int(r.minX)),\"y\":\(Int(r.minY)),\"w\":\(Int(r.width)),\"h\":\(Int(r.height))}")
      }
    }
    let json = "[" + out.joined(separator: ",") + "]"
    if json != last { last = json; lastChange = Date(); print(json) }
  }
  // ~60 checks a second while windows are moving, 10 a second when nothing has moved for a bit.
  // (Running the run loop instead of plain sleeping keeps "which app is in front" up to date.)
  RunLoop.current.run(until: Date().addingTimeInterval(Date().timeIntervalSince(lastChange) < 1.5 ? 0.016 : 0.1))
}
