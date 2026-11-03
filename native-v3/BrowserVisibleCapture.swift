import AppKit
import ApplicationServices
import Foundation

struct BrowserVisibleSnapshot: Codable {
    let browser: String
    let url: String
    let title: String
    let text: String
    let truncated: Bool
    init(browser: String, url: String, title: String, text: String, truncated: Bool = false) {
        self.browser = browser; self.url = url; self.title = title; self.text = text; self.truncated = truncated
    }
}

enum BrowserVisibleCapture {
    private static let browsers: [String: String] = [
        "com.google.Chrome": "Chrome",
        "com.microsoft.edgemac": "Edge",
        "com.apple.Safari": "Safari",
        "com.brave.Browser": "Brave",
        "company.thebrowser.Browser": "Arc"
    ]
    private static let domains = [
        "chatgpt.com", "claude.ai", "gemini.google.com", "perplexity.ai",
        "grok.com", "copilot.microsoft.com", "chat.deepseek.com",
        "chat.mistral.ai", "poe.com", "character.ai", "meta.ai",
        "you.com", "phind.com", "duck.ai", "chat.qwen.ai",
        "kimi.com", "chat.lmsys.org", "aistudio.google.com"
    ]
    private static let conversationPath = ["/c/", "/chat/", "/chats/", "/app/", "/search/", "/thread/", "/conversation/", "/a/chat/s/"]

    static var isTrusted: Bool { AXIsProcessTrusted() }

    private static func value(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var result: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success ? result : nil
    }
    private static func string(_ value: CFTypeRef?) -> String {
        guard let value else { return "" }
        if let text = value as? String { return text }
        if let url = value as? NSURL { return url.absoluteString ?? "" }
        return String(describing: value)
    }
    private static func children(_ element: AXUIElement) -> [AXUIElement] {
        value(element, kAXChildrenAttribute as String) as? [AXUIElement] ?? []
    }
    private static func allowed(_ raw: String) -> Bool {
        guard let url = URL(string: raw) else { return false }
        #if DEBUG
        if url.isFileURL { return true }
        #endif
        guard ["http", "https"].contains(url.scheme ?? ""), let host = url.host?.lowercased() else { return false }
        guard domains.contains(where: { host == $0 || host.hasSuffix("." + $0) }) else { return false }
        return conversationPath.contains(where: { url.path.contains($0) })
    }
    private static func staticText(_ root: AXUIElement) -> (text: String, truncated: Bool) {
        var values: [String] = []
        var pending: [AXUIElement] = [root]
        var visited = 0
        var size = 0
        while let element = pending.popLast(), visited < 20_000, size < 2_000_000 {
            visited += 1
            let role = string(value(element, kAXRoleAttribute as String))
            if role == "AXStaticText" {
                let text = string(value(element, kAXValueAttribute as String)).trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty && text != values.last {
                    values.append(text)
                    size += text.utf16.count
                }
            } else if role != "AXTextField" && role != "AXTextArea" {
                pending.append(contentsOf: children(element).reversed())
            }
        }
        return (values.joined(separator: "\n"), !pending.isEmpty)
    }
    private static func webAreas(_ root: AXUIElement) -> [AXUIElement] {
        var result: [AXUIElement] = []
        var pending: [AXUIElement] = [root]
        var visited = 0
        while let element = pending.popLast(), visited < 20_000 {
            visited += 1
            if string(value(element, kAXRoleAttribute as String)) == "AXWebArea" {
                if allowed(string(value(element, "AXURL"))) {
                    result.append(element)
                    continue
                }
            }
            pending.append(contentsOf: children(element).reversed())
        }
        return result
    }
    static func snapshots() -> [BrowserVisibleSnapshot] {
        guard isTrusted else { return [] }
        var snapshots: [BrowserVisibleSnapshot] = []
        for app in NSWorkspace.shared.runningApplications {
            guard let bundleID = app.bundleIdentifier, let browser = browsers[bundleID] else { continue }
            let element = AXUIElementCreateApplication(app.processIdentifier)
            AXUIElementSetMessagingTimeout(element, 1)
            let windows = value(element, kAXWindowsAttribute as String) as? [AXUIElement] ?? []
            for window in windows.prefix(10) {
                let candidates = webAreas(window)
                for area in candidates {
                    let url = string(value(area, "AXURL"))
                    let content = staticText(area)
                    guard content.text.utf16.count >= 80 else { continue }
                    snapshots.append(BrowserVisibleSnapshot(browser: browser, url: url,
                        title: string(value(area, kAXTitleAttribute as String)), text: content.text,
                        truncated: content.truncated))
                }
            }
        }
        return snapshots
    }
}
