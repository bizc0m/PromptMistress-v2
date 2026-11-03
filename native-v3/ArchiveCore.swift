import Foundation
import CryptoKit

struct ArchiveSource: Decodable {
    let name: String
    let type: String
    let path: String
}

struct ArchiveRecord {
    let provider: String
    let identity: String
    let title: String
    let project: String
    let updated: String
    let source: String
    let path: String
    let sourceURL: String
    let hasContent: Bool
    let editor: [String: Any]?
    let inlineText: String?
}

struct NativeArchive {
    let rows: [[String: Any]]
    let summary: [String: Any]
    let details: [String: [ArchiveRecord]]
    let exporterData: [String: Any]?

    func detail(key: String, variant: Int) throws -> [String: Any]? {
        guard let records = details[key], records.indices.contains(variant) else { return nil }
        let record = records[variant]
        let text = try record.inlineText ?? String(contentsOfFile: record.path, encoding: .utf8)
        return ["title": rows.first(where: { $0["key"] as? String == key })?["title"] ?? record.title,
                "source": record.source, "path": record.path,
                "sourceURL": record.sourceURL, "text": text]
    }
}

enum ArchiveError: Error, CustomStringConvertible {
    case invalidIndex(String)
    case unsafePath(String)
    case missingExporterData
    var description: String {
        switch self {
        case .invalidIndex(let path): return "Index invalide : \(path)"
        case .unsafePath(let path): return "Chemin hors vault : \(path)"
        case .missingExporterData: return "Données codex-data absentes"
        }
    }
}

enum ArchiveCore {
    static func expandHome(_ path: String) -> String {
        path.hasPrefix("~/") ? NSString(string: path).expandingTildeInPath : path
    }

    static func string(_ value: Any?) -> String {
        guard let value, !(value is NSNull) else { return "" }
        if let text = value as? String { return text }
        return String(describing: value)
    }

