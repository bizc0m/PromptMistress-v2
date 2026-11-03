import Foundation
import SQLite3

let root=FileManager.default.temporaryDirectory.appendingPathComponent("promptmistress-v3-features-\(UUID().uuidString)")
try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
defer {try? FileManager.default.removeItem(at:root)}
let file=root.appendingPathComponent("annotations.json")
var store=try NativeAnnotations(file:file)
try store.set("one",fields:["tags":["#test"],"folders":["Atlas/Recherche"],"project":"Atlas","note":"Bonjour"])
try store.update(["one","two"],field:"visibility",value:"archived")
let reopened=try NativeAnnotations(file:file)
precondition((reopened.get("one")["tags"] as? [String]) == ["#test"])
precondition((reopened.get("one")["folders"] as? [String]) == ["Atlas/Recherche"])
precondition(ArchiveCore.string(reopened.get("one")["project"]) == "Atlas")
precondition(ArchiveCore.string(reopened.get("two")["visibility"]) == "archived")
precondition((reopened.get("one")["_manual"] as? [String])?.contains("visibility") == true)
var drafts=try NativeDrafts(file:root.appendingPathComponent("drafts.json"))
try drafts.update("one",["note":"Brouillon local"])
let reopenedDrafts=try NativeDrafts(file:drafts.file)
precondition(reopenedDrafts.values["one"]?["note"] == "Brouillon local")
let importedDraftCount=try drafts.mergeV2("{\"one\":{\"note\":\"ancien\"},\"two\":{\"note\":\"nouveau\"}}")
precondition(importedDraftCount == 1)
precondition(drafts.values["one"]?["note"] == "Brouillon local" && drafts.values["two"]?["note"] == "nouveau")
let oldDisplay=NativeDisplaySettings.fromV2("{\"options\":{\"explorer\":false,\"versions\":true}}")!
precondition(!oldDisplay.explorer && oldDisplay.variants)
var quickDisplay=NativeDisplaySettings()
precondition(quickDisplay.showsColumn("title") && quickDisplay.showsColumn("date"))
precondition(!quickDisplay.showsColumn("size") && !quickDisplay.showsColumn("tags"))
quickDisplay.sizeMode="kilobytes";quickDisplay.rowDensity="compact";quickDisplay.minPromptBytes=512
quickDisplay.columns=["source":false,"size":true]
let reopenedDisplay=try JSONDecoder().decode(NativeDisplaySettings.self,from:JSONEncoder().encode(quickDisplay))
precondition(reopenedDisplay.sizeMode == "kilobytes" && reopenedDisplay.rowDensity == "compact")
precondition(reopenedDisplay.minPromptBytes == 512 && reopenedDisplay.columns?["source"] == false)
precondition(reopenedDisplay.showsColumn("size") && !reopenedDisplay.showsColumn("source"))
let preferenceVault=root.appendingPathComponent("preference-vault")
for folder in ["00_INBOX","02_PROMPTS","RAW"] {try FileManager.default.createDirectory(at:preferenceVault.appendingPathComponent(folder),withIntermediateDirectories:true)}
try Data("{\"items\":[]}".utf8).write(to:preferenceVault.appendingPathComponent("index.json"))
let preferenceFile=root.appendingPathComponent("preferences.json")
var importPreferences=try NativeImportPreferences.load(file:preferenceFile,defaultDestination:preferenceVault.path)
importPreferences.duplicates="version"
try importPreferences.save(file:preferenceFile)
let reopenedPreferences=try NativeImportPreferences.load(file:preferenceFile,defaultDestination:"/")
precondition(reopenedPreferences.duplicates == "version")

let dbFolder=root.appendingPathComponent("WebKit/com.bizc0m.promptmistress/WebsiteData/Default/fixture/LocalStorage")
try FileManager.default.createDirectory(at:dbFolder,withIntermediateDirectories:true)
let dbURL=dbFolder.appendingPathComponent("localstorage.sqlite3")
var db:OpaquePointer?
precondition(sqlite3_open(dbURL.path,&db) == SQLITE_OK)
precondition(sqlite3_exec(db,"CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB NOT NULL)",nil,nil,nil) == SQLITE_OK)
let source="{\"one\":{\"note\":\"Ancien\"},\"three\":{\"note\":\"Migré\"}}"
let sourceData=source.data(using:.utf16LittleEndian)!
var statement:OpaquePointer?
precondition(sqlite3_prepare_v2(db,"INSERT INTO ItemTable VALUES (?, ?)",-1,&statement,nil) == SQLITE_OK)
let transient=unsafeBitCast(-1,to:sqlite3_destructor_type.self)
_="promptmistress.workspace.annotations.v1".withCString{sqlite3_bind_text(statement,1,$0,-1,transient)}
_ = sourceData.withUnsafeBytes{sqlite3_bind_blob(statement,2,$0.baseAddress,Int32(sourceData.count),transient)}
precondition(sqlite3_step(statement) == SQLITE_DONE)
sqlite3_finalize(statement);sqlite3_close(db)
let v2=try V2StorageMigration.read(webkit:root.appendingPathComponent("WebKit"))
precondition(v2["promptmistress.workspace.annotations.v1"] == source)

