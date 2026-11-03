import Foundation

struct NativeFavorite: Codable {
    var tag: String
    var color: String
}

struct NativeFavorites {
    let file: URL
    private(set) var items: [NativeFavorite]

    init(file:URL) throws {
        self.file=file
        items=FileManager.default.fileExists(atPath:file.path) ? try JSONDecoder().decode([NativeFavorite].self,from:Data(contentsOf:file)) : []
    }

    mutating func save(_ next:[NativeFavorite]) throws {
        guard next.count <= 10 else {throw NSError(domain:"PromptMistress",code:10,userInfo:[NSLocalizedDescriptionKey:"Maximum 10 tags favoris."])}
        let data=try JSONEncoder().encode(next)
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try data.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
        items=next
    }
}
