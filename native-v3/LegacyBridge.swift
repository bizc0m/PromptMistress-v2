import Foundation

enum LegacyBridge {
    static func run(module:String,command:String,arguments:[String],resources:URL,config:URL) throws -> String {
        let sources=try JSONDecoder().decode([ArchiveSource].self,from:Data(contentsOf:config))
        let name=module == "python" ? "Prompt Vault Python" : "Prompt Vault Node"
        guard let source=sources.first(where:{$0.name == name && $0.type == "vault"}) else {
            throw NSError(domain:"PromptMistress",code:1,userInfo:[NSLocalizedDescriptionKey:"Coffre \(name) introuvable."])
        }
        let vault=ArchiveCore.expandHome(source.path)
        let process=Process()
        let app=resources.appendingPathComponent("app")
        if module == "python" {
            let python=resources.appendingPathComponent("Python3/bin/python3")
            guard FileManager.default.isExecutableFile(atPath:python.path) else {
                throw NSError(domain:"PromptMistress",code:2,userInfo:[NSLocalizedDescriptionKey:"Python embarqué indisponible."])
            }
            process.executableURL=python
            process.arguments=["-m","prompt_vault.cli.main","--vault",vault,command] + arguments
            var environment=ProcessInfo.processInfo.environment
            environment["PYTHONPATH"]=app.appendingPathComponent("projects/project-b-python-prompt-vault/src").path
            process.environment=environment
        }else {
            process.executableURL=resources.appendingPathComponent("bin/node")
            process.arguments=[app.appendingPathComponent("projects/project-a-chatvault/pv.js").path,command,"--vault",vault] + arguments
        }
        process.currentDirectoryURL=app
        let output=Pipe(),errors=Pipe();process.standardOutput=output;process.standardError=errors
        try process.run()
        let value=String(data:output.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
        let errorText=String(data:errors.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw NSError(domain:"PromptMistress",code:Int(process.terminationStatus),userInfo:[NSLocalizedDescriptionKey:errorText.isEmpty ? "Commande historique échouée." : errorText])
        }
        return value
    }
}
