// Prints the on-screen windows (front-most first) as one JSON line whenever they change.
// Compiled once on first run by the app (needs Xcode Command Line Tools, which come with git).
// Only positions and sizes are read: no window titles, no screen contents.
import Foundation
import CoreGraphics

setvbuf(stdout, nil, _IOLBF, 0)
let selfPid = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? -1 : -1
var last = ""

while true {
  autoreleasepool {
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
    if json != last { last = json; print(json) }
  }
  usleep(100_000) // 10 times a second
}
