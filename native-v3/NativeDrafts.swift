import Foundation

struct NativeDrafts {
    let file:URL
    private(set) var values:[String:[String:String]]
    init(file:URL) throws {
        self.file=file
        if FileManager.default.fileExists(atPath:file.path) {values=try JSONDecoder().decode([String:[String:String]].self,from:Data(contentsOf:file))}
        else {values=[:]}
    }
    mutating func update(_ key:String,_ fields:[String:String]?) throws {
        var next=values;next[key]=fields
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONEncoder().encode(next).write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
        values=next
    }
    mutating func mergeV2(_ text:String) throws -> Int {
        guard let data=text.data(using:.utf8),let source=try? JSONDecoder().decode([String:[String:String]].self,from:data) else{throw CocoaError(.fileReadCorruptFile)}
        var next=values,count=0
        for (key,value) in source where next[key] == nil {next[key]=value;count += 1}
        if count > 0 {
            try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
            try JSONEncoder().encode(next).write(to:file,options:.atomic)
            try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
            values=next
        }
        return count
    }
}
