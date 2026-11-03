import AppKit
import ApplicationServices
import CryptoKit
import Foundation

final class BrowserAutoImporter {
    private struct Observation { let hash: String; let changedAt: Date }
    private let resources: URL
    private let data: URL
    private let vault: String
    private let onUpdate: (String, Bool) -> Void
    private let scanner: () -> [BrowserVisibleSnapshot]
    private let requiresAccessibility: Bool
    private let stableDelay: TimeInterval
    private let pollInterval: TimeInterval
    private var timer: Timer?
    private var scanning = false
    private var process: Process?
    private var observations: [String: Observation] = [:]
    private var imported: [String: String] = [:]
    private var retryAfter: [String: Date] = [:]
    private var isActive = false

    init(resources: URL, data: URL, vault: String, stableDelay: TimeInterval = 20,
         pollInterval: TimeInterval = 10,
         requiresAccessibility: Bool = true,
         scanner: @escaping () -> [BrowserVisibleSnapshot] = BrowserVisibleCapture.snapshots,
         onUpdate: @escaping (String, Bool) -> Void) {
        self.resources = resources
        self.data = data
        self.vault = vault
        self.onUpdate = onUpdate
        self.scanner = scanner
        self.requiresAccessibility = requiresAccessibility
        self.stableDelay = stableDelay
        self.pollInterval = pollInterval
        let history = data.appendingPathComponent("browser-capture-history-v3.json")
        if let bytes = try? Data(contentsOf: history),
           let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: String] { imported = value }
    }
    var active: Bool { isActive }
    func start() {
        guard !isActive else { return }
        isActive = true
        timer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in self?.scan() }
        scan()
    }
    func stop() {
        isActive = false
        timer?.invalidate()
        timer = nil
    }
    func refreshNow() { scan() }
    private func scan() {
        guard isActive, !scanning, (!requiresAccessibility || BrowserVisibleCapture.isTrusted) else { return }
        scanning = true
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let snapshots = self?.scanner() ?? []
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.scanning = false
                self.accept(snapshots)
            }
        }
    }
    private func accept(_ snapshots: [BrowserVisibleSnapshot]) {
        guard isActive else { return }
        let now = Date()
        for snapshot in snapshots {
            guard var components = URLComponents(string: snapshot.url) else { continue }
            components.fragment = nil
            guard let url = components.url?.absoluteString else { continue }
            if snapshot.truncated {
                if (retryAfter[url] ?? .distantPast) <= now {
                    retryAfter[url] = now.addingTimeInterval(300)
                    onUpdate("Conversation trop longue pour la capture visible : exportez un fichier.", false)
                }
                continue
            }
            let hash = digest(snapshot.text)
            if observations[url]?.hash != hash {
                observations[url] = Observation(hash: hash, changedAt: now)
                continue
            }
            guard now.timeIntervalSince(observations[url]!.changedAt) >= stableDelay,
                  imported[url] != hash,
                  (retryAfter[url] ?? .distantPast) <= now,
                  process?.isRunning != true else { continue }
            importSnapshot(snapshot, canonicalURL: url, hash: hash)
            break
        }
    }
    private func importSnapshot(_ snapshot: BrowserVisibleSnapshot, canonicalURL: String, hash: String) {
        guard let parsed = URL(string: canonicalURL), let host = parsed.host else { return }
        let provider = host.lowercased().replacingOccurrences(of: "[^a-z0-9-]", with: "-", options: .regularExpression)
        let folder = data.appendingPathComponent("browser-inbox-v3")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700])
            let file = folder.appendingPathComponent(UUID().uuidString + ".json")
            let text = Array(snapshot.text)
            var messages: [[String: String]] = []
            for offset in stride(from: 0, to: text.count, by: 200_000) {
                let end = min(offset + 200_000, text.count)
                messages.append(["role": "assistant", "content": String(text[offset..<end])])
            }
            let capture: [String: Any] = [
                "source": provider, "id": canonicalURL, "url": canonicalURL,
                "title": snapshot.title.isEmpty ? host : snapshot.title,
                "updated": ISO8601DateFormatter().string(from: Date()),
                "messages": messages,
                "capture": ["method": "macos-accessibility-visible", "browser": snapshot.browser,
                            "scope": "visible-conversation", "attachments": "not-downloaded"]
            ]
            let bytes = try JSONSerialization.data(withJSONObject: capture)
            try bytes.write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            let appRoot = resources.appendingPathComponent("app")
            let worker = appRoot.appendingPathComponent("native-v3/import-file.mjs")
            let task = Process()
            task.executableURL = resources.appendingPathComponent("bin/node")
            task.arguments = [worker.path, file.path]
            task.currentDirectoryURL = appRoot
            var environment = ProcessInfo.processInfo.environment
            environment["PROMPTMISTRESS_DATA"] = data.path
            environment["PROMPTMISTRESS_VAULT"] = vault
            environment["PROMPTMISTRESS_DUPLICATES"] = "version"
            task.environment = environment
            let output = Pipe(), errors = Pipe()
            task.standardOutput = output; task.standardError = errors
            task.terminationHandler = { [weak self] finished in
                let errorText = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.process = nil
                    if finished.terminationStatus == 0 {
                        self.imported[canonicalURL] = hash
                        self.saveHistory()
                        self.onUpdate("Conversation visible capturée : \(snapshot.title)", true)
                        try? FileManager.default.removeItem(at: file)
                    } else {
                        self.retryAfter[canonicalURL] = Date().addingTimeInterval(60)
                        self.onUpdate("Capture navigateur échouée : \(errorText.prefix(180))", false)
                    }
                }
            }
            try task.run()
            process = task
            onUpdate("Capture de la page visible en cours…", false)
        } catch {
            retryAfter[canonicalURL] = Date().addingTimeInterval(60)
            onUpdate("Capture navigateur impossible : \(error)", false)
        }
    }
    private func saveHistory() {
        let file = data.appendingPathComponent("browser-capture-history-v3.json")
        guard let bytes = try? JSONSerialization.data(withJSONObject: imported) else { return }
        try? bytes.write(to: file, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    private func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