var rules=try NativeRules(file:root.appendingPathComponent("rules.json"))
try rules.save([NativeRule(id:"r1",name:"Codex",enabled:true,field:"provider",operator:"equals",value:"codex",action:"tags",actionValue:"#local",stop:false)])
let classified=rules.annotation(row:["provider":"codex"],manual:["tags":["#manuel"]])
precondition(Set(classified["tags"] as? [String] ?? []) == Set(["#local","#manuel"]))
let reopenedRules=try NativeRules(file:rules.file)
precondition(reopenedRules.rules.count == 1)
var favorites=try NativeFavorites(file:root.appendingPathComponent("favorites.json"))
try favorites.save([NativeFavorite(tag:"#important",color:"#409cff")])
let reopenedFavorites=try NativeFavorites(file:favorites.file)
precondition(reopenedFavorites.items.first?.tag == "#important")

let archive=NativeArchive(rows:[],summary:[:],details:[:],exporterData:nil)
let workspace=NativeWorkspace(rows:[],summary:[:],archive:archive,promptPaths:[:],vaults:[])
let chatFile=root.appendingPathComponent("chat.md")
try Data("# Chat\n\n## Messages\n\n### 1. user\n\nCrée un fichier\n\n### 2. assistant\n\nVoici [le fichier](/tmp/test.txt)".utf8).write(to:chatFile)
let chatKey="chat-key"
let chatRecord=ArchiveRecord(provider:"codex",identity:"fixture",title:"Essai",project:"Test",updated:"2026-11-01",source:"fixture",path:chatFile.path,sourceURL:"",hasContent:true,editor:nil,inlineText:nil)
let chatRow:[String:Any]=["key":chatKey,"kind":"chat","title":"Essai","provider":"codex","project":"Test","variants":[["source":"fixture"]]]
let chatWorkspace=NativeWorkspace(rows:[chatRow],summary:[:],archive:NativeArchive(rows:[chatRow],summary:[:],details:[chatKey:[chatRecord]],exporterData:nil),promptPaths:[:],vaults:[])
let outputs=NativeOutputs.scan(workspace:chatWorkspace,query:"fichier")
precondition(outputs.total == 1 && outputs.items.first?.references == ["/tmp/test.txt"])
precondition(NativeOutputs.scan(workspace:chatWorkspace,query:"fichier",offset:1,limit:100).items.isEmpty)
precondition(NativeOutputs.scan(workspace:chatWorkspace,query:"fichier",filesOnly:true).total == 1)
let projectRoot=ProcessInfo.processInfo.environment["PROMPTMISTRESS_TEST_ROOT"]!
let nodePath=ProcessInfo.processInfo.environment["PROMPTMISTRESS_TEST_NODE"]!
let boolean=try NativeBoolean.evaluate(query:"Essai AND #local",workspace:chatWorkspace,
    annotations:[chatKey:["tags":["#local"]]],includeText:false,node:URL(fileURLWithPath:nodePath),
    script:URL(fileURLWithPath:projectRoot).appendingPathComponent("native-v3/nyx-search.mjs"))
