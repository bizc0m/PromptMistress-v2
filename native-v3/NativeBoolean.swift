import Foundation

enum NativeBoolean {
    static func evaluate(query:String,workspace:NativeWorkspace,annotations:[String:[String:Any]],
                         includeText:Bool,node:URL,script:URL) throws -> Set<String> {
        let documents:[[String:Any]]=workspace.rows.map { row in
            let key=ArchiveCore.string(row["key"]),annotation=annotations[key] ?? [:]
            var fields=["title","project"].map{ArchiveCore.string(row[$0])}
            fields.append(ArchiveCore.string(annotation["note"]))
            fields.append(contentsOf:annotation["folders"] as? [String] ?? [])
            if includeText {
                let count=(row["variants"] as? [[String:Any]])?.count ?? 1
                for variant in 0..<count {
                    if let detail=try? workspace.detail(key:key,variant:variant) {fields.append(ArchiveCore.string(detail["text"]))}
                }
            }
            let tags=annotation["tags"] as? [String] ?? []
            return ["Key":key,"Fields":fields.filter{!$0.isEmpty},
                    "Tags":tags.filter{$0.hasPrefix("#")}.map{String($0.dropFirst())},
                    "Entities":tags.filter{$0.hasPrefix("@")}.map{String($0.dropFirst())}]
        }
        let input=try JSONSerialization.data(withJSONObject:["Query":query,"Documents":documents])
        let file=FileManager.default.temporaryDirectory.appendingPathComponent("promptmistress-nyx-\(UUID().uuidString).json")
        try input.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
        defer{try? FileManager.default.removeItem(at:file)}
        let process=Process();process.executableURL=node;process.arguments=[script.path,file.path]
        process.currentDirectoryURL=script.deletingLastPathComponent().deletingLastPathComponent()
        let output=Pipe(),errors=Pipe();process.standardOutput=output;process.standardError=errors
        try process.run()
        let bytes=output.fileHandleForReading.readDataToEndOfFile()
        let errorText=String(data:errors.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {throw NSError(domain:"NyxBoolean",code:Int(process.terminationStatus),userInfo:[NSLocalizedDescriptionKey:errorText.isEmpty ? "Recherche interrompue." : errorText])}
        let result=try JSONSerialization.jsonObject(with:bytes) as? [String:Any] ?? [:]
        if let message=result["error"] as? String {throw NSError(domain:"NyxBoolean",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
        return Set(result["keys"] as? [String] ?? [])
    }
}
