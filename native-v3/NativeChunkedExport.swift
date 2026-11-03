import Foundation
import CryptoKit

/// Export par morceaux.
/// - Une fiche est produite à la fois : mémoire bornée à une fiche (le ZIP et le corpus écrivent aussi fiche par fiche).
/// - Écriture dans un fichier temporaire voisin de la destination.
/// - Vérification : empreinte SHA-256 relue depuis le disque (fichiers simples) ou
///   extraction contrôlée puis comparaison (ZIP, corpus).
/// - Remplacement final atomique. En cas d'annulation ou d'échec, la destination est intacte.
/// - Une fiche en erreur est écartée et listée dans le rapport ; les suivantes continuent.
enum NativeChunkedExport {
    struct Omission: Equatable {
        let key: String
        let title: String
        let reason: String
    }

    struct Report {
        let written: Int
        let omissions: [Omission]
        let destination: URL
    }

    enum Failure: Error, LocalizedError {
        case cancelled
        case verification(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Export annulé. Le fichier de destination n’a pas été modifié."
            case .verification(let message): return "Vérification échouée (\(message)). Le fichier de destination n’a pas été modifié."
            }
        }
    }

    /// Annulation partagée entre le thread d'interface et le thread d'export.
    final class CancelToken {
        private let lock = NSLock()
        private var value = false
        var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return value }
        func cancel() { lock.lock(); value = true; lock.unlock() }
    }

    /// Renvoie les enregistrements d'une seule fiche. Une erreur écarte cette fiche seulement.
    typealias RecordProvider = (_ key: String) throws -> [[String: Any]]

    static func run(keys: [String],
                    format: NativeExport.Format,
                    destination: URL,
                    titles: [String: String] = [:],
                    records: RecordProvider,
                    progress: ((_ done: Int, _ total: Int) -> Void)? = nil,
                    isCancelled: () -> Bool = { false }) throws -> Report {
        switch format {
        case .markdown, .text, .json:
            return try runRecords(keys: keys, format: format, destination: destination, titles: titles,
                                  records: records, progress: progress, isCancelled: isCancelled)
        case .zip:
            return try runZip(keys: keys, destination: destination, titles: titles,
                              records: records, progress: progress, isCancelled: isCancelled)
        case .corpus:
            return try runCorpus(keys: keys, destination: destination, titles: titles,
                                 records: records, progress: progress, isCancelled: isCancelled)
        }
    }

    /// Index Markdown : un bloc de texte par entrée, déjà préparé par l'appelant.
    static func runIndex(blocks: [String],
                         destination: URL,
                         progress: ((_ done: Int, _ total: Int) -> Void)? = nil,
                         isCancelled: () -> Bool = { false }) throws -> Report {
        let keys = blocks.indices.map(String.init)
        return try streamFile(keys: keys, destination: destination, titles: [:],
                              prefix: Data("# Index PromptMistress\n\n".utf8), separator: Data("\n".utf8), suffix: Data(),
                              blocks: { key in [Data((blocks[Int(key) ?? 0]).utf8)] },
                              progress: progress, isCancelled: isCancelled)
    }

    // MARK: - Fichier unique (Markdown, texte, JSON, index)

    private static func runRecords(keys: [String], format: NativeExport.Format, destination: URL, titles: [String: String],
                                   records: RecordProvider, progress: ((Int, Int) -> Void)?, isCancelled: () -> Bool) throws -> Report {
        let json = format == .json
        return try streamFile(keys: keys, destination: destination, titles: titles,
                              prefix: json ? Data("[\n".utf8) : Data(),
                              separator: json ? Data(",\n".utf8) : Data("\n\n---\n\n".utf8),
                              suffix: json ? Data("\n]\n".utf8) : Data(),
                              blocks: { key in
                                  try records(key).map { record in
                                      if json {
                                          guard JSONSerialization.isValidJSONObject(record) else { throw RecordError("Données non sérialisables") }
                                          return try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
                                      }
                                      return try NativeExport.render([record], format: format)
                                  }
                              },
                              progress: progress, isCancelled: isCancelled)
    }

    /// Cœur commun : chaque fiche produit des blocs écrits l'un après l'autre.
    private static func streamFile(keys: [String], destination: URL, titles: [String: String],
                                   prefix: Data, separator: Data, suffix: Data,
                                   blocks: (String) throws -> [Data],
                                   progress: ((Int, Int) -> Void)?, isCancelled: () -> Bool) throws -> Report {
        let partial = partialURL(for: destination)
        let sink = try FileSink(partial)
        var success = false
        defer {
            sink.close()
            if !success { try? FileManager.default.removeItem(at: partial) }
        }
        try sink.write(prefix)
        var written = 0
        var omissions: [Omission] = []
        var first = true
        for (index, key) in keys.enumerated() {
            if isCancelled() { throw Failure.cancelled }
            do {
                // Tout le lot de la fiche est préparé avant d'écrire : pas de fiche écrite à moitié.
                let batch = try blocks(key)
                if batch.isEmpty { throw RecordError("Aucun contenu exportable") }
                for block in batch {
                    if !first { try sink.write(separator) }
                    try sink.write(block)
                    first = false
                    written += 1
                }
            } catch let error as Failure {
                throw error
            } catch {
                omissions.append(Omission(key: key, title: titles[key] ?? key, reason: error.localizedDescription))
            }
            progress?(index + 1, keys.count)
        }
        try sink.write(suffix)
        sink.close()
        let expected = sink.digest
        let actual = try fileDigest(partial)
        guard actual.bytes == expected.bytes, actual.hash == expected.hash else {
            throw Failure.verification("empreinte différente après écriture")
        }
        if isCancelled() { throw Failure.cancelled }
        try replace(destination, with: partial)
        success = true
        return Report(written: written, omissions: omissions, destination: destination)
    }

    // MARK: - ZIP (une entrée Markdown par fiche + index.json)

    private static func runZip(keys: [String], destination: URL, titles: [String: String],
                               records: RecordProvider, progress: ((Int, Int) -> Void)?, isCancelled: () -> Bool) throws -> Report {
        let fm = FileManager.default
        let staging = fm.temporaryDirectory.appendingPathComponent("promptmistress-chunked-\(UUID().uuidString)")
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: staging) }
        let partial = partialURL(for: destination)
        var success = false
        defer { if !success { try? fm.removeItem(at: partial) } }

        let indexSink = try FileSink(staging.appendingPathComponent("index.json"))
        let index = JSONArrayStream(sink: indexSink)
        try index.open()
        var written = 0
        var omissions: [Omission] = []
        var names = Set<String>()
        for (keyIndex, key) in keys.enumerated() {
            if isCancelled() { throw Failure.cancelled }
            do {
                let batch = try records(key)
                if batch.isEmpty { throw RecordError("Aucun contenu exportable") }
                var entries: [(name: String, data: Data, record: [String: Any])] = []
                for record in batch {
                    guard JSONSerialization.isValidJSONObject(record) else { throw RecordError("Données non sérialisables") }
                    let name = uniqueName(entryName(record["title"], number: written + entries.count + 1), in: &names)
                    entries.append((name, try NativeExport.render([record], format: .markdown), record))
                }
                for entry in entries {
                    try entry.data.write(to: staging.appendingPathComponent(entry.name), options: .atomic)
                    try index.append(try JSONSerialization.data(withJSONObject: ["file": entry.name, "title": entry.record["title"] ?? "",
                                                                                 "key": entry.record["key"] ?? ""],
                                                                 options: [.prettyPrinted, .sortedKeys]))
                    written += 1
                }
            } catch let error as Failure {
                throw error
            } catch {
                omissions.append(Omission(key: key, title: titles[key] ?? key, reason: error.localizedDescription))
            }
            progress?(keyIndex + 1, keys.count)
        }
        try index.close()
        indexSink.close()

        try zip(staging, to: partial)
        let verify = fm.temporaryDirectory.appendingPathComponent("promptmistress-verify-\(UUID().uuidString)")
        try fm.createDirectory(at: verify, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: verify) }
        try unzip(partial, to: verify)
        let expectedFiles = written + 1
        let extracted = try regularFiles(in: verify)
        guard extracted.count == expectedFiles else {
            throw Failure.verification("\(extracted.count) fichiers au lieu de \(expectedFiles)")
        }
        let stagedIndex = try fileDigest(staging.appendingPathComponent("index.json"))
        let extractedIndex = try fileDigest(verify.appendingPathComponent("index.json"))
        guard stagedIndex.hash == extractedIndex.hash else { throw Failure.verification("index.json différent") }
        if isCancelled() { throw Failure.cancelled }
        try replace(destination, with: partial)
        success = true
        return Report(written: written, omissions: omissions, destination: destination)
    }

    // MARK: - Corpus (LIRE-MOI, Corpus.md, Corpus.txt, fichiers par entrée)

    /// Même disposition que `NativeExport.write(.corpus)`, mais le corps du corpus est écrit en flux :
    /// le sommaire (qui dépend du nombre de textes) est écrit après, puis le corps est recopié en morceaux.
    private static func runCorpus(keys: [String], destination: URL, titles: [String: String],
                                  records: RecordProvider, progress: ((Int, Int) -> Void)?, isCancelled: () -> Bool) throws -> Report {
        let fm = FileManager.default
        let staging = fm.temporaryDirectory.appendingPathComponent("promptmistress-corpus-chunked-\(UUID().uuidString)")
        let work = fm.temporaryDirectory.appendingPathComponent("promptmistress-corpus-work-\(UUID().uuidString)")
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        try fm.createDirectory(at: work, withIntermediateDirectories: true)
        defer {
            try? fm.removeItem(at: staging)
            try? fm.removeItem(at: work)
        }
        let partial = partialURL(for: destination)
        var success = false
        defer { if !success { try? fm.removeItem(at: partial) } }

        let bodySink = try FileSink(work.appendingPathComponent("body.txt"))
        let reportSink = try FileSink(work.appendingPathComponent("report.txt"))
        var entries = 0, included = 0
        var reportLines = 0
        var omissions: [Omission] = []

        func appendReport(_ line: String) throws {
            if reportLines > 0 { try reportSink.write(Data("\n".utf8)) }
            try reportSink.write(Data(line.utf8))
            reportLines += 1
        }

        for (keyIndex, key) in keys.enumerated() {
            if isCancelled() { throw Failure.cancelled }
            do {
                for record in try records(key) {
                    entries += 1
                    let title = oneLine(record["title"])
                    let body = ArchiveCore.string(record["text"])
                    let warning = oneLine(record["warning"])
                    guard !body.isEmpty else {
                        try appendReport("- \(title) : \(warning.isEmpty ? "Sans contenu" : warning)")
                        continue
                    }
                    let category = ArchiveCore.string(record["kind"]) == "prompt" ? "Prompts" : "Conversations"
                    let filename = "\(category)/\(String(format: "%03d", entries))-\(NativeExport.safeFileName(title)).md"
                    let header = "# \(title)\n\nPlateforme : \(oneLine(record["provider"]))\nDate : \(oneLine(record["updated"]))\nSource : \(oneLine(record["sourceURL"]).isEmpty ? "Non disponible" : oneLine(record["sourceURL"]))\n"
                    let content = header + (warning.isEmpty ? "" : "\nLimite : \(warning)\n") + "\n" + body
                    let file = staging.appendingPathComponent(filename)
                    try fm.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try Data(content.utf8).write(to: file, options: .atomic)
                    if included > 0 { try bodySink.write(Data("\n\n---\n\n".utf8)) }
                    try bodySink.write(Data(content.utf8))
                    included += 1
                    let link = filename.split(separator: "/").map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }.joined(separator: "/")
                    try appendReport("- [\(title.replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: ""))](\(link))" + (warning.isEmpty ? "" : " — \(warning)"))
                }
            } catch let error as Failure {
                throw error
            } catch {
                omissions.append(Omission(key: key, title: titles[key] ?? key, reason: error.localizedDescription))
            }
            progress?(keyIndex + 1, keys.count)
        }
        bodySink.close()
        reportSink.close()

        let report = try String(contentsOf: work.appendingPathComponent("report.txt"), encoding: .utf8)
        let readme = "# Corpus PromptMistress\n\n\(included) éléments avec texte sur \(entries) entrées demandées.\n\nCorpus.md et Corpus.txt regroupent les textes ci-dessous. Les fichiers individuels sont dans Conversations et Prompts.\nLes pièces jointes ne sont pas incluses. Les rôles inconnus sont signalés ; leur texte n’est pas supprimé.\n\n## Sommaire et limites\n\n\(report)\n"
        try Data(readme.utf8).write(to: staging.appendingPathComponent("LIRE-MOI.md"), options: .atomic)
        let separator = Data("\n\n---\n\n".utf8)
        for name in ["Corpus.md", "Corpus.txt"] {
            let sink = try FileSink(staging.appendingPathComponent(name))
            try sink.write(Data(readme.utf8))
            try sink.write(separator)
            try copyChunks(from: work.appendingPathComponent("body.txt"), to: sink)
            sink.close()
        }

        try zip(staging, to: partial)
        let verify = fm.temporaryDirectory.appendingPathComponent("promptmistress-verify-\(UUID().uuidString)")
        try fm.createDirectory(at: verify, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: verify) }
        try unzip(partial, to: verify)
        let expectedFiles = included + 3
        let extracted = try regularFiles(in: verify)
        guard extracted.count == expectedFiles else {
            throw Failure.verification("\(extracted.count) fichiers au lieu de \(expectedFiles)")
        }
        for name in ["Corpus.md", "Corpus.txt"] {
            let staged = try fileDigest(staging.appendingPathComponent(name))
            let unpacked = try fileDigest(verify.appendingPathComponent(name))
            guard staged.hash == unpacked.hash else { throw Failure.verification("\(name) différent") }
        }
        if isCancelled() { throw Failure.cancelled }
        try replace(destination, with: partial)
        success = true
        return Report(written: included, omissions: omissions, destination: destination)
    }

    private static func copyChunks(from source: URL, to sink: FileSink) throws {
        let handle = try FileHandle(forReadingFrom: source)
        defer { try? handle.close() }
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            try sink.write(chunk)
        }
    }

    // MARK: - Outils

    private struct RecordError: LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }

    private static func oneLine(_ value: Any?) -> String {
        ArchiveCore.string(value).replacingOccurrences(of: #"[\r\n]+"#, with: " ", options: .regularExpression)
    }

    private static func partialURL(for destination: URL) -> URL {
        destination.deletingLastPathComponent()
            .appendingPathComponent(".\(destination.lastPathComponent).partial-\(UUID().uuidString)")
    }

    private static func replace(_ destination: URL, with partial: URL) throws {
        let fm = FileManager.default
        if fm.fileExists(atPath: destination.path) {
            _ = try fm.replaceItemAt(destination, withItemAt: partial)
        } else {
            try fm.moveItem(at: partial, to: destination)
        }
    }

    static func entryName(_ title: Any?, number: Int) -> String {
        let raw = ArchiveCore.string(title)
        let disallowed = CharacterSet(charactersIn: "<>:\"/\\|?*").union(.controlCharacters)
        let sanitized = String(raw.unicodeScalars.map { disallowed.contains($0) ? "-" : Character($0) })
        let compact = sanitized.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        let safe = String((compact.isEmpty ? "Sans titre" : compact).prefix(80))
        return String(format: "%04d-", number) + safe + ".md"
    }

    private static func uniqueName(_ name: String, in names: inout Set<String>) -> String {
        var candidate = name
        var suffix = 2
        while names.contains(candidate.lowercased()) {
            let base = String(name.dropLast(3))
            candidate = "\(base)-\(suffix).md"
            suffix += 1
        }
        names.insert(candidate.lowercased())
        return candidate
    }

    private static func zip(_ folder: URL, to destination: URL) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        process.arguments = ["-c", "-k", "--sequesterRsrc", folder.path, destination.path]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw Failure.verification("création du ZIP, code \(process.terminationStatus)") }
    }

    private static func unzip(_ archive: URL, to folder: URL) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        process.arguments = ["-x", "-k", archive.path, folder.path]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw Failure.verification("extraction du ZIP, code \(process.terminationStatus)") }
    }

    private static func regularFiles(in folder: URL) throws -> [URL] {
        let enumerator = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
        return (enumerator?.compactMap { $0 as? URL } ?? []).filter {
            (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
        }
    }

    struct Digest { let hash: SHA256.Digest; let bytes: Int }

    /// Empreinte relue par blocs : mémoire bornée quelle que soit la taille du fichier.
    static func fileDigest(_ url: URL) throws -> Digest {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var bytes = 0
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
            bytes += chunk.count
        }
        return Digest(hash: hasher.finalize(), bytes: bytes)
    }

    /// Écrit des octets dans un fichier et calcule leur empreinte au passage.
    final class FileSink {
        private let handle: FileHandle
        private var hasher = SHA256()
        private(set) var bytes = 0
        private var closed = false

        init(_ url: URL) throws {
            _ = FileManager.default.createFile(atPath: url.path, contents: nil)
            handle = try FileHandle(forWritingTo: url)
        }

        func write(_ data: Data) throws {
            do {try handle.write(contentsOf: data)}
            catch {throw Failure.verification("écriture interrompue : \(error.localizedDescription)")}
            hasher.update(data: data)
            bytes += data.count
        }

        var digest: Digest { Digest(hash: hasher.finalize(), bytes: bytes) }

        func close() {
            guard !closed else { return }
            closed = true
            try? handle.synchronize()
            try? handle.close()
        }
    }

    /// Tableau JSON écrit élément par élément.
    final class JSONArrayStream {
        private let sink: FileSink
        private var count = 0
        init(sink: FileSink) { self.sink = sink }

        func open() throws { try sink.write(Data("[\n".utf8)) }

        func append(_ element: Data) throws {
            if count > 0 { try sink.write(Data(",\n".utf8)) }
            try sink.write(element)
            count += 1
        }

        func close() throws { try sink.write(Data("\n]\n".utf8)) }
    }
}
