import Foundation
import SQLite3

enum V2StorageMigration {
    static let keys = [
        "promptmistress.workspace.annotations.v1",
        "promptmistress.workspace.annotations.v1.drafts",
        "promptmistress.workspace.favoriteTags.v1",
        "promptmistress.workspace.view.v1",
        "promptmistress.workspace.views.v1",
        "promptmistress.workspace.rules.v1"
    ]

    static func read(webkit: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/WebKit")) throws -> [String: String] {
        let identifiers = ["com.bizc0m.promptmistress", "local.promptmistress.cockpit"]
        var result: [String: String] = [:]
        for identifier in identifiers {
            let root=webkit.appendingPathComponent(identifier)
            guard let files=FileManager.default.enumerator(at:root,includingPropertiesForKeys:[.contentModificationDateKey]) else {continue}
            var databases:[URL]=[]
            for case let file as URL in files where file.lastPathComponent == "localstorage.sqlite3" {databases.append(file)}
            databases.sort { (try? $0.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate ?? .distantPast) ?? .distantPast >
                             (try? $1.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate ?? .distantPast) ?? .distantPast }
            for database in databases {
                var connection:OpaquePointer?
                guard sqlite3_open_v2(database.path,&connection,SQLITE_OPEN_READONLY,nil) == SQLITE_OK else {
                    if connection != nil {sqlite3_close(connection)}
                    continue
                }
                defer {sqlite3_close(connection)}
                for key in keys where result[key] == nil {
                    var statement:OpaquePointer?
                    guard sqlite3_prepare_v2(connection,"SELECT value FROM ItemTable WHERE key = ?",-1,&statement,nil) == SQLITE_OK else {continue}
                    let transient=unsafeBitCast(-1,to:sqlite3_destructor_type.self)
                    _ = key.withCString { sqlite3_bind_text(statement,1,$0,-1,transient) }
                    if sqlite3_step(statement) == SQLITE_ROW,let blob=sqlite3_column_blob(statement,0) {
                        let size=Int(sqlite3_column_bytes(statement,0))
                        let data=Data(bytes:blob,count:size)
                        result[key]=String(data:data,encoding:.utf16LittleEndian) ?? String(data:data,encoding:.utf8)
                    }
                    sqlite3_finalize(statement)
                }
            }
        }
        return result
    }

    static func migrate(into store: inout NativeAnnotations) throws -> Int {
        let source=try read()
        guard !source.isEmpty else {return 0}
        let directory=store.file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let snapshot=directory.appendingPathComponent("v2-webview-backup-\(UUID().uuidString).json")
        let snapshotData=try JSONSerialization.data(withJSONObject:source,options:[.prettyPrinted,.sortedKeys])
        try snapshotData.write(to:snapshot,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:snapshot.path)
        guard let text=source["promptmistress.workspace.annotations.v1"] else {return 0}
        guard let data=text.data(using:.utf8),let object=try JSONSerialization.jsonObject(with:data) as? [String:[String:Any]] else {
            throw CocoaError(.fileReadCorruptFile)
        }
        var imported=0
        for (key,annotation) in object where store.values[key] == nil {
            try store.set(key,fields:annotation)
            imported += 1
        }
        return imported
    }
}
