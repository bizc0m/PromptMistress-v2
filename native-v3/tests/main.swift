import AppKit
import Foundation
let args = CommandLine.arguments
precondition(args.count == 4)
var text = "Bonjour, peux-tu résumer ce document de test ?\nOui, voici un résumé complet de cette conversation locale de vérification."
var imports = 0
var failure = ""
let importer = BrowserAutoImporter(resources: URL(fileURLWithPath: args[1]), data: URL(fileURLWithPath: args[2]),
    vault: args[3], stableDelay: 0.01, pollInterval: 0.05, requiresAccessibility: false,
    scanner: { [BrowserVisibleSnapshot(browser: "Chrome", url: "https://claude.ai/chat/fixture",
        title: "Conversation Claude de test", text: text)] }) { message, changed in
        if changed {
            imports += 1
            if imports == 1 { text += "\nUne deuxième réponse enrichit la conversation." }
        }
        if message.contains("échouée") || message.contains("impossible") { failure = message }
    }
importer.start()
let deadline = Date().addingTimeInterval(10)
while imports < 2 && failure.isEmpty && Date() < deadline {
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
}
importer.stop()
if imports < 2 { fputs(failure.isEmpty ? "Capture automatique expirée\n" : failure + "\n", stderr); exit(1) }
print("capture automatique mise à jour")
