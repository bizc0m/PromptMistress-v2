import Foundation

struct NativeContentSize {
    let bytes: Int
    let lines: Int

    init(_ text: String) {
        bytes=text.utf8.count
        lines=text.isEmpty ? 0 : text.reduce(1) { $0 + ($1 == "\n" ? 1 : 0) }
    }
    init(bytes:Int,lines:Int){self.bytes=bytes;self.lines=lines}
}

private struct PromptScanEntry: Codable {
    let stamp:String
    let source:String
    let id:String
    let project:String
    let originID:String
    let bodyTitle:String
    let toolProvider:String
    let bytes:Int
    let lines:Int
}

private struct ChatSizeEntry: Codable {
    let stamp:String
    let bytes:Int
    let lines:Int
}

private struct WorkspaceScanCache: Codable {
    var lastFullScan:Date
    var prompts:[String:PromptScanEntry]
    var chats:[String:ChatSizeEntry]
}

struct NativeWorkspace {
    let rows: [[String: Any]]
    var summary: [String: Any]
    let archive: NativeArchive
    let promptPaths: [String: String]
    let vaults: [String]
    var contentSizes: [String: NativeContentSize] = [:]
    var scanDiagnostics: [String: Any] = [:]

    private static func fileStamp(_ path:String)->String? {
        guard let attributes=try? FileManager.default.attributesOfItem(atPath:path),
              let size=attributes[.size] as? NSNumber,
              let modified=attributes[.modificationDate] as? Date else{return nil}
        return "\(size.int64Value):\(modified.timeIntervalSince1970)"
    }

