import Foundation

struct NativeRule: Codable {
    var id: String
    var name: String
    var enabled: Bool
    var field: String
    var `operator`: String
    var value: String
    var action: String
    var actionValue: String
    var stop: Bool
}

struct NativeRules {
    let file: URL
    private(set) var rules: [NativeRule]

    init(file: URL) throws {
        self.file=file
        rules=FileManager.default.fileExists(atPath:file.path) ? try JSONDecoder().decode([NativeRule].self,from:Data(contentsOf:file)) : []
    }

    mutating func save(_ next:[NativeRule]) throws {
        guard next.count <= 100 else {throw NSError(domain:"PromptMistress",code:2,userInfo:[NSLocalizedDescriptionKey:"Maximum 100 règles."])}
        let data=try JSONEncoder().encode(next)
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try data.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
        rules=next
    }

    func annotation(row:[String:Any],manual:[String:Any],text:String?=nil) -> [String:Any] {
        var automatic:[String:Any]=[:]
        for rule in rules where rule.enabled {
            let input:String
            if rule.field == "text" {guard let text else{continue};input=text}
            else if rule.field == "tags" {input=(manual["tags"] as? [String] ?? []).joined(separator:" ")}
            else {input=ArchiveCore.string(row[rule.field])}
            let hay=input.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current)
            let needle=rule.value.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current)
            let hit=rule.operator == "equals" ? hay == needle : rule.operator == "notContains" ? !hay.contains(needle) : hay.contains(needle)
            guard hit else{continue}
            if ["tags","folders"].contains(rule.action) {
                let old=automatic[rule.action] as? [String] ?? []
                let incoming=rule.actionValue.split(separator:",").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}
                automatic[rule.action]=Array(Set(old+incoming)).sorted()
            } else if automatic[rule.action] == nil {automatic[rule.action]=rule.actionValue}
            if rule.stop {break}
        }
        let explicit=Set(manual["_manual"] as? [String] ?? [])
        var result=automatic
        for (key,value) in manual {result[key]=value}
        for field in ["tags","folders"] where !explicit.contains(field) {
            let original=manual[field] as? [String] ?? []
            let derived=automatic[field] as? [String] ?? []
            result[field]=Array(Set(original+derived)).sorted()
        }
        for field in ["color","status","priority"] where !explicit.contains(field) && ArchiveCore.string(manual[field]).isEmpty {
            result[field]=automatic[field] ?? ""
        }
        return result
    }
}