precondition(boolean == Set([chatKey]))
let destination=root.appendingPathComponent("custom-vault")
try FileManager.default.createDirectory(at:destination,withIntermediateDirectories:true)
try Data("---\nsource_id: fixture\n---\n\n## Messages\n\n### 1. user\n\nBonjour".utf8).write(to:destination.appendingPathComponent("chat.md"))
let indexData=try JSONSerialization.data(withJSONObject:[["id":"fixture","path":"chat.md","source":"codex","title":"Coffre personnalisé","project":"Test","updated":"2026-11-01"]])
try indexData.write(to:destination.appendingPathComponent("index.json"))
let config=root.appendingPathComponent("sources.json")
try Data("[]".utf8).write(to:config)
let prefs=try JSONSerialization.data(withJSONObject:["destination":destination.path])
try prefs.write(to:root.appendingPathComponent("preferences.json"))
let custom=try NativeWorkspace.load(configPath:config.path)
precondition(custom.rows.count == 1)
let measured=custom.contentSizes[ArchiveCore.string(custom.rows[0]["key"])]
let measuredSource=try String(contentsOf:destination.appendingPathComponent("chat.md"),encoding:.utf8)
precondition(measured?.bytes == measuredSource.utf8.count)
precondition(measured?.lines == 9)
let promptFolder=destination.appendingPathComponent("02_PROMPTS")
try FileManager.default.createDirectory(at:promptFolder,withIntermediateDirectories:true)
try Data("---\nid: prompt-fixture\nproject: Test\n---\n\nÉcris un résumé".utf8).write(to:promptFolder.appendingPathComponent("prompt-fixture.md"))
var scanUpdates:[(Int,Int)]=[]
let withPrompt=try NativeWorkspace.load(configPath:config.path){_,done,total in scanUpdates.append((done,total))}
precondition(scanUpdates.first?.0 == 0 && scanUpdates.first?.1 == 4)
precondition(scanUpdates.last?.0 == 4 && scanUpdates.last?.1 == 4)
precondition(withPrompt.rows.filter{ArchiveCore.string($0["kind"]) == "prompt"}.count == 1)
let cachedPrompt=try NativeWorkspace.load(configPath:config.path)
let renamedKey=ArchiveCore.string(withPrompt.rows.first{ArchiveCore.string($0["kind"]) == "prompt"}!["key"])
try store.update([renamedKey],field:"title",value:"Mon prompt renommé")
let renamedRecords=try NativeExport.records(workspace:withPrompt,keys:[renamedKey],annotations:store,allVariants:false,mode:.all)
precondition(renamedRecords.first?["title"] as? String == "Mon prompt renommé")
precondition(cachedPrompt.scanDiagnostics["promptCacheHits"] as? Int == 1)
precondition(cachedPrompt.scanDiagnostics["chatSizeCacheHits"] as? Int == 1)
try Data([0xff,0xfe]).write(to:promptFolder.appendingPathComponent("illisible.md"))
let afterError=try NativeWorkspace.load(configPath:config.path)
precondition(afterError.rows.filter{ArchiveCore.string($0["kind"]) == "prompt"}.count == 1)
precondition((afterError.summary["errors"] as? [[String:String]])?.contains(where:{$0["source"]?.contains("illisible.md") == true}) == true)
try Data("---\nid: prompt-fixture\nproject: Test\n---\n\nTexte modifié".utf8).write(to:promptFolder.appendingPathComponent("prompt-fixture.md"))
let changedPrompt=try NativeWorkspace.load(configPath:config.path)
precondition(changedPrompt.scanDiagnostics["promptCacheHits"] as? Int == 0)
precondition(changedPrompt.contentSizes.values.contains(where:{$0.bytes == NativeWorkspace.promptBody("---\nid: prompt-fixture\nproject: Test\n---\n\nTexte modifié").utf8.count}))
// Invalidation : prompt ajouté, index d'origine modifié (métadonnées recalculées), puis prompt supprimé.
let originFile=promptFolder.appendingPathComponent("prompt-origin.md")
try Data("---\nid: prompt-origin\norigin_chat: \"fixture\"\nproject: Test\n---\n\nContenu".utf8).write(to:originFile)
let withOrigin=try NativeWorkspace.load(configPath:config.path)
precondition(withOrigin.rows.contains{ArchiveCore.string($0["identity"]) == "prompt-origin"})
try JSONSerialization.data(withJSONObject:[["id":"fixture","path":"chat.md","source":"codex","title":"Coffre personnalisé","project":"Test","updated":"2026-11-02"]]).write(to:destination.appendingPathComponent("index.json"))
let afterIndex=try NativeWorkspace.load(configPath:config.path)
precondition(ArchiveCore.string(afterIndex.rows.first{ArchiveCore.string($0["identity"]) == "prompt-origin"}?["updated"]) == "2026-11-02")
try FileManager.default.removeItem(at:originFile)
let afterDelete=try NativeWorkspace.load(configPath:config.path)
precondition(!afterDelete.rows.contains{ArchiveCore.string($0["identity"]) == "prompt-origin"})
precondition(afterDelete.scanDiagnostics["promptCacheHits"] as? Int == 1)
precondition(NativeContentSize("bonjour\nréponse").lines == 2)
let json=try NativeExport.render([["title":"Essai","text":"Contenu","sourceURL":"https://example.com"]],format:.json)
precondition(String(data:json,encoding:.utf8)!.contains("Contenu"))
let markdown=try NativeExport.render([["title":"Essai","text":"Contenu","sourceURL":"https://example.com"]],format:.markdown)
precondition(String(data:markdown,encoding:.utf8)!.contains("# Essai"))
let zip=root.appendingPathComponent("export.zip")
try NativeExport.write([["title":"Essai","text":"Contenu","sourceURL":"https://example.com"]],format:.zip,to:zip)
let zipSize=try zip.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
precondition(zipSize > 0)
let corpusRecords=NativeExport.corpusRecords(workspace:chatWorkspace,keys:[chatKey],allVariants:false,mode:.all)
precondition(corpusRecords.count == 1)
precondition(ArchiveCore.string(corpusRecords[0]["text"]).contains("### 1. Question"))
let corpusZip=root.appendingPathComponent("corpus.zip")
try NativeExport.write(corpusRecords,format:.corpus,to:corpusZip)
let corpusSize=try corpusZip.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
precondition(corpusSize > 0)
let extracted=root.appendingPathComponent("corpus-extracted")
try FileManager.default.createDirectory(at:extracted,withIntermediateDirectories:true)
let extract=Process();extract.executableURL=URL(fileURLWithPath:"/usr/bin/ditto")
extract.arguments=["-x","-k",corpusZip.path,extracted.path]
try extract.run();extract.waitUntilExit()
precondition(extract.terminationStatus == 0)
precondition(FileManager.default.fileExists(atPath:extracted.appendingPathComponent("LIRE-MOI.md").path))
precondition(FileManager.default.fileExists(atPath:extracted.appendingPathComponent("Conversations/001-Essai.md").path))
// Export par morceaux : isolation d'erreur, annulation, remplacement, JSON et ZIP vérifiés.
let chunkDir=FileManager.default.temporaryDirectory.appendingPathComponent("chunked-\(UUID().uuidString)")
try FileManager.default.createDirectory(at:chunkDir,withIntermediateDirectories:true)
func chunkRecord(_ key:String) throws -> [[String:Any]] {
    if key == "bad" { throw NSError(domain:"fixture",code:1,userInfo:[NSLocalizedDescriptionKey:"Fiche illisible"]) }
    return [["key":key,"title":"Titre \(key)","text":"Corps \(key)","sourceURL":""]]
}
let mdTarget=chunkDir.appendingPathComponent("export.md")
try Data("ANCIEN".utf8).write(to:mdTarget)
let mdReport=try NativeChunkedExport.run(keys:["a","bad","b"],format:.markdown,destination:mdTarget,titles:["bad":"Mauvaise"],records:chunkRecord)
precondition(mdReport.written == 2)
precondition(mdReport.omissions == [NativeChunkedExport.Omission(key:"bad",title:"Mauvaise",reason:"Fiche illisible")])
let mdText=try String(contentsOf:mdTarget,encoding:.utf8)
precondition(mdText.contains("# Titre a") && mdText.contains("# Titre b") && !mdText.contains("ANCIEN"))
var cancelAfterFirst=0
do {
    _=try NativeChunkedExport.run(keys:["a","b","c"],format:.text,destination:mdTarget,records:chunkRecord,progress:{_,_ in cancelAfterFirst += 1},isCancelled:{cancelAfterFirst >= 1})
    preconditionFailure("annulation attendue")
} catch NativeChunkedExport.Failure.cancelled {}
let afterCancel=try String(contentsOf:mdTarget,encoding:.utf8)
precondition(afterCancel == mdText)
for format in [NativeExport.Format.markdown, .text, .json, .zip, .corpus] {
    var cancelAtEnd=false
    do {
        _=try NativeChunkedExport.run(keys:["a"],format:format,destination:mdTarget,records:chunkRecord,progress:{_,_ in cancelAtEnd=true},isCancelled:{cancelAtEnd})
        preconditionFailure("annulation tardive attendue")
    } catch NativeChunkedExport.Failure.cancelled {}
    let preserved=try String(contentsOf:mdTarget,encoding:.utf8)
    precondition(preserved == mdText)
}
let leftovers=try FileManager.default.contentsOfDirectory(atPath:chunkDir.path).filter{$0.contains("partial")}
precondition(leftovers.isEmpty)
let bigKeys=(0..<5000).map{"k\($0)"}
let jsonTarget=chunkDir.appendingPathComponent("export.json")
let jsonReport=try NativeChunkedExport.run(keys:bigKeys,format:.json,destination:jsonTarget,records:{key in [["key":key,"title":"T","text":"x","sourceURL":""]]})
precondition(jsonReport.written == 5000 && jsonReport.omissions.isEmpty)
let parsed=try JSONSerialization.jsonObject(with:Data(contentsOf:jsonTarget)) as? [Any]
precondition(parsed?.count == 5000)
let zipTarget=chunkDir.appendingPathComponent("export-chunked.zip")
let zipReport=try NativeChunkedExport.run(keys:["a","bad","b"],format:.zip,destination:zipTarget,records:chunkRecord)
precondition(zipReport.written == 2 && zipReport.omissions.count == 1)
let zipOut=chunkDir.appendingPathComponent("zip-check")
try FileManager.default.createDirectory(at:zipOut,withIntermediateDirectories:true)
let unzipCheck=Process();unzipCheck.executableURL=URL(fileURLWithPath:"/usr/bin/ditto")
unzipCheck.arguments=["-x","-k",zipTarget.path,zipOut.path]
try unzipCheck.run();unzipCheck.waitUntilExit()
precondition(unzipCheck.terminationStatus == 0 && FileManager.default.fileExists(atPath:zipOut.appendingPathComponent("index.json").path))
precondition(FileManager.default.fileExists(atPath:zipOut.appendingPathComponent("0001-Titre a.md").path))
// Corpus par morceaux : même sortie que l'export corpus historique, puis index en flux.
func corpusFixture(_ key:String) throws -> [[String:Any]] {
    if key == "empty" { return [["kind":"chat","title":"Vide","provider":"x","updated":"2026","sourceURL":"","text":"","warning":"Texte absent"]] }
    return [["kind":key == "p" ? "prompt" : "chat","title":"Titre \(key)","provider":"codex","updated":"2026-01-01",
             "sourceURL":"https://e.test/\(key)","text":"Corps \(key)\nligne","warning":key == "b" ? "Rôles inconnus" : ""]]
}
let corpusKeys=["a","empty","b","p"]
let legacyCorpus=chunkDir.appendingPathComponent("legacy-corpus.zip")
try NativeExport.write(try corpusKeys.flatMap(corpusFixture),format:.corpus,to:legacyCorpus)
let chunkedCorpus=chunkDir.appendingPathComponent("chunked-corpus.zip")
let corpusReport=try NativeChunkedExport.run(keys:corpusKeys,format:.corpus,destination:chunkedCorpus,records:corpusFixture)
precondition(corpusReport.written == 3 && corpusReport.omissions.isEmpty)
func unpackCorpus(_ archive:URL,_ folder:String) throws -> URL {
    let out=chunkDir.appendingPathComponent(folder)
    try FileManager.default.createDirectory(at:out,withIntermediateDirectories:true)
    let unpack=Process();unpack.executableURL=URL(fileURLWithPath:"/usr/bin/ditto")
    unpack.arguments=["-x","-k",archive.path,out.path]
    try unpack.run();unpack.waitUntilExit()
    precondition(unpack.terminationStatus == 0)
    return out
}
let legacyOut=try unpackCorpus(legacyCorpus,"legacy-out"), chunkedOut=try unpackCorpus(chunkedCorpus,"chunked-out")
for name in ["Corpus.md","Corpus.txt","LIRE-MOI.md"] {
    let legacyBytes=try Data(contentsOf:legacyOut.appendingPathComponent(name))
    let chunkedBytes=try Data(contentsOf:chunkedOut.appendingPathComponent(name))
    precondition(legacyBytes == chunkedBytes, name)
}
precondition(FileManager.default.fileExists(atPath:chunkedOut.appendingPathComponent("Prompts/004-Titre p.md").path))
precondition(FileManager.default.fileExists(atPath:chunkedOut.appendingPathComponent("Prompts/003-Titre p.md").path) == false)
let indexTarget=chunkDir.appendingPathComponent("index.md")
let indexReport=try NativeChunkedExport.runIndex(blocks:["- A\n  - Projet : x","- B"],destination:indexTarget)
precondition(indexReport.written == 2)
let indexText=try String(contentsOf:indexTarget,encoding:.utf8)
precondition(indexText == "# Index PromptMistress\n\n- A\n  - Projet : x\n- B")
let cancelToken=NativeChunkedExport.CancelToken()
let failedSink=try NativeChunkedExport.FileSink(chunkDir.appendingPathComponent("closed-sink"))
failedSink.close()
do {
    try failedSink.write(Data("cannot write".utf8))
    preconditionFailure("une erreur d’écriture doit interrompre l’export")
} catch NativeChunkedExport.Failure.verification {}
cancelToken.cancel()
precondition(cancelToken.isCancelled)
_ = workspace
print("V3 : annotations, lecture V2 et exports validés.")
