import Foundation

enum ChatDominaBridge {
    static let version = "0.2.2"

    static func renderPrompt(binary: URL, title: String, text: String, source: String,
                             sourceLink: String) throws -> String {
        try render(binary:binary,mode:"prompt",title:title,text:text,source:source,sourceLink:sourceLink,completeChat:false)
    }
    static func renderChat(binary:URL,title:String,text:String,source:String,sourceLink:String) throws -> String {
        try render(binary:binary,mode:"chat",title:title,text:text,source:source,sourceLink:sourceLink,completeChat:true)
    }
    private static func render(binary:URL,mode:String,title:String,text:String,source:String,sourceLink:String,completeChat:Bool) throws -> String {
        let request: [String: Any] = [
            "version": version, "mode": mode, "title": title, "text": text,
            "source": source, "sourceLink": sourceLink, "tags": "#PromptMistress", "completeChat":completeChat
        ]
        let input = try JSONSerialization.data(withJSONObject: request)
        guard input.count <= 8_000_000 else {
            throw NSError(domain: "CHATDomina", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Extrait trop long pour CHATDomina."])
        }
        let process = Process()
        process.executableURL = binary
        let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        var output = Data(), errors = Data()
        let readers = DispatchGroup()
        readers.enter()
        DispatchQueue.global(qos: .utility).async {
            output = stdout.fileHandleForReading.readDataToEndOfFile()
            readers.leave()
        }
        readers.enter()
        DispatchQueue.global(qos: .utility).async {
            errors = stderr.fileHandleForReading.readDataToEndOfFile()
            readers.leave()
        }
        try stdin.fileHandleForWriting.write(contentsOf: input)
        try stdin.fileHandleForWriting.close()
        process.waitUntilExit()
        readers.wait()
        guard process.terminationStatus == 0 else {
            let message = String(data: errors, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            throw NSError(domain: "CHATDomina", code: Int(process.terminationStatus),
                          userInfo: [NSLocalizedDescriptionKey: message?.isEmpty == false ? message! : "Rendu impossible."])
        }
        guard let result = try JSONSerialization.jsonObject(with: output) as? [String: Any],
              result["version"] as? String == version,
              let markdown = result["markdown"] as? String else {
            throw NSError(domain: "CHATDomina", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Version ou réponse CHATDomina incompatible."])
        }
        return markdown
    }
}
