/*
v0.2 2026-09-14 STABLE-INTERNE
DEMANDE: Lanceur Cocoa/WKWebView pour PromptMistress V2 avec Node et Python embarques.
SORTIE: Lit Runtime.plist, lance Node avec server.mjs, passe PROMPTMISTRESS_DATA et PROMPTMISTRESS_PYTHON.
PREUVE: Build et lancement de l'app reussis.
Fichier precedent: /Users/JOB/#DEV/01-projets/_applications/PromptMistress/native/PromptMistress.swift
*/
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var input: Pipe?
    var output: Pipe?
    var buffer = ""
    var restartCount = 0
    var maxRestarts = 3
    var restartDelay = 2.0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu(); let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appMenu.addItem(withTitle: "À propos de PromptMistress", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""); appMenu.addItem(NSMenuItem.separator()); appMenu.addItem(withTitle: "Préférences…", action: #selector(preferencesClicked), keyEquivalent: ","); appMenu.addItem(NSMenuItem.separator()); appMenu.addItem(withTitle: "Quitter PromptMistress", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); appItem.submenu = appMenu
        let fileItem = NSMenuItem(); menu.addItem(fileItem); let file = NSMenu(title: "Fichier"); file.addItem(withTitle: "Importer…", action: #selector(importerClicked), keyEquivalent: "i"); file.addItem(withTitle: "Actualiser", action: #selector(actualiserClicked), keyEquivalent: "r"); file.addItem(NSMenuItem.separator()); file.addItem(withTitle: "Fermer la fenêtre", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"); fileItem.submenu = file
        let editItem = NSMenuItem(); menu.addItem(editItem); let edit = NSMenu(title: "Édition"); editItem.submenu = edit
        for (title, action, key) in [("Annuler", "undo:", "z"), ("Couper", "cut:", "x"), ("Copier", "copy:", "c"), ("Coller", "paste:", "v"), ("Tout sélectionner", "selectAll:", "a")] { edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
        let viewItem = NSMenuItem(); menu.addItem(viewItem); let view = NSMenu(title: "Présentation"); let fullscreenItem = view.addItem(withTitle: "Activer le plein écran", action: #selector(toggleFullScreen), keyEquivalent: "f"); fullscreenItem.keyEquivalentModifierMask = [.command, .control]; viewItem.submenu = view
        let windowItem = NSMenuItem(); menu.addItem(windowItem); let windowMenu = NSMenu(title: "Fenêtre"); windowMenu.addItem(withTitle: "Réduire", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m"); windowItem.submenu = windowMenu
        let helpItem = NSMenuItem(); menu.addItem(helpItem); let help = NSMenu(title: "Aide"); help.addItem(withTitle: "Aide PromptMistress", action: nil, keyEquivalent: ""); helpItem.submenu = help
        NSApp.mainMenu = menu
        let config = WKWebViewConfiguration(); config.preferences.javaScriptCanOpenWindowsAutomatically = true
        web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "PromptMistress"; window.contentMinSize = NSSize(width: 1000, height: 600); window.isRestorable = true; window.setFrameAutosaveName("PromptMistress-main"); window.contentView = web; window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString("<body style='font:18px -apple-system;padding:60px;background:#f7f6f3'><h1>PromptMistress</h1><p>Démarrage des modules locaux…</p></body>", baseURL: nil)
        let process = Process(); server = process
        let resources = Bundle.main.resourceURL!
        let paths = serverPaths()
        process.executableURL = URL(fileURLWithPath: paths.node)
        process.currentDirectoryURL = resources.appendingPathComponent("app")
        process.arguments = ["scripts/server.mjs"]
        var env = ProcessInfo.processInfo.environment
        env["PROMPTMISTRESS_DATA"] = paths.data
        if let python = paths.python { env["PROMPTMISTRESS_PYTHON"] = python }
        process.environment = env
        input = Pipe(); process.standardInput = input!
        output = Pipe(); process.standardOutput = output!
        let logURL = URL(fileURLWithPath: paths.log)
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        process.standardError = try? FileHandle(forWritingTo: logURL)
        output!.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self = self else { return }; self.buffer += text
                if let line = self.buffer.split(separator: "\n").first(where: {$0.hasPrefix("READY ")}), let url = URL(string: String(line.dropFirst(6))) { self.output?.fileHandleForReading.readabilityHandler = nil; self.web.load(URLRequest(url: url)) }
            }
        }
        process.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.handleServerCrash() } }
        startServer(process)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { output?.fileHandleForReading.readabilityHandler = nil; try? input?.fileHandleForWriting.close(); if server?.isRunning == true { server?.terminate() } }

    func startServer(_ process: Process) {
        do { try process.run() } catch { web.loadHTMLString("<h1>Démarrage impossible</h1><p>Le moteur Node configuré sur ce Mac est indisponible.</p>", baseURL: nil) }
    }

    func handleServerCrash() {
        if restartCount < maxRestarts {
            restartCount += 1
            web.loadHTMLString("<h1>Redémarrage du service…</h1><p>Tentative \(restartCount)/\(maxRestarts)</p>", baseURL: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + restartDelay) {
                self.restartServer()
            }
        } else {
            web.loadHTMLString("<h1>Service local arrêté</h1><p>Impossible de redémarrer après \(maxRestarts) tentatives.\nFermez puis relancez PromptMistress.\nLe journal se trouve à côté de l'application.</p>", baseURL: nil)
        }
    }

    func serverPaths() -> (node: String, python: String?, data: String, log: String) {
        let resources = Bundle.main.resourceURL!
        let base = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2")
        let archives = base.appendingPathComponent("archives")
        let logs = base.appendingPathComponent("logs")
        try? FileManager.default.createDirectory(at: archives, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
        let pythonURL = resources.appendingPathComponent("Python3/bin/python3")
        let python = FileManager.default.fileExists(atPath: pythonURL.path) ? pythonURL.path : nil
        return (resources.appendingPathComponent("bin/node").path,
                python,
                archives.path,
                logs.appendingPathComponent("PromptMistress.log").path)
    }

    func restartServer() {
        let process = Process()
        server = process
        let resources = Bundle.main.resourceURL!
        let paths = serverPaths()
        process.executableURL = URL(fileURLWithPath: paths.node)
        process.currentDirectoryURL = resources.appendingPathComponent("app")
        process.arguments = ["scripts/server.mjs"]
        var env = ProcessInfo.processInfo.environment
        env["PROMPTMISTRESS_DATA"] = paths.data
        if let python = paths.python { env["PROMPTMISTRESS_PYTHON"] = python }
        process.environment = env
        input = Pipe()
        process.standardInput = input!
        output = Pipe()
        process.standardOutput = output!
        let logURL = URL(fileURLWithPath: paths.log)
        process.standardError = try? FileHandle(forWritingTo: logURL)
        output!.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.buffer += text
                if let line = self.buffer.split(separator: "\n").first(where: {$0.hasPrefix("READY ")}), let url = URL(string: String(line.dropFirst(6))) {
                    self.restartCount = 0
                    self.output?.fileHandleForReading.readabilityHandler = nil
                    self.web.load(URLRequest(url: url))
                }
            }
        }
        process.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.handleServerCrash() } }
        startServer(process)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if ["http","https"].contains(url.scheme ?? "") && url.host != "127.0.0.1" && url.host != "localhost" { NSWorkspace.shared.open(url); decisionHandler(.cancel); return }
        if !["http","https","about","blob","data","file"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { decisionHandler(response.canShowMIMEType ? .allow : .download) }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) { let panel = NSSavePanel(); panel.nameFieldStringValue = suggestedFilename; panel.begin { result in completionHandler(result == .OK ? panel.url : nil) } }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { if let url = action.request.url { NSWorkspace.shared.open(url) }; return nil }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = parameters.allowsDirectories; panel.canChooseFiles = true; panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) } }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { let a=NSAlert(); a.messageText=message; a.runModal(); completionHandler() }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { let a=NSAlert(); a.messageText=message; a.addButton(withTitle:"OK"); a.addButton(withTitle:"Annuler"); completionHandler(a.runModal() == .alertFirstButtonReturn) }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { let a=NSAlert(); a.messageText=prompt; let field=NSTextField(frame:NSRect(x:0,y:0,width:300,height:24)); field.stringValue=defaultText ?? ""; a.accessoryView=field; a.addButton(withTitle:"OK"); a.addButton(withTitle:"Annuler"); completionHandler(a.runModal() == .alertFirstButtonReturn ? field.stringValue : nil) }
    @objc func preferencesClicked() { web.evaluateJavaScript("document.getElementById('preferences-open')?.click()") { _, e in if let e=e { print("Prefs click failed: \(e)") } } }
    @objc func importerClicked() { web.evaluateJavaScript("document.getElementById('capture-link')?.click() || select('capture')") { _, e in if let e=e { print("Importer click failed: \(e)") } } }
    @objc func actualiserClicked() { web.reload() }
    @objc func toggleFullScreen() { window.toggleFullScreen(nil) }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
