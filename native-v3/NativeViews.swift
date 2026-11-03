import Foundation

struct NativeViews {
    let file: URL
    private(set) var views: [String:[String:Any]]

    init(file: URL) throws {
        self.file=file
        if FileManager.default.fileExists(atPath:file.path) {
            guard let parsed=try JSONSerialization.jsonObject(with:Data(contentsOf:file)) as? [String:[String:Any]] else {
                throw CocoaError(.fileReadCorruptFile)
            }
            views=parsed
        }else {views=[:]}
    }

    mutating func save(_ next:[String:[String:Any]]) throws {
        let data=try JSONSerialization.data(withJSONObject:next,options:[.prettyPrinted,.sortedKeys])
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try data.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
        views=next
    }
}
