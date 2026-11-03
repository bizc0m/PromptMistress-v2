import Foundation

enum NativeExport {
    enum Format: String { case markdown, text, json, zip, corpus }
    enum Mode: String { case all, questions, answers, raw }

    static func records(workspace: NativeWorkspace, keys: [String], annotations: NativeAnnotations?,
                        allVariants: Bool, mode: Mode, effectiveAnnotations:[String:[String:Any]] = [:],rowLookup:[String:[String:Any]]? = nil) throws -> [[String: Any]] {
        var result: [[String: Any]] = []
        let rowsByKey=rowLookup ?? Dictionary(workspace.rows.map{(ArchiveCore.string($0["key"]),$0)},uniquingKeysWith:{first,_ in first})
        for key in keys {
            guard let row=rowsByKey[key] else {continue}
            let annotation=effectiveAnnotations[key] ?? annotations?.get(key) ?? [:]
            let title=ArchiveCore.string(annotation["title"]).trimmingCharacters(in:.whitespacesAndNewlines)
            let variants=row["variants"] as? [[String:Any]] ?? []
            let preferred=max(0,variants.firstIndex(where:{$0["hasContent"] as? Bool == true}) ?? 0)
            let indices=allVariants ? Array(0..<max(variants.count,1)) : [preferred]
            for index in indices {
                guard let detail=try workspace.detail(row:row,variant:index) else {continue}
                let messages=detail["messages"] as? [[String:String]] ?? []
                let body:String
                switch mode {
                case .raw: body=ArchiveCore.string(detail["raw"])
                case .all: body=ArchiveCore.string(detail["text"])
                case .questions,.answers:
                    let role=mode == .questions ? "user" : "assistant"
                    guard !messages.isEmpty else {throw NSError(domain:"PromptMistress",code:1,userInfo:[NSLocalizedDescriptionKey:"Rôles indisponibles pour « \(ArchiveCore.string(row["title"])) ». Exportez le texte complet."])}
                    body=messages.filter{$0["role"] == role}.compactMap{$0["content"]}.joined(separator:"\n\n")
                }
                result.append(["key":key,"title":title.isEmpty ? row["title"] ?? "" : title,"kind":row["kind"] ?? "",
                    "provider":row["provider"] ?? "","project":row["project"] ?? "","updated":row["updated"] ?? "",
                    "variant":index+1,"sourceURL":detail["sourceURL"] ?? "","text":body,
                    "annotations":annotation,"attachments":detail["attachments"] ?? []])
            }
        }
        return result
    }

    static func render(_ records: [[String:Any]],format: Format) throws -> Data {
        if format == .json {return try JSONSerialization.data(withJSONObject:records,options:[.prettyPrinted,.sortedKeys])}
        let blocks=records.map { record -> String in
            let title=ArchiveCore.string(record["title"]),body=ArchiveCore.string(record["text"])
            guard format != .text else{return title + "\n\n" + body}
            let source=ArchiveCore.string(record["sourceURL"])
            let header="# " + title + "\n\n" + (source.isEmpty ? "" : "Source : " + source + "\n\n")
            return header + body
        }
        return Data(blocks.joined(separator:"\n\n---\n\n").utf8)
    }