    static func yamlField(_ body: String, _ key: String) -> String {
        guard let line = body.split(separator: "\n", omittingEmptySubsequences: false)
            .first(where: { $0.hasPrefix(key + ":") }) else { return "" }
        let raw = String(line.dropFirst(key.count + 1)).trimmingCharacters(in: .whitespaces)
        if let data = raw.data(using: .utf8), let parsed = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) {
            return string(parsed)
        }
        return raw.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
    }

    static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func safeFile(root: String, relative: String) throws -> String {
        let rootPath = URL(fileURLWithPath: root).standardizedFileURL.path
        let filePath = URL(fileURLWithPath: relative, relativeTo: URL(fileURLWithPath: rootPath + "/"))
            .standardizedFileURL.path
        guard filePath.hasPrefix(rootPath + "/") else { throw ArchiveError.unsafePath(relative) }
        return filePath
    }

    static func load(configPath: String) throws -> NativeArchive {
        let data = try Data(contentsOf: URL(fileURLWithPath: configPath))
        let sources = try JSONDecoder().decode([ArchiveSource].self, from: data)
        return try load(sources:sources)
    }

    static func load(sources: [ArchiveSource]) throws -> NativeArchive {
        var records: [ArchiveRecord] = []
        var errors: [[String: String]] = []
        var sourceStats: [[String: Any]] = []
        var exporterData: [String: Any]?
        for source in sources {
            let location = expandHome(source.path)
            do {
                var count = 0
                if source.type == "vault" {
                    let indexPath = URL(fileURLWithPath: location).appendingPathComponent("index.json").path
                    let value = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: indexPath)))
                    let index = (value as? [[String: Any]]) ?? (value as? [String: Any])?["items"] as? [[String: Any]]
                    guard let index else { throw ArchiveError.invalidIndex(indexPath) }
                    for row in index {
                        let file = try safeFile(root: location, relative: string(row["path"]))
                        let body = try String(contentsOfFile: file, encoding: .utf8)
                        let identity = yamlField(body, "source_id")
                        let provider = string(row["source"])
                        let editor: [String: Any]?
                        switch source.name {
                        case "Prompt Vault Node": editor = ["module": "node", "id": row["id"] ?? ""]
                        case "Prompt Vault Python": editor = ["module": "python", "id": row["id"] ?? ""]
                        default: editor = nil
                        }
                        records.append(ArchiveRecord(
                            provider: provider,
                            identity: identity.isEmpty ? (string(row["source_url"]).isEmpty ? string(row["id"]) : string(row["source_url"])) : identity,
                            title: string(row["title"]), project: string(row["project"]), updated: string(row["updated"]),
                            source: source.name, path: file, sourceURL: string(row["source_url"]),
                            hasContent: !body.components(separatedBy: "\n---\n").dropFirst().joined().trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                            editor: editor, inlineText: nil
                        ))
                        count += 1
                    }
                } else if source.type == "exporter" {
                    let html = try String(contentsOfFile: location, encoding: .utf8)
                    let pattern = #"<script[^>]*id="codex-data"[^>]*>([\s\S]*?)</script>"#
                    let regex = try NSRegularExpression(pattern: pattern)
                    let range = NSRange(html.startIndex..<html.endIndex, in: html)
                    guard let match = regex.firstMatch(in: html, range: range), let contentRange = Range(match.range(at: 1), in: html) else {
                        throw ArchiveError.missingExporterData
                    }
                    let payload = try JSONSerialization.jsonObject(with: Data(html[contentRange].utf8)) as? [String: Any] ?? [:]
                    exporterData = payload
                    for row in payload["rows"] as? [[String: Any]] ?? [] {
                        let text = string(row["fullText"]).isEmpty ? string(row["promptPreview"]) : string(row["fullText"])
                        records.append(ArchiveRecord(
                            provider: "codex", identity: string(row["id"]), title: string(row["name"]),
                            project: string(row["project"]), updated: string(row["updatedAt"]), source: source.name,
                            path: location, sourceURL: string(row["deeplink"]), hasContent: !text.isEmpty,
                            editor: ["module": "exporter", "id": row["id"] ?? ""],
                            inlineText: text.isEmpty ? "Cette entrée ne contient que les métadonnées." : text
                        ))
                        count += 1
                    }
                }
                sourceStats.append(["name": source.name, "count": count, "path": location])
            } catch {
                errors.append(["source": source.name, "message": String(describing: error)])
            }
        }
        var order: [String] = []
        var groups: [String: [ArchiveRecord]] = [:]
        for record in records {
            let key = digest(record.provider + ":" + record.identity)
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(record)
        }
        order.sort { left, right in
            let l = groups[left]?.map(\.updated).max() ?? ""
            let r = groups[right]?.map(\.updated).max() ?? ""
            return l > r
        }
        let rows: [[String: Any]] = order.compactMap { key in
            guard let group = groups[key], let first = group.first else { return nil }
            let variants: [[String: Any]] = group.map { record in
                ["editor": record.editor ?? NSNull(), "provider": record.provider, "identity": record.identity,
                 "title": record.title, "project": record.project, "updated": record.updated, "source": record.source,
                 "path": record.path, "sourceURL": record.sourceURL, "hasContent": record.hasContent]
            }
            return ["key": key, "provider": first.provider, "identity": first.identity, "title": first.title,
                    "project": first.project, "updated": group.map(\.updated).max() ?? first.updated,
                    "variants": variants, "hasContent": group.contains(where: \.hasContent), "copies": group.count]
        }
        let summary: [String: Any] = [
            "input": records.count, "unique": rows.count, "duplicates": records.count - rows.count,
            "groups": rows.filter { ($0["copies"] as? Int ?? 0) > 1 }.count,
            "withContent": rows.filter { $0["hasContent"] as? Bool == true }.count,
            "sources": sourceStats, "errors": errors
        ]
        return NativeArchive(rows: rows, summary: summary, details: groups, exporterData: exporterData)
    }
}
