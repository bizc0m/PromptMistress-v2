import Foundation

struct NativeAnnotations {
    private(set) var values: [String: [String: Any]]
    let file: URL

    init(file: URL) throws {
        self.file = file
        if FileManager.default.fileExists(atPath: file.path) {
            let data = try Data(contentsOf: file)
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] else {
                throw CocoaError(.fileReadCorruptFile)
            }
            values = object
        } else {
            values = [:]
        }
    }

    func get(_ key: String) -> [String: Any] { values[key] ?? [:] }

    mutating func set(_ key: String, fields: [String: Any]) throws {
        var updated = values
        updated[key] = fields
        let data = try JSONSerialization.data(withJSONObject: updated, options: [.prettyPrinted, .sortedKeys])
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        values = updated
    }

    mutating func update(_ keys: [String], field: String, value: Any) throws {
        var updated = values
        for key in keys {
            updated[key, default: [:]][field] = value
            var manual=updated[key]?["_manual"] as? [String] ?? []
            if !manual.contains(field){manual.append(field)}
            updated[key]?["_manual"]=manual
        }
        let data = try JSONSerialization.data(withJSONObject: updated, options: [.prettyPrinted, .sortedKeys])
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        values = updated
    }

    mutating func addValues(_ keys: [String], field: String, values newValues: [String]) throws {
        var updated=values
        for key in keys {
            let original=updated[key]?[field] as? [String] ?? []
            updated[key,default:[:]][field]=Array(Set(original + newValues)).sorted()
            var manual=updated[key]?["_manual"] as? [String] ?? []
            if !manual.contains(field){manual.append(field)}
            updated[key]?["_manual"]=manual
        }
        let data=try JSONSerialization.data(withJSONObject:updated,options:[.prettyPrinted,.sortedKeys])
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try data.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
        values=updated
    }
}