    static func load(configPath: String,progress: ((String,Int,Int)->Void)?=nil) throws -> NativeWorkspace {
        let cacheFile=URL(fileURLWithPath:configPath).deletingLastPathComponent().appendingPathComponent("scan-cache-v3.json")
        let existingCache=(try? Data(contentsOf:cacheFile)).flatMap{try? JSONDecoder().decode(WorkspaceScanCache.self,from:$0)}
        let forceFull=existingCache.map{Date().timeIntervalSince($0.lastFullScan) > 30*24*3600} ?? true
        var nextCache=WorkspaceScanCache(lastFullScan:forceFull ? Date() : existingCache!.lastFullScan,prompts:[:],chats:[:])
        let sourceData = try Data(contentsOf: URL(fileURLWithPath: configPath))
        var sources = try JSONDecoder().decode([ArchiveSource].self, from: sourceData)
        let preferences=URL(fileURLWithPath:configPath).deletingLastPathComponent().appendingPathComponent("preferences.json")
        if let data=try? Data(contentsOf:preferences),
           let object=try? JSONSerialization.jsonObject(with:data) as? [String:Any],
           let destination=object["destination"] as? String,!destination.isEmpty,
           !sources.contains(where:{$0.type == "vault" && ArchiveCore.expandHome($0.path) == ArchiveCore.expandHome(destination)}) {
            sources.append(ArchiveSource(name:"Captures ChatGPT",type:"vault",path:destination))
        }
        let archive = try ArchiveCore.load(sources:sources)
        var rows = archive.rows.map { row -> [String: Any] in
            var copy = row
            copy["kind"] = "chat"
            return copy
        }
        var summary = archive.summary
        var errors = summary["errors"] as? [[String: String]] ?? []
        var promptPaths: [String: String] = [:]
        var pathToRow: [String: Int] = [:]
        var promptSizes: [String: NativeContentSize] = [:]
        var promptCacheHits=0,chatSizeCacheHits=0
        let vaults = sources.filter { $0.type == "vault" }.map { ArchiveCore.expandHome($0.path) }
        let inputs: [(source:ArchiveSource,root:String,urls:[URL])] = sources.filter{$0.type == "vault"}.map { source in
            let root=ArchiveCore.expandHome(source.path)
            let promptRoot=URL(fileURLWithPath:root).appendingPathComponent("02_PROMPTS")
            let urls=FileManager.default.enumerator(at:promptRoot,includingPropertiesForKeys:[.isRegularFileKey],options:[.skipsHiddenFiles])?
                .compactMap{$0 as? URL}.filter{$0.pathExtension.lowercased() == "md"} ?? []
            return (source,root,urls)
        }
        let promptFileCount=inputs.reduce(0){$0+$1.urls.count}
        var totalWork=promptFileCount*3+rows.count
        var completedWork=0
        func report(_ source:String,_ phase:String){progress?("\(source) · \(phase)",completedWork,max(1,totalWork))}
        report("Bibliothèque","préparation")
        for input in inputs {
            let source=input.source,root=input.root
            do {
                let indexPath = URL(fileURLWithPath: root).appendingPathComponent("index.json")
                let value = try JSONSerialization.jsonObject(with: Data(contentsOf: indexPath))
                let items = (value as? [[String: Any]]) ?? (value as? [String: Any])?["items"] as? [[String: Any]] ?? []
                let byID = Dictionary(items.map { (ArchiveCore.string($0["id"]), $0) }, uniquingKeysWith: { first, _ in first })
                let promptRoot = URL(fileURLWithPath: root).appendingPathComponent("02_PROMPTS")
                let realPromptRoot = promptRoot.resolvingSymlinksInPath().standardizedFileURL.path
                var promptFiles: [(url: URL, file: String, id: String, project: String, body:String?, cached:PromptScanEntry?, stamp:String)] = []
                for (scanIndex,url) in input.urls.enumerated() {
                    let realFile = url.standardizedFileURL.path
                    if realFile.hasPrefix(realPromptRoot + "/") {
                        do {
                            let relative=String(realFile.dropFirst(realPromptRoot.count+1))
                            let file=promptRoot.appendingPathComponent(relative).standardizedFileURL.path
                            let stamp=fileStamp(file) ?? ""
                            if !forceFull,let cached=existingCache?.prompts[file],cached.stamp == stamp,cached.source == source.name {
                                promptFiles.append((url,file,cached.id,cached.project,nil,cached,stamp))
                                promptCacheHits += 1
                            } else {
                                let body=try String(contentsOfFile:file,encoding:.utf8)
                                let rawID=ArchiveCore.yamlField(body,"id")
                                let id=rawID.isEmpty ? url.deletingPathExtension().lastPathComponent : rawID
                                promptFiles.append((url,file,id,ArchiveCore.yamlField(body,"project"),body,nil,stamp))
                            }
                        } catch {errors.append(["source":source.name+" / "+url.lastPathComponent,"message":String(describing:error)])}
                    } else {errors.append(["source":source.name+" / "+url.lastPathComponent,"message":"Chemin hors du coffre"])}
                    completedWork += 1
                    if (scanIndex+1)%100 == 0 || scanIndex+1 == input.urls.count {report(source.name,"lecture des prompts")}
                }
                promptFiles.sort { $0.project == $1.project ? $0.id.localizedCompare($1.id) == .orderedAscending : $0.project.localizedCompare($1.project) == .orderedAscending }
                for (index,prompt) in promptFiles.enumerated() {
                    let (url, file, id, project, body, cached, stamp) = prompt
                    let originID = cached?.originID ?? ArchiveCore.yamlField(body ?? "", "origin_chat")
                    let origin = byID[originID] ?? [:]
                    let originURL = ArchiveCore.string(origin["source_url"])
                    let sourceURL = originURL.hasPrefix("http://") || originURL.hasPrefix("https://") ? originURL : ""
                    let tools = (body ?? "").split(separator: "\n").compactMap { line -> String? in
                        let trimmed = line.trimmingCharacters(in: .whitespaces)
                        return trimmed.hasPrefix("- ") ? String(trimmed.dropFirst(2)) : nil
                    }
                    let toolProvider=cached?.toolProvider ?? (tools.first(where:{["codex","claude","gemini","chatgpt","perplexity"].contains($0)}) ?? "")
                    let provider=ArchiveCore.string(origin["source"]).isEmpty ? toolProvider : ArchiveCore.string(origin["source"])
                    let bodyTitle=cached?.bodyTitle ?? promptTitle(body ?? "",fallback:"")
                    let title=bodyTitle.isEmpty ? (ArchiveCore.string(origin["title"]).isEmpty ? id : ArchiveCore.string(origin["title"])) : bodyTitle
                    let real = url.resolvingSymlinksInPath().path
                    let initialKey=ArchiveCore.digest("prompt:\(source.name):\(id)")
                    let key=promptPaths[initialKey] == nil || promptPaths[initialKey] == file ? initialKey : ArchiveCore.digest("prompt:\(source.name):\(id):\(real)")
                    let variant: [String: Any] = ["source": source.name, "path": file, "sourceURL": sourceURL,
                                                   "hasContent": true, "editor": NSNull()]
                    if let existing = pathToRow[real] {
                        var variants = rows[existing]["variants"] as? [[String: Any]] ?? []
                        variants.append(variant)
                        rows[existing]["variants"] = variants
                        rows[existing]["copies"] = variants.count
                    } else {
                        let row: [String: Any] = ["key": key, "kind": "prompt", "identity": id, "title": title,
                                                  "provider": provider, "project": project,
                                                  "updated": ArchiveCore.string(origin["updated"]), "origin": originID,
                                                  "hasContent": true, "copies": 1, "variants": [variant]]
                        pathToRow[real] = rows.count
                        promptPaths[key] = file
                        rows.append(row)
                    }
                    let size=cached.map{NativeContentSize(bytes:$0.bytes,lines:$0.lines)} ?? NativeContentSize(promptBody(body ?? ""))
                    promptSizes[key]=size
                    nextCache.prompts[file]=PromptScanEntry(stamp:stamp,source:source.name,id:id,project:project,originID:originID,bodyTitle:bodyTitle,toolProvider:toolProvider,bytes:size.bytes,lines:size.lines)
                    completedWork += 1
                    if (index+1)%100 == 0 || index+1 == promptFiles.count {report(source.name,"indexation")}
                }
                completedWork += input.urls.count-promptFiles.count
            } catch {
                errors.append(["source": source.name + " / prompts", "message": String(describing: error)])
                completedWork += input.urls.count*2
                report(source.name,"erreur du coffre")
            }
        }
        summary["errors"] = errors
        var workspace=NativeWorkspace(rows:rows,summary:summary,archive:archive,promptPaths:promptPaths,vaults:vaults)
        workspace.contentSizes=promptSizes
        totalWork=completedWork+rows.count
        for (index,row) in rows.enumerated() {
            let key=ArchiveCore.string(row["key"])
            if promptPaths[key] == nil {
                let path=archive.details[key]?.first?.path ?? ""
                let stamp=fileStamp(path) ?? ""
                if !forceFull,let cached=existingCache?.chats[key],cached.stamp == stamp,!stamp.isEmpty {
                    workspace.contentSizes[key]=NativeContentSize(bytes:cached.bytes,lines:cached.lines)
                    chatSizeCacheHits += 1
                } else if let value=try? archive.detail(key:key,variant:0),let text=value["text"] as? String {
                    workspace.contentSizes[key]=NativeContentSize(text)
                }
                if let size=workspace.contentSizes[key],!stamp.isEmpty {nextCache.chats[key]=ChatSizeEntry(stamp:stamp,bytes:size.bytes,lines:size.lines)}
            }
            completedWork += 1
            if (index+1)%100 == 0 || index+1 == rows.count {report("Bibliothèque","mesure des tailles")}
        }
        // Diagnostics du cache hors de `summary` : `summary` est comparé à V2 (test de parité).
        workspace.scanDiagnostics=["promptCacheHits":promptCacheHits,"chatSizeCacheHits":chatSizeCacheHits,"fullScan":forceFull]
        if let data=try? JSONEncoder().encode(nextCache) {
            try? data.write(to:cacheFile,options:.atomic)
            try? FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:cacheFile.path)
        }
        return workspace
    }

    func detail(key: String, variant: Int) throws -> [String: Any]? {
        guard let row = rows.first(where: { $0["key"] as? String == key }) else { return nil }
        return try detail(row:row,variant:variant)
    }

    func detail(row: [String:Any], variant: Int) throws -> [String: Any]? {
        let key=ArchiveCore.string(row["key"])
        let result: [String: Any]
        if let file = promptPaths[key] {
            let raw = try String(contentsOfFile: file, encoding: .utf8)
            let text = Self.promptBody(raw)
            result = ["title": row["title"] ?? "", "path": file,
                      "sourceURL": (row["variants"] as? [[String: Any]])?.first?["sourceURL"] ?? "",
                      "text": text, "raw": raw, "messages": [["role": "user", "content": text]]]
        } else {
            guard var chat = try archive.detail(key: key, variant: variant) else { return nil }
            let text = ArchiveCore.string(chat["text"])
            chat["raw"] = text
            chat["messages"] = Self.markdownMessages(text)
            result = chat
        }
        var detail = result
        detail["attachments"] = Self.attachments(vaults: vaults, sourceURL: ArchiveCore.string(result["sourceURL"]))
        return detail
    }

    static func promptBody(_ markdown: String) -> String {
        var body = markdown
        if let range = body.range(of: #"^---\r?\n[\s\S]*?\r?\n---\r?\n"#, options: .regularExpression) {
            body.removeSubrange(range)
        }
        let prefix = "\n# Objectif\n\n# Prompt\n\n"
        let suffix = "\n\n# Contexte requis\n\n# Résultat attendu\n\n# Notes\n"
        if body.hasPrefix(prefix) && body.hasSuffix(suffix) {
            body.removeFirst(prefix.count)
            body.removeLast(suffix.count)
        }
        return body
    }

    static func promptTitle(_ markdown: String, fallback: String) -> String {
        PromptTitle.readable(markdown, fallback: fallback)
    }

    static func markdownMessages(_ text: String) -> [[String: String]] {
        var messages: [[String: String]] = []
        var current: [String: String]?
        var inMessages = false
        var expected = 1
        var fence: Character?
        var fenceSize = 0
        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if let marker = trimmed.first, marker == "`" || marker == "~" {
                let size = trimmed.prefix(while: { $0 == marker }).count
                if size >= 3 {
                    if fence == nil { fence = marker; fenceSize = size }
                    else if fence == marker && size >= fenceSize { fence = nil; fenceSize = 0 }
                }
            }
            if fence == nil && line == "## Messages" && !inMessages { inMessages = true; continue }
            guard inMessages else { continue }
            if fence == nil, let match = line.range(of: #"^### (\d+)\. (user|assistant|system|tool)\s*$"#, options: .regularExpression) {
                let parts = line[match].split(separator: " ")
                if let number = Int(parts[1].dropLast()), number == expected {
                    if let current { messages.append(current) }
                    current = ["role": String(parts[2]), "content": ""]
                    expected += 1
                    continue
                }
            }
            if current != nil { current!["content", default: ""] += (current!["content", default: ""].isEmpty ? "" : "\n") + line }
        }
        if let current { messages.append(current) }
        return messages.map { ["role": $0["role"] ?? "", "content": ($0["content"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)] }
    }

    static func attachments(vaults: [String], sourceURL: String) -> [[String: Any]] {
        guard let url = URL(string: sourceURL), let host = url.host else { return [] }
        let source: String
        if host == "chatgpt.com" { source = "chatgpt" }
        else if host == "perplexity.ai" || host == "www.perplexity.ai" { source = "perplexity" }
        else { return [] }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, ["c", "search"].contains(parts[0]) else { return [] }
        let hash = ArchiveCore.digest(source + ":" + parts[1])
        var seen = Set<String>()
        var result: [[String: Any]] = []
        for vault in vaults {
            let manifest = URL(fileURLWithPath: vault).appendingPathComponent("ATTACHMENTS/\(hash).json")
            guard let data = try? Data(contentsOf: manifest), let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { continue }
            for item in items {
                let key = ArchiveCore.string(item["hash"]) + ":" + ArchiveCore.string(item["name"]) + ":" + ArchiveCore.string(item["ref"])
                if seen.insert(key).inserted { result.append(item) }
            }
        }
        return result
    }

    func attachmentFile(hash:String) -> URL? {
        guard hash.range(of:#"^[a-f0-9]{64}$"#,options:.regularExpression) != nil else{return nil}
        for vault in vaults {
            let folder=URL(fileURLWithPath:vault).appendingPathComponent("ATTACHMENTS").resolvingSymlinksInPath().standardizedFileURL
            let file=folder.appendingPathComponent(hash).resolvingSymlinksInPath().standardizedFileURL
            if file.path.hasPrefix(folder.path + "/"),FileManager.default.isReadableFile(atPath:file.path){return file}
        }
        return nil
    }
}
