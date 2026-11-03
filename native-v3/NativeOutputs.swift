import Foundation

struct NativeOutput: Codable {
    let key: String
    let title: String
    let provider: String
    let project: String
    let variant: Int
    let turn: Int
    let prompt: String
    let output: String
    let references: [String]
}

enum NativeOutputs {
    static func scan(workspace:NativeWorkspace,keys:Set<String>?=nil,query:String="",offset:Int=0,limit:Int=200,filesOnly:Bool=false) -> (items:[NativeOutput],total:Int,warnings:Int) {
        var items:[NativeOutput]=[],total=0,warnings=0
        let needle=query.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current)
        for row in workspace.rows where ArchiveCore.string(row["kind"]) == "chat" {
            let key=ArchiveCore.string(row["key"])
            if let keys,!keys.contains(key){continue}
            let variants=row["variants"] as? [[String:Any]] ?? []
            for variant in 0..<max(variants.count,1) {
                guard let detail=try? workspace.detail(key:key,variant:variant),
                      let messages=detail["messages"] as? [[String:String]],!messages.isEmpty else {warnings += 1;continue}
                var prompt="",outputs:[String]=[],turn=0
                func appendPair() {
                    guard !outputs.isEmpty else{return}
                    let body=outputs.joined(separator:"\n\n")
                    let references=fileReferences(body)
                    if (!filesOnly || !references.isEmpty) && (needle.isEmpty || (prompt + "\n" + body + "\n" + ArchiveCore.string(row["title"]) + "\n" + references.joined(separator:"\n"))
                        .folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current).contains(needle)) {
                        total += 1
                        if total > offset && items.count < limit {
                            items.append(NativeOutput(key:key,title:ArchiveCore.string(row["title"]),provider:ArchiveCore.string(row["provider"]),
                                project:ArchiveCore.string(row["project"]),variant:variant+1,turn:turn,prompt:prompt,output:body,references:references))
                        }
                    }
                    outputs=[]
                }
                for message in messages {
                    let role=message["role"] ?? "",body=message["content"] ?? ""
                    if role == "user" {
                        if !outputs.isEmpty {appendPair();prompt=""}
                        prompt += (prompt.isEmpty ? "" : "\n\n") + body
                        turn += 1
                    }
                    else if role == "assistant",!body.isEmpty {outputs.append(body)}
                }
                appendPair()
            }
        }
        return (items,total,warnings)
    }

    static func fileReferences(_ text:String) -> [String] {
        let patterns=[#"\]\((?:<([^>]+)>|([^\s)]+))\)"#,#"`((?:/Users/|/tmp/|/private/|sandbox:)[^`\n]+)`"#]
        var values=Set<String>()
        for pattern in patterns {
            guard let regex=try? NSRegularExpression(pattern:pattern) else{continue}
            let range=NSRange(text.startIndex..<text.endIndex,in:text)
            for match in regex.matches(in:text,range:range) {
                for index in 1..<match.numberOfRanges {
                    if let found=Range(match.range(at:index),in:text) {
                        let value=String(text[found])
                        if value.hasPrefix("/") || value.hasPrefix("http") || value.hasPrefix("file:") || value.hasPrefix("sandbox:") {values.insert(value)}
                    }
                }
            }
        }
        return values.sorted()
    }
}
