import Foundation

struct NativeImportPreferences: Codable {
    var autoImport:Bool
    var destination:String
    var afterImport:String
    var duplicates:String

    static func load(file:URL,defaultDestination:String) throws -> Self {
        guard FileManager.default.fileExists(atPath:file.path) else {
            return Self(autoImport:true,destination:defaultDestination,afterImport:"stay",duplicates:"skip")
        }
        return try JSONDecoder().decode(Self.self,from:Data(contentsOf:file))
    }
    func save(file:URL) throws {
        guard ["skip","version"].contains(duplicates),["stay","library"].contains(afterImport),destination.hasPrefix("/") else {throw CocoaError(.fileReadCorruptFile)}
        let root=URL(fileURLWithPath:destination).resolvingSymlinksInPath()
        let index=root.appendingPathComponent("index.json")
        guard FileManager.default.fileExists(atPath:index.path) else {
            throw NSError(domain:"PromptMistress",code:1,userInfo:[NSLocalizedDescriptionKey:"Choisissez un coffre Prompt Vault avec index.json."])
        }
        let parsed=try JSONSerialization.jsonObject(with:Data(contentsOf:index))
        guard parsed is [Any] || (parsed as? [String:Any])?["items"] is [Any] else {
            throw NSError(domain:"PromptMistress",code:1,userInfo:[NSLocalizedDescriptionKey:"Index Prompt Vault invalide."])
        }
        for folder in ["00_INBOX","02_PROMPTS","RAW"] {
            var isDirectory:ObjCBool=false
            guard FileManager.default.fileExists(atPath:root.appendingPathComponent(folder).path,isDirectory:&isDirectory),isDirectory.boolValue else {
                throw NSError(domain:"PromptMistress",code:2,userInfo:[NSLocalizedDescriptionKey:"Coffre incomplet : \(folder) manque."])
            }
        }
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONEncoder().encode(self).write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
    }
}
