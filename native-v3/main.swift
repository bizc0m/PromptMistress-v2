import Foundation

func emit(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

do {
    let args = CommandLine.arguments
    guard args.count >= 3 else {
        fputs("usage: PromptMistressNative archive|detail <sources.json> [key] [variant]\n", stderr)
        exit(2)
    }
    switch args[1] {
    case "archive":
        let archive = try ArchiveCore.load(configPath: args[2])
        try emit(["rows": archive.rows, "summary": archive.summary])
    case "workspace":
        let workspace = try NativeWorkspace.load(configPath: args[2])
        try emit(["rows": workspace.rows, "summary": workspace.summary, "scan": workspace.scanDiagnostics])
    case "workspace-detail":
        guard args.count >= 4 else { exit(2) }
        let workspace = try NativeWorkspace.load(configPath: args[2])
        let variant = args.count >= 5 ? Int(args[4]) ?? 0 : 0
        try emit(try workspace.detail(key: args[3], variant: variant) ?? [:])
    case "detail":
        guard args.count >= 4 else { exit(2) }
        let archive = try ArchiveCore.load(configPath: args[2])
        let variant = args.count >= 5 ? Int(args[4]) ?? 0 : 0
        try emit(try archive.detail(key: args[3], variant: variant) ?? [:])
    default: exit(2)
    }
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
