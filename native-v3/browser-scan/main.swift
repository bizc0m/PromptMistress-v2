import Foundation
let data = try JSONEncoder().encode(BrowserVisibleCapture.snapshots())
FileHandle.standardOutput.write(data)
