import Foundation

enum NativeChatReader {
    static let modes = ["conversation", "prompts", "responses", "source"]

    static func render(messages: [[String: String]], kind: String, mode: String) -> String {
        var blocks: [String] = []
        var promptNumber = 0
        var responseNumber = 0
        for message in messages {
            let role = message["role"] ?? ""
            let content = (message["content"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !content.isEmpty else { continue }
            if role == "user" { promptNumber += 1 }
            if role == "assistant" { responseNumber += 1 }
            if mode == "prompts" && role != "user" { continue }
            if mode == "responses" && role != "assistant" { continue }
            let heading: String
            switch role {
            case "user":
                heading = kind == "prompt" ? "QUESTION · PROMPT ENREGISTRÉ" :
                    promptNumber == 1 ? "QUESTION 1 · PROMPT INITIAL" : "QUESTION \(promptNumber) · PROMPT DE SUIVI"
            case "assistant": heading = "RÉPONSE \(responseNumber)"
            case "system": heading = "CONTEXTE SYSTÈME"
            case "tool": heading = "OUTIL"
            default: heading = "MESSAGE"
            }
            blocks.append(heading + "\n\n" + content)
        }
        if blocks.isEmpty {
            if mode == "prompts" { return "Aucune question lisible dans cette conversation." }
            if mode == "responses" { return "Aucune réponse lisible dans cette conversation." }
            return ""
        }
        return blocks.joined(separator: "\n\n" + String(repeating: "─", count: 28) + "\n\n")
    }
}
