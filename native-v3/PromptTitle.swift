import Foundation

enum PromptTitle {
    private static let rejected: [NSRegularExpression] = [
        #"^[{\[\d]"#,
        #"^```|^</?[\w!-]+(?:\s|>)"#,
        #"^["'][^"']+["']\s*:"#,
        #"^(?:import |export |async function |def |from \S+ import |return |console\.|(?:const|let|var)\s)"#,
        #"(?:=>|[{}]|;\s*$|\b(?:document|window|fs|JSON)\.)"#,
        #"(?i)^(?:tu\s+(?:vois|voios|vois? quoi|a[s]?)|avis|ok|oui|non)\s*(?:quoi|le projet|ça|ca)?\s*[?.!]*$"#,
        #"(?i)^(?:try\s|catch\s|(?:public|private|protected|static|final|override)\s|func\s|Launching skill:)"#,
        #"(?i)^(Objectif|Prompt|Contexte requis|Résultat attendu|Files mentioned by the user|In app browser|AGENTS\.md instructions)\s*:?\s*"#,
        #"(?i)^(AGENTS\.md instructions|Referenced ChatGPT conversation|Prior conversation with Codex|Automation:)"#,
        #"(?i)^</?(in-app-browser-context|recommended_plugins|codex_delegation)\b"#,
        #"(?i)^The following is the Codex agent history"#,
        #"(?i)^Files mentioned by the user:?$"#,
        #"(?i)^Here is a list of plugins that are available but not installed"#,
        #"(?i)^---[A-Z _-]+---$"#,
        #"(?i)^(?:Exit code \d+|Command running in background|COMMAND\s+PID\s)"#,
        #"^total\s+\d+$"#,
        #"(?i)^[dl-][rwx-]{9}@?\s+\d+\s+"#,
        #"(?i)^\[external unsupported block:"#,
        #"^\d+\s+"#,
        #"^\d+$"#,
        #"(?i)^(private var|final class|class |function |const |let |var )"#,
        #"(?i)<(!DOCTYPE html|html|head|body)\b"#,
        #"^===\s*.+\s*===$"#,
        #"^\.[\w-]+$"#,
        #"(?:^|[\s"'])/?[\w.-]+/[\w./# -]+"#,
        #"^[\w.-]+/$"#
    ].compactMap { try? NSRegularExpression(pattern: $0) }

    private static func matches(_ regex: NSRegularExpression, _ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(text.startIndex..<text.endIndex, in: text)) != nil
    }

    private static func replace(_ text: String, _ pattern: String, _ replacement: String = "") -> String {
        text.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
    }

    private static func capture(_ text: String, _ pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..<text.endIndex, in: text)),
              let range = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[range])
    }

    static func readable(_ markdown: String, fallback: String) -> String {
        let body = replace(markdown, #"^---\n[\s\S]*?\n---\n?"#)
        let section = capture(body, #"^# Prompt\s*\n([\s\S]*?)(?=\n# |\n$)"#) ?? body
        let lines = replace(section, #"\n+"#, "\n").components(separatedBy: "\n")
        let chosen = lines.lazy.map { line -> String in
            var value = line.trimmingCharacters(in: .whitespacesAndNewlines)
            value = replace(value, #"^[-*]\s+"#)
            value = replace(value, #"^`{3,}\w*"#)
            value = replace(value, #"^#+\s*"#)
            return value.trimmingCharacters(in: .whitespacesAndNewlines)
        }.first(where: { line in
            if line.utf16.count < 10 { return false }
            return !rejected.contains(where: { matches($0, line) })
        }) ?? fallback
        let normalized = replace(chosen, #"\s+"#, " ")
        return String(normalized.trimmingCharacters(in: CharacterSet(charactersIn: "\"'`")).prefix(120))
    }
}