    static func write(_ records: [[String:Any]],format: Format,to destination: URL) throws {
        if format == .corpus { try writeCorpus(records,to:destination); return }
        if format != .zip {try render(records,format:format).write(to:destination,options:.atomic);return}
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent("promptmistress-export-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        defer {try? FileManager.default.removeItem(at:folder)}
        for (index,record) in records.enumerated() {
            let title=ArchiveCore.string(record["title"])
            let safe=String(title.unicodeScalars.map{CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" ? Character($0) : "-"}).prefix(80)
            let file=folder.appendingPathComponent(String(format:"%04d-",index+1) + safe + ".md")
            try render([record],format:.markdown).write(to:file,options:.atomic)
        }
        try render(records,format:.json).write(to:folder.appendingPathComponent("index.json"),options:.atomic)
        let process=Process();process.executableURL=URL(fileURLWithPath:"/usr/bin/ditto")
        process.arguments=["-c","-k","--sequesterRsrc",folder.path,destination.path]
        try process.run();process.waitUntilExit()
        guard process.terminationStatus == 0 else {throw NSError(domain:"PromptMistress",code:Int(process.terminationStatus),userInfo:[NSLocalizedDescriptionKey:"Création ZIP échouée."])}
    }

    private static func writeCorpus(_ records:[[String:Any]],to destination:URL) throws {
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent("promptmistress-corpus-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        defer {try? FileManager.default.removeItem(at:folder)}
        var included:[String]=[],report:[String]=[]
        for (index,record) in records.enumerated() {
            let title=oneLine(record["title"]),body=ArchiveCore.string(record["text"])
            let warning=oneLine(record["warning"])
            guard !body.isEmpty else {report.append("- \(title) : \(warning.isEmpty ? "Sans contenu" : warning)");continue}
            let category=ArchiveCore.string(record["kind"]) == "prompt" ? "Prompts" : "Conversations"
            let filename="\(category)/\(String(format:"%03d",index+1))-\(safeFileName(title)).md"
            let header="# \(title)\n\nPlateforme : \(oneLine(record["provider"]))\nDate : \(oneLine(record["updated"]))\nSource : \(oneLine(record["sourceURL"]).isEmpty ? "Non disponible" : oneLine(record["sourceURL"]))\n"
            let content=header+(warning.isEmpty ? "" : "\nLimite : \(warning)\n")+"\n"+body
            let file=folder.appendingPathComponent(filename)
            try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
            try Data(content.utf8).write(to:file,options:.atomic)
            included.append(content)
            let link=filename.split(separator:"/").map{String($0).addingPercentEncoding(withAllowedCharacters:.urlPathAllowed) ?? String($0)}.joined(separator:"/")
            report.append("- [\(title.replacingOccurrences(of:"[",with:"").replacingOccurrences(of:"]",with:""))](\(link))"+(warning.isEmpty ? "" : " — \(warning)"))
        }
        let readme="# Corpus PromptMistress\n\n\(included.count) éléments avec texte sur \(records.count) entrées demandées.\n\nCorpus.md et Corpus.txt regroupent les textes ci-dessous. Les fichiers individuels sont dans Conversations et Prompts.\nLes pièces jointes ne sont pas incluses. Les rôles inconnus sont signalés ; leur texte n’est pas supprimé.\n\n## Sommaire et limites\n\n\(report.joined(separator:"\n"))\n"
        let corpus=readme+"\n\n---\n\n"+included.joined(separator:"\n\n---\n\n")
        try Data(readme.utf8).write(to:folder.appendingPathComponent("LIRE-MOI.md"),options:.atomic)
        try Data(corpus.utf8).write(to:folder.appendingPathComponent("Corpus.md"),options:.atomic)
        try Data(corpus.utf8).write(to:folder.appendingPathComponent("Corpus.txt"),options:.atomic)
        try zip(folder:folder,to:destination)
    }

    static func safeFileName(_ text:String) -> String {
        let disallowed=CharacterSet(charactersIn:"<>:\"/\\|?*").union(.controlCharacters)
        let sanitized=String(text.unicodeScalars.map{disallowed.contains($0) ? "-" : Character($0)})
        let compact=sanitized.replacingOccurrences(of:#"\s+"#,with:" ",options:.regularExpression)
            .trimmingCharacters(in:CharacterSet(charactersIn:". "))
        return String((compact.isEmpty ? "Sans titre" : compact).prefix(100))
    }
    private static func oneLine(_ value:Any?) -> String {
        ArchiveCore.string(value).replacingOccurrences(of:#"[\r\n]+"#,with:" ",options:.regularExpression)
    }
    private static func zip(folder:URL,to destination:URL) throws {
        let process=Process();process.executableURL=URL(fileURLWithPath:"/usr/bin/ditto")
        process.arguments=["-c","-k","--sequesterRsrc",folder.path,destination.path]
        try process.run();process.waitUntilExit()
        guard process.terminationStatus == 0 else {throw NSError(domain:"PromptMistress",code:Int(process.terminationStatus),userInfo:[NSLocalizedDescriptionKey:"Création ZIP échouée."])}
    }

    static func corpusRecords(workspace:NativeWorkspace,keys:[String],allVariants:Bool,mode:Mode,titleOverrides:[String:String]=[:],rowLookup:[String:[String:Any]]?=nil) -> [[String:Any]] {
        var result:[[String:Any]]=[]
        let rowsByKey=rowLookup ?? Dictionary(workspace.rows.map{(ArchiveCore.string($0["key"]),$0)},uniquingKeysWith:{first,_ in first})
        for key in keys {
            guard let row=rowsByKey[key] else {continue}
            let variants=row["variants"] as? [[String:Any]] ?? []
            let preferred=max(0,variants.firstIndex(where:{$0["hasContent"] as? Bool == true}) ?? 0)
            let indices=allVariants ? Array(0..<max(variants.count,1)) : [preferred]
            for variant in indices {
                var entry:[String:Any]=["kind":row["kind"] ?? "chat","title":titleOverrides[key] ?? ArchiveCore.string(row["title"]),
                    "provider":row["provider"] ?? "","updated":row["updated"] ?? "","sourceURL":"","text":"","warning":""]
                do {
                    guard let detail=try workspace.detail(row:row,variant:variant) else {throw NSError(domain:"PromptMistress",code:2,userInfo:[NSLocalizedDescriptionKey:"Version indisponible"])}
                    entry["sourceURL"]=detail["sourceURL"] ?? ""
                    let raw=ArchiveCore.string(detail["raw"]),text=ArchiveCore.string(detail["text"])
                    let messages=detail["messages"] as? [[String:String]] ?? []
                    if raw.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || raw.trimmingCharacters(in:.whitespacesAndNewlines) == "Cette entrée ne contient que les métadonnées." {
                        entry["warning"]="Texte absent de la source locale"
                    } else if mode == .raw {entry["text"]=raw}
                    else if !messages.isEmpty {
                        let wanted=mode == .questions ? ["user"] : mode == .answers ? ["assistant"] : ["user","assistant"]
                        let chosen=messages.filter{wanted.contains($0["role"] ?? "") && !($0["content"] ?? "").trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}
                        entry["text"]=chosen.enumerated().map { index,message in
                            "### \(index+1). \(message["role"] == "user" ? "Question" : "Réponse")\n\n\(message["content"] ?? "")"
                        }.joined(separator:"\n\n")
                        if chosen.isEmpty {entry["warning"]="Aucun message correspondant au contenu choisi"}
                    } else if ArchiveCore.string(row["kind"]) == "prompt" {
                        entry["text"]=mode == .answers ? "" : text
                        if mode == .answers {entry["warning"]="Prompt individuel sans réponse"}
                    } else if mode != .all {entry["warning"]="Rôles non identifiables : export filtré indisponible"}
                    else {entry["text"]=text;entry["warning"]="Rôles non identifiables : texte conservé sans découpage question/réponse"}
                } catch {entry["warning"]="Lecture impossible : \(error.localizedDescription)"}
                result.append(entry)
            }
        }
        return result
    }
}
