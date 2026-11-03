import Cocoa
import UniformTypeIdentifiers
import ApplicationServices

final class ExplorerNode: NSObject {
    let id:String
    let title:String
    let children:[ExplorerNode]
    init(_ id:String,_ title:String,_ children:[ExplorerNode]=[]) {self.id=id;self.title=title;self.children=children}
}

final class FlippedInspectorView:NSView { override var isFlipped:Bool {true} }

final class LibraryTitleCell:NSTableCellView {
    let stripe=NSView()
    let primary=NSTextField(labelWithString:"")
    let secondary=NSTextField(labelWithString:"")
    var primaryTop:NSLayoutConstraint!
    var secondaryGap:NSLayoutConstraint!
    override init(frame:NSRect){
        super.init(frame:frame)
        stripe.wantsLayer=true;stripe.translatesAutoresizingMaskIntoConstraints=false;addSubview(stripe)
        primary.lineBreakMode = .byTruncatingTail;primary.font=NSFont.systemFont(ofSize:14,weight:.medium);primary.translatesAutoresizingMaskIntoConstraints=false;addSubview(primary)
        secondary.lineBreakMode = .byTruncatingTail;secondary.translatesAutoresizingMaskIntoConstraints=false;addSubview(secondary)
        primaryTop=primary.topAnchor.constraint(equalTo:topAnchor,constant:5)
        secondaryGap=secondary.topAnchor.constraint(equalTo:primary.bottomAnchor,constant:2)
        NSLayoutConstraint.activate([stripe.leadingAnchor.constraint(equalTo:leadingAnchor),stripe.topAnchor.constraint(equalTo:topAnchor,constant:4),stripe.bottomAnchor.constraint(equalTo:bottomAnchor,constant:-4),stripe.widthAnchor.constraint(equalToConstant:3),primary.leadingAnchor.constraint(equalTo:stripe.trailingAnchor,constant:9),primary.trailingAnchor.constraint(equalTo:trailingAnchor,constant:-8),primaryTop,secondary.leadingAnchor.constraint(equalTo:primary.leadingAnchor),secondary.trailingAnchor.constraint(equalTo:primary.trailingAnchor),secondaryGap])
    }
    required init?(coder:NSCoder){fatalError("init(coder:) is unavailable")}
}

final class V3App: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate, NSOutlineViewDataSource, NSOutlineViewDelegate, NSSearchFieldDelegate, NSTextViewDelegate {
    private var window: NSWindow!
    private var table: NSTableView!
    private var mainSplit:NSSplitView!
    private var importPane:NSScrollView!
    private var importStageSummary:NSTextField!
    private var importLocalSummary:NSTextField!
    private var captureToggleButton:NSButton!
    private var librarySplit:NSSplitView!
    private var explorer: NSOutlineView!
    private var explorerNodes:[ExplorerNode]=[]
    private var search: NSSearchField!
    private var navigation:NSSegmentedControl!
    private var displayMenu:NSPopUpButton!
    private var quickKind:NSPopUpButton!
    private var quickProvider:NSPopUpButton!
    private var filterSummary:NSTextField!
    private var clearFilterButton:NSButton!
    private var checkSummary:NSTextField!
    private var bulkExportButton:NSButton!
    private var libraryToolbar:[NSView]=[]
    private var topHeightConstraint:NSLayoutConstraint!
    private var fullTextToggle: NSButton!
    private var detail: NSTextView!
    private var detailScroll:NSScrollView!
    private var inspectorTabs:NSSegmentedControl!
    private var readerMenu:NSPopUpButton!
    private var inspectorHeading:NSTextField!
    private var ficheScroll:NSScrollView!
    private var ficheTitle:NSTextField!
    private var renamePromptButton:NSButton!
    private var ficheMeta:NSTextField!
    private var ficheFields:[String:NSTextField]=[:]
    private var status: NSTextField!
    private var scanProgress:NSProgressIndicator!
    private var variants: NSPopUpButton!
    private var workspace: NativeWorkspace?
    private var visible: [[String: Any]] = []
    private var checkedKeys:Set<String>=[]
    private var generation = 0
    private var selectedKey: String?
    private var selectedExcerpt: String?
    private var selectedExcerptKey: String?
    private var importProcess: Process?
    private var fileImportProcess: Process?
    private var localRefreshTimer: Timer?
    private var cometImportTimer: Timer?
    private var cometImportProcess: Process?
    private var manualRefreshPending=false
    private var initialDividerPlaced=false
    private var browserImporter: BrowserAutoImporter?
    private var browserMenuItem: NSMenuItem?
    private var outputWindow: NSWindow?
    private var outputBrowser:NativeOutputBrowser?
    private var codexExporter:NativeCodexExporter?
    private var fusionLab:NativeFusionLab?
    private var readerMode:String {
        let mode=displaySettings.chatViewMode ?? "conversation"
        return NativeChatReader.modes.contains(mode) ? mode : "conversation"
    }
    private var cleanReading:Bool {readerMode != "source"}
    private var annotations: NativeAnnotations?
    private var drafts:NativeDrafts?
    private var displaySettings=NativeDisplaySettings.load()
    private var ruleStore: NativeRules?
    private var viewStore: NativeViews?
    private var favoriteStore: NativeFavorites?
    private var ruleResults: [String:[String:Any]] = [:]
    private var activeExport: NativeChunkedExport.CancelToken?
    private var ruleGeneration = 0
    private var textHits: Set<String> = []
    private var textSearchSignature = ""
    private var textSearchGeneration = 0
    private var pendingTextSearch: DispatchWorkItem?
    private var kindFilter = "Conversations"
    private var visibilityFilter = "Actifs"
    private var providerFilter = "Toutes"
    private var sourceFilter = "Toutes"
    private var projectFilter = "Tous"
    private var sortOrder = "Récent"
    private var searchText = true
    private var contentOnly=false
    private var duplicatesOnly=false
    private var booleanMode = false
    private var booleanHits: Set<String> = []
    private var booleanSignature = ""
    private var booleanGeneration = 0
    private var tagFilter = ""
    private var folderFilter = ""
    private var statusFilter = ""
    private var dateFrom = ""
    private var dateTo = ""
    private let libraryColumns:[(id:String,title:String,width:CGFloat)] = [
        ("date","Date",115),("provider","LLM",100),("title","Titre",390),
        ("project","Projet",125),("status","Statut",95),("source","Source",95),
        ("size","Taille",80),("lines","Lignes",75),("tags","Tags",170),
        ("folders","Dossiers",170),("priority","Priorité",85),("versions","Versions",85),
        ("kind","Type",75),("note","Note",220),("identity","Identifiant",150),
        ("url","Lien source",190)
    ]
    private func rebuildExplorer(){
        guard let workspace,explorer != nil else{return}
        let rows=workspace.rows
        func section(_ title:String,_ prefix:String,_ counts:[String:Int])->ExplorerNode {
            ExplorerNode(prefix,title,counts.keys.sorted().map{ExplorerNode(prefix+":"+$0,"\($0)  ·  \(counts[$0] ?? 0)")})
        }
        func counts(_ values:([String:Any])->[String])->[String:Int] {
            var result:[String:Int]=[:]
            for row in rows {for value in Set(values(row)) where !value.isEmpty {result[value,default:0]+=1}}
            return result
        }
        let providers=section("Plateformes","provider",counts{[ArchiveCore.string($0["provider"])]})
        let sources=section("Coffres et sources","source",counts{($0["variants"] as? [[String:Any]] ?? []).map{ArchiveCore.string($0["source"])}})
        let projects=section("Projets","project",counts{[effectiveProject($0)]})
        let tags=section("Tags","tag",counts{(annotation(for:$0)["tags"] as? [String]) ?? []})
        let folderCounts=counts{(annotation(for:$0)["folders"] as? [String]) ?? []}
        final class FolderBranch {var children:[String:FolderBranch]=[:];var count=0;var path=""}
        let root=FolderBranch()
        for (folder,count) in folderCounts {
            var branch=root,path=""
            for part in folder.split(separator:"/").map(String.init) where !part.isEmpty {
                path=path.isEmpty ? part : path+"/"+part
                let child=branch.children[part] ?? FolderBranch();child.path=path;child.count += count;branch.children[part]=child;branch=child
            }
        }
        func folderNodes(_ branch:FolderBranch)->[ExplorerNode] {
            branch.children.keys.sorted().map { name in
                let child=branch.children[name]!
                return ExplorerNode("folder:"+child.path,"\(name)  ·  \(child.count)",folderNodes(child))
            }
        }
        explorerNodes=[ExplorerNode("all","Toute la bibliothèque  ·  \(rows.count)"),providers,sources,projects,ExplorerNode("folders","Dossiers",folderNodes(root)),tags]
        explorer.reloadData()
        for item in explorerNodes where ["provider","project","folders","tag"].contains(item.id) {explorer.expandItem(item)}
    }
    private func annotationText(_ value:Any?) -> String {
        if let values=value as? [String] {return values.joined(separator:", ")}
        return ArchiveCore.string(value)
    }
    private func rgb(_ value:Int)->NSColor {
        NSColor(srgbRed:CGFloat((value >> 16) & 255)/255,green:CGFloat((value >> 8) & 255)/255,blue:CGFloat(value & 255)/255,alpha:1)
    }
    private func providerColor(_ name:String)->NSColor {
        switch name.lowercased() {
        case "chatgpt":return rgb(0x72df99)
        case "claude":return rgb(0xedba90)
        case "gemini":return rgb(0xcc9aff)
        case "codex","perplexity":return rgb(0x80bfff)
        default:return rgb(0x75cfe5)
        }
    }
    private func projectColor(_ name:String)->NSColor {
        var hash:UInt32=2166136261
        for unit in name.utf16 {hash=(hash ^ UInt32(unit)) &* 16777619}
        let dark=NSApp.effectiveAppearance.bestMatch(from:[.darkAqua,.aqua]) == .darkAqua
        return NSColor(calibratedHue:CGFloat(hash % 360)/360,saturation:dark ? 0.48 : 0.72,brightness:dark ? 0.94 : 0.58,alpha:1)
    }
    private func tagColor(_ tag:String)->NSColor {
        if let hex=favoriteStore?.items.first(where:{$0.tag == tag})?.color.trimmingCharacters(in:CharacterSet(charactersIn:"#")),
           hex.count == 6,let value=Int(hex,radix:16) {return rgb(value)}
        return rgb(0x70d5e8)
    }
    private func statusColor(_ value:String)->NSColor {
        switch value.lowercased() {
        case "fini":return rgb(0x5fd08b)
        case "classe":return rgb(0x5fa7ff)
        case "urgent":return rgb(0xff5f6d)
        case "en-retard":return rgb(0xf2bd58)
        case "archived","archivé":return rgb(0x8b8f99)
        case "hidden","masqué":return rgb(0x666b78)
        default:return .secondaryLabelColor
        }
    }
    private func annotationColor(_ value:String)->NSColor? {
        switch value.lowercased() {
        case "blue":return rgb(0x83b8ff)
        case "green":return rgb(0x92d8ad)
        case "yellow":return rgb(0xeed47b)
        case "pink":return rgb(0xec9bbb)
        default:return nil
        }
    }
    private func projectBadgeColor(_ project:String,annotation:[String:Any])->NSColor {
        switch displaySettings.projectColorMode ?? "auto" {
        case "neutral":return rgb(0xeeb558)
        case "manual":return annotationColor(ArchiveCore.string(annotation["color"])) ?? rgb(0xeeb558)
        default:return projectColor(project)
        }
    }
    private func rowSubtitle(_ row:[String:Any],annotation:[String:Any])->NSAttributedString {
        let result=NSMutableAttributedString(string:"")
        let font=NSFont.systemFont(ofSize:displaySettings.rowDensity == "compact" ? 10 : 11,weight:.medium)
        func add(_ value:String,color:NSColor,badge:Bool=false) {
            guard !value.isEmpty else{return}
            if result.length>0 {result.append(NSAttributedString(string:"  ·  ",attributes:[.font:font,.foregroundColor:NSColor.tertiaryLabelColor]))}
            var attributes:[NSAttributedString.Key:Any]=[.font:font,.foregroundColor:color]
            if badge {attributes[.backgroundColor]=color.withAlphaComponent(0.15)}
            result.append(NSAttributedString(string:value,attributes:attributes))
        }
        add(ArchiveCore.string(row["kind"]) == "prompt" ? "Prompt" : "Chat",color:.secondaryLabelColor)
        if let size=workspace?.contentSizes[ArchiveCore.string(row["key"])],displaySettings.sizeMode != "hidden" {
            let amount=Double(size.bytes)/1024
            let kilo=String(format:"%.1f",amount).replacingOccurrences(of:".",with:",")
            let unit=displaySettings.sizeMode ?? "both"
            let value=unit == "lines" ? "\(size.lines) lignes" : unit == "kilobytes" ? "\(kilo) Ko" : "\(size.lines) lignes · \(kilo) Ko"
            add(value,color:.secondaryLabelColor)
        }
        let provider=ArchiveCore.string(row["provider"])
        add(provider,color:providerColor(provider),badge:true)
        let project=effectiveProject(row,annotation:annotation)
        add(project,color:projectBadgeColor(project,annotation:annotation),badge:true)
        if displaySettings.tags {
            for tag in (annotation["tags"] as? [String] ?? []).prefix(3) {add(tag,color:tagColor(tag),badge:true)}
        }
        if displaySettings.variants {
            let count=(row["variants"] as? [[String:Any]])?.count ?? 1
            if count>1 {add("\(count) versions",color:.secondaryLabelColor)}
        }
        let visibility=ArchiveCore.string(annotation["visibility"])
        let state=visibility == "archived" ? "Archivé" : visibility == "hidden" ? "Masqué" : ArchiveCore.string(annotation["status"])
        add(state,color:statusColor(state),badge:!state.isEmpty)
        return result
    }
    private func annotation(for row:[String:Any]) -> [String:Any] {
        let key=ArchiveCore.string(row["key"])
        return ruleResults[key] ?? annotations?.get(key) ?? [:]
    }
    private func effectiveProject(_ row:[String:Any],annotation values:[String:Any]?=nil)->String {
        let override=ArchiveCore.string((values ?? annotation(for:row))["project"]).trimmingCharacters(in:.whitespacesAndNewlines)
        return override.isEmpty ? ArchiveCore.string(row["project"]) : override
    }
    private func effectiveTitle(_ row:[String:Any],annotation values:[String:Any]?=nil)->String {
        let override=ArchiveCore.string((values ?? annotation(for:row))["title"]).trimmingCharacters(in:.whitespacesAndNewlines)
        return override.isEmpty ? ArchiveCore.string(row["title"]) : override
    }
    private func evaluateRules(){
        ruleGeneration += 1;let current=ruleGeneration
        guard let workspace,let rules=ruleStore,let annotations, rules.rules.contains(where:{$0.enabled}) else {ruleResults=[:];booleanSignature="";filterRows();return}
        DispatchQueue.global(qos:.userInitiated).async {
            var results:[String:[String:Any]]=[:]
            let needsText=rules.rules.contains{$0.enabled && $0.field == "text"}
            for row in workspace.rows {
                let key=ArchiveCore.string(row["key"])
                let body=needsText ? (try? workspace.detail(key:key,variant:0)).map{ArchiveCore.string($0["text"])} : nil
                results[key]=rules.annotation(row:row,manual:annotations.get(key),text:body)
            }
            DispatchQueue.main.async {
                guard self.ruleGeneration == current else{return}
                self.ruleResults=results;self.booleanSignature="";self.rebuildExplorer();self.filterRows()
            }
        }
    }
    private func evaluateBoolean(_ query:String,workspace:NativeWorkspace){
        let signature="\(generation):\(query):\(searchText)"
        guard signature != booleanSignature else{return}
        booleanSignature=signature;booleanHits=[];booleanGeneration += 1
        let current=booleanGeneration,annotationSnapshot=ruleResults,manual=annotations,includeText=searchText
        let node=Bundle.main.resourceURL!.appendingPathComponent("bin/node")
        let script=Bundle.main.resourceURL!.appendingPathComponent("app/native-v3/nyx-search.mjs")
        status.stringValue="Recherche NyxBoolean en cours…"
        DispatchQueue.global(qos:.userInitiated).async {
            var values:[String:[String:Any]]=[:]
            for row in workspace.rows {
                let key=ArchiveCore.string(row["key"])
                values[key]=annotationSnapshot[key] ?? manual?.get(key) ?? [:]
            }
            let result=Result {try NativeBoolean.evaluate(query:query,workspace:workspace,annotations:values,includeText:includeText,node:node,script:script)}
            DispatchQueue.main.async {
                guard self.booleanGeneration == current else{return}
                switch result {
                case .success(let keys):self.booleanHits=keys;self.filterRows();self.status.stringValue="\(self.visible.count) résultat(s) NyxBoolean"
                case .failure(let error):self.status.stringValue="NyxBoolean : \(error.localizedDescription)"
                }
            }
        }
    }
    private func evaluateFullText(_ query:String, workspace:NativeWorkspace){
        let signature="\(generation):\(query)"
        guard signature != textSearchSignature else{return}
        pendingTextSearch?.cancel()
        textSearchSignature=signature;textHits=[];textSearchGeneration += 1
        let current=textSearchGeneration
        var work:DispatchWorkItem!
        work=DispatchWorkItem {
            var hits=Set<String>()
            for row in workspace.rows {
                if work.isCancelled {return}
                let key=ArchiveCore.string(row["key"])
                let count=(row["variants"] as? [[String:Any]])?.count ?? 1
                for variant in 0..<count {
                    if work.isCancelled {return}
                    guard let content=try? workspace.detail(key:key,variant:variant) else{continue}
                    if ArchiveCore.string(content["text"]).folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current).contains(query) {hits.insert(key);break}
                }
            }
            DispatchQueue.main.async {
                guard self.textSearchGeneration == current else{return}
                self.textHits=hits;self.filterRows()
                self.status.stringValue="\(self.visible.count) résultat(s) · texte complet analysé"
            }
        }
        pendingTextSearch=work
        DispatchQueue.global(qos:.userInitiated).asyncAfter(deadline:.now()+0.25,execute:work)
    }

    @objc private func toggleFullTextSearch(){
        searchText=fullTextToggle.state == .on
        pendingTextSearch?.cancel()
        textSearchSignature=""
        booleanSignature=""
        filterRows()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let path=Bundle.main.path(forResource:"AppIcon",ofType:"png"),let icon=NSImage(contentsOfFile:path) {
            NSApp.applicationIconImage=icon
        }
        let menu=NSMenu();let appItem=NSMenuItem();menu.addItem(appItem)
        let appMenu=NSMenu();appMenu.addItem(withTitle:"À propos de PromptMistress V3",action:#selector(showAbout),keyEquivalent:"")
        appMenu.addItem(NSMenuItem.separator());appMenu.addItem(withTitle:"Quitter",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");appItem.submenu=appMenu
        let fileItem=NSMenuItem();menu.addItem(fileItem);let fileMenu=NSMenu(title:"Fichier");fileMenu.addItem(withTitle:"Actualiser maintenant",action:#selector(refreshNow),keyEquivalent:"r");fileMenu.addItem(withTitle:"Synchroniser Codex / Claude / Gemini",action:#selector(syncLocal),keyEquivalent:"i");fileMenu.addItem(withTitle:"Fréquences d’actualisation…",action:#selector(editRefreshIntervals),keyEquivalent:"");fileMenu.addItem(withTitle:"Centre d’import…",action:#selector(openImportCenter),keyEquivalent:"");fileMenu.addItem(withTitle:"État des sources d’import…",action:#selector(showImportHealth),keyEquivalent:"");fileMenu.addItem(withTitle:"Importer un fichier…",action:#selector(importFileClicked),keyEquivalent:"o");fileMenu.addItem(withTitle:"Préférences d’import…",action:#selector(editImportPreferences),keyEquivalent:"");fileMenu.addItem(withTitle:"Copier l’extrait pour NoteMistress",action:#selector(copyForNoteMistress),keyEquivalent:"");fileMenu.addItem(withTitle:"Exporter le chat pour NoteMistress…",action:#selector(exportChatForNoteMistress),keyEquivalent:"");fileMenu.addItem(NSMenuItem.separator());browserMenuItem=fileMenu.addItem(withTitle:"Capture automatique des pages LLM visibles",action:#selector(toggleBrowserCapture),keyEquivalent:"");fileItem.submenu=fileMenu
        let organizeItem=NSMenuItem();menu.addItem(organizeItem);let organize=NSMenu(title:"Organiser")
        organize.addItem(withTitle:"Filtres et tri…",action:#selector(editFilters),keyEquivalent:"f")
        organize.addItem(withTitle:"Affichage de la bibliothèque…",action:#selector(editDisplay),keyEquivalent:"")
        organize.addItem(withTitle:"Modifier la fiche…",action:#selector(editAnnotation),keyEquivalent:"e")
        organize.addItem(withTitle:"Reprendre les annotations V2…",action:#selector(migrateV2Annotations),keyEquivalent:"")
        organize.addItem(withTitle:"Règles de classement…",action:#selector(editRules),keyEquivalent:"")
        organize.addItem(withTitle:"Modifier une règle…",action:#selector(modifyRule),keyEquivalent:"")
        organize.addItem(withTitle:"Réordonner les règles…",action:#selector(reorderRule),keyEquivalent:"")
        organize.addItem(withTitle:"Importer des règles…",action:#selector(importRules),keyEquivalent:"")
        organize.addItem(withTitle:"Exporter les règles…",action:#selector(exportRules),keyEquivalent:"")
        organize.addItem(withTitle:"Vues sauvegardées…",action:#selector(editViews),keyEquivalent:"")
        organize.addItem(withTitle:"Tags favoris…",action:#selector(editFavorites),keyEquivalent:"")
        organize.addItem(NSMenuItem.separator())
        organize.addItem(withTitle:"Masquer la sélection",action:#selector(hideSelection),keyEquivalent:"")
        organize.addItem(withTitle:"Archiver la sélection",action:#selector(archiveSelection),keyEquivalent:"")
        organize.addItem(withTitle:"Restaurer la sélection",action:#selector(restoreSelection),keyEquivalent:"")
        organize.addItem(NSMenuItem.separator())
        organize.addItem(withTitle:"Ajouter des tags à la sélection…",action:#selector(addTags),keyEquivalent:"")
        organize.addItem(withTitle:"Ajouter des dossiers à la sélection…",action:#selector(addFolders),keyEquivalent:"")
        organize.addItem(withTitle:"Définir le statut de la sélection…",action:#selector(setStatus),keyEquivalent:"")
        organize.addItem(withTitle:"Définir la priorité de la sélection…",action:#selector(setPriority),keyEquivalent:"")
        organize.addItem(withTitle:"Définir la couleur de la sélection…",action:#selector(setColor),keyEquivalent:"")
        organizeItem.submenu=organize
        let toolsItem=NSMenuItem();menu.addItem(toolsItem);let tools=NSMenu(title:"Exploiter")
        tools.addItem(withTitle:"Exporter la sélection…",action:#selector(exportSelection),keyEquivalent:"s")
        tools.addItem(withTitle:"Exporter un index…",action:#selector(exportIndex),keyEquivalent:"")
        tools.addItem(withTitle:"Chercher dans les réponses…",action:#selector(searchOutputs),keyEquivalent:"")
        tools.addItem(withTitle:"Surligner le passage sélectionné",action:#selector(highlightSelection),keyEquivalent:"")
        tools.addItem(withTitle:"Effacer les surlignages de cette version",action:#selector(clearHighlights),keyEquivalent:"")
        tools.addItem(withTitle:"Basculer la lecture épurée",action:#selector(toggleReading),keyEquivalent:"")
        tools.addItem(withTitle:"Afficher la provenance",action:#selector(showProvenance),keyEquivalent:"")
        tools.addItem(withTitle:"Copier le texte affiché",action:#selector(copyDisplayedText),keyEquivalent:"")
        tools.addItem(withTitle:"Comparer deux éléments…",action:#selector(compareSelection),keyEquivalent:"")
        tools.addItem(withTitle:"Ouvrir Fusion / Lab…",action:#selector(openFusionLab),keyEquivalent:"")
        tools.addItem(withTitle:"Ouvrir la source",action:#selector(openSource),keyEquivalent:"")
        tools.addItem(withTitle:"Voir les pièces jointes",action:#selector(showAttachments),keyEquivalent:"")
        toolsItem.submenu=tools
        let legacyItem=NSMenuItem();menu.addItem(legacyItem);let legacy=NSMenu(title:"Coffres historiques")
        legacy.addItem(withTitle:"Codex Exporter…",action:#selector(openCodexExporter),keyEquivalent:"")
        let nodeItem=NSMenuItem(title:"Prompt Vault Node",action:nil,keyEquivalent:"");let nodeMenu=NSMenu(title:"Prompt Vault Node")
        nodeMenu.addItem(withTitle:"Chercher…",action:#selector(searchNodeVault),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Lister les prompts",action:#selector(listNodePrompts),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Lister les projets",action:#selector(listNodeProjects),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Boîte de réception",action:#selector(listNodeInbox),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Diagnostic",action:#selector(doctorNodeVault),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Méthode LARO",action:#selector(showLaro),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Analyse approfondie…",action:#selector(deepScanNode),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Compléter les prompts…",action:#selector(backfillNode),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Réindexer",action:#selector(reindexNode),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Créer un projet…",action:#selector(createNodeProject),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Renommer un projet…",action:#selector(renameNodeProject),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Affecter des entrées…",action:#selector(assignNodeProject),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Archiver des entrées…",action:#selector(archiveNodeEntries),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Supprimer des entrées…",action:#selector(deleteNodeEntries),keyEquivalent:"")
        nodeMenu.addItem(withTitle:"Exporter des entrées…",action:#selector(exportNodeEntries),keyEquivalent:"")
        nodeItem.submenu=nodeMenu;legacy.addItem(nodeItem)
        let pythonItem=NSMenuItem(title:"Prompt Vault Python",action:nil,keyEquivalent:"");let pythonMenu=NSMenu(title:"Prompt Vault Python")
        pythonMenu.addItem(withTitle:"Chercher…",action:#selector(searchPythonVault),keyEquivalent:"")
        pythonMenu.addItem(withTitle:"Lister les projets",action:#selector(listPythonProjects),keyEquivalent:"")
        pythonMenu.addItem(withTitle:"Boîte de réception",action:#selector(listPythonInbox),keyEquivalent:"")
        pythonMenu.addItem(withTitle:"Diagnostic",action:#selector(doctorPythonVault),keyEquivalent:"")
        pythonMenu.addItem(withTitle:"Réindexer",action:#selector(reindexPython),keyEquivalent:"")
        pythonMenu.addItem(withTitle:"Exporter…",action:#selector(exportPythonVault),keyEquivalent:"")
        pythonMenu.addItem(withTitle:"Importer Codex",action:#selector(importPythonVault),keyEquivalent:"")
        pythonItem.submenu=pythonMenu;legacy.addItem(pythonItem)
        legacyItem.submenu=legacy
        NSApp.mainMenu=menu
        let annotationFile=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/v3-annotations.json")
        do { annotations=try NativeAnnotations(file:annotationFile) }
        catch { NSLog("Annotations V3 préservées, lecture impossible : %@",String(describing:error)) }
        do {drafts=try NativeDrafts(file:annotationFile.deletingLastPathComponent().appendingPathComponent("v3-drafts.json"))}
        catch {NSLog("Brouillons V3 préservés, lecture impossible : %@",String(describing:error))}
        do {ruleStore=try NativeRules(file:annotationFile.deletingLastPathComponent().appendingPathComponent("v3-rules.json"))}
        catch {NSLog("Règles V3 préservées, lecture impossible : %@",String(describing:error))}
        do {viewStore=try NativeViews(file:annotationFile.deletingLastPathComponent().appendingPathComponent("v3-views.json"))}
        catch {NSLog("Vues V3 préservées, lecture impossible : %@",String(describing:error))}
        do {favoriteStore=try NativeFavorites(file:annotationFile.deletingLastPathComponent().appendingPathComponent("v3-favorites.json"))}
        catch {NSLog("Favoris V3 préservés, lecture impossible : %@",String(describing:error))}
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1400,height:850),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="PromptMistress · Bibliothèque";window.contentMinSize=NSSize(width:1040,height:600)
        let root=NSView(frame:window.contentView!.bounds);root.autoresizingMask=[.width,.height];window.contentView=root
        let top=NSView();top.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(top)
        navigation=NSSegmentedControl(labels:["Bibliothèque","Fusion / Lab","Importer"],trackingMode:.selectOne,target:self,action:#selector(navigateMain));navigation.selectedSegment=0;navigation.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(navigation)
        displayMenu=NSPopUpButton(frame:.zero,pullsDown:true);displayMenu.translatesAutoresizingMaskIntoConstraints=false
        displayMenu.addItem(withTitle:"Affichage ▾")
        func displayItem(_ title:String,_ tag:Int,_ action:Selector = #selector(changeDisplayOption(_:))) {
            let item=NSMenuItem(title:title,action:action,keyEquivalent:"")
            item.target=self;item.tag=tag;displayMenu.menu?.addItem(item)
        }
        displayItem("Lignes + Ko",200);displayItem("Lignes seulement",201);displayItem("Ko seulement",202);displayItem("Masquer la taille",203)
        displayMenu.menu?.addItem(.separator())
        displayItem("Lignes compactes",210);displayItem("Lignes normales",211);displayItem("Lignes espacées",212)
        displayMenu.menu?.addItem(.separator())
        displayItem("Explorateur",220);displayItem("Tags dans les lignes",221);displayItem("Nombre de versions",222)
        displayMenu.menu?.addItem(.separator())
        displayItem("Colonne Date",230);displayItem("Colonne Plateforme",231);displayItem("Colonne Projet",232);displayItem("Colonne Statut",233);displayItem("Colonne Source",234)
        displayItem("Colonne Taille",260);displayItem("Colonne Lignes",261);displayItem("Colonne Tags",262);displayItem("Colonne Dossiers",263)
        displayItem("Colonne Priorité",264);displayItem("Colonne Versions",265);displayItem("Colonne Type",266)
        displayItem("Colonne Note",267);displayItem("Colonne Identifiant",268);displayItem("Colonne Lien source",269)
        displayMenu.menu?.addItem(.separator())
        displayItem("Tous les prompts",240);displayItem("Prompts ≥ 0,2 Ko",241);displayItem("Prompts ≥ 0,5 Ko",242);displayItem("Prompts ≥ 1 Ko",243);displayItem("Prompts ≥ 2 Ko",244)
        displayMenu.menu?.addItem(.separator())
        displayItem("Réglages détaillés…",250,#selector(editDisplay))
        top.addSubview(displayMenu)
        search=NSSearchField();search.placeholderString="Titre, message, projet, #tag, @mention…";search.delegate=self;search.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(search)
        quickKind=NSPopUpButton();quickKind.addItems(withTitles:["Tout","Chats","Prompts"]);quickKind.target=self;quickKind.action=#selector(changeQuickFilter);quickKind.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(quickKind)
        quickProvider=NSPopUpButton();quickProvider.addItem(withTitle:"Toutes sources");quickProvider.target=self;quickProvider.action=#selector(changeQuickFilter);quickProvider.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(quickProvider)
        fullTextToggle=NSButton(checkboxWithTitle:"Texte complet",target:self,action:#selector(toggleFullTextSearch));fullTextToggle.state = .on;fullTextToggle.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(fullTextToggle)
        let reload=NSButton(title:"Actualiser",target:self,action:#selector(refreshNow));reload.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(reload)
        let filterButton=NSButton(title:"Plus de filtres…",target:self,action:#selector(editFilters));filterButton.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(filterButton)
        let exportButton=NSButton(title:"Exporter",target:self,action:#selector(exportSelection));exportButton.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(exportButton)
        status=NSTextField(labelWithString:"Chargement des sources…");status.textColor = .secondaryLabelColor;status.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(status)
        scanProgress=NSProgressIndicator();scanProgress.style = .bar;scanProgress.controlSize = .small;scanProgress.isIndeterminate=true;scanProgress.isHidden=true;scanProgress.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(scanProgress)
        filterSummary=NSTextField(labelWithString:"Affichage : actifs");filterSummary.textColor = .secondaryLabelColor;filterSummary.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(filterSummary)
        clearFilterButton=NSButton(title:"Réinitialiser les filtres",target:self,action:#selector(clearAllFilters));clearFilterButton.bezelStyle = .inline;clearFilterButton.translatesAutoresizingMaskIntoConstraints=false;clearFilterButton.isHidden=true;top.addSubview(clearFilterButton)
        let checkVisibleButton=NSButton(title:"Cocher les résultats visibles",target:self,action:#selector(checkVisible));checkVisibleButton.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(checkVisibleButton)
        let clearChecksButton=NSButton(title:"Tout décocher",target:self,action:#selector(clearChecks));clearChecksButton.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(clearChecksButton)
        checkSummary=NSTextField(labelWithString:"0 cochés");checkSummary.textColor = .secondaryLabelColor;checkSummary.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(checkSummary)
        bulkExportButton=NSButton(title:"Export groupé…",target:self,action:#selector(exportBulk));bulkExportButton.translatesAutoresizingMaskIntoConstraints=false;top.addSubview(bulkExportButton)
        let split=NSSplitView();split.isVertical=true;split.dividerStyle = .thin;split.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(split)
        mainSplit=split
        importPane=makeImportPane();importPane.translatesAutoresizingMaskIntoConstraints=false;importPane.isHidden=true;root.addSubview(importPane)
        table=NSTableView();table.headerView=NSTableHeaderView();table.rowHeight=44;table.usesAlternatingRowBackgroundColors=true;table.allowsMultipleSelection=true;table.columnAutoresizingStyle = .noColumnAutoresizing;table.delegate=self;table.dataSource=self
        let pickColumn=NSTableColumn(identifier:NSUserInterfaceItemIdentifier("pick"));pickColumn.title="✓";pickColumn.width=38;pickColumn.minWidth=38;pickColumn.maxWidth=38;table.addTableColumn(pickColumn)
        for specification in libraryColumns {
            let column=NSTableColumn(identifier:NSUserInterfaceItemIdentifier(specification.id))
            column.title=specification.title
            column.width=CGFloat(displaySettings.widths?[specification.id] ?? Double(specification.width))
            column.minWidth=60
            if ["date","provider","title","project"].contains(specification.id) {
                column.sortDescriptorPrototype=NSSortDescriptor(key:specification.id,ascending:specification.id != "date")
            }
            table.addTableColumn(column)
        }
        NotificationCenter.default.addObserver(self,selector:#selector(tableColumnResized),name:NSTableView.columnDidResizeNotification,object:table)
        let leftPane=NSSplitView();leftPane.isVertical=true;leftPane.dividerStyle = .thin;leftPane.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
        librarySplit=leftPane
        explorer=NSOutlineView();explorer.headerView=nil;explorer.rowHeight=24;explorer.delegate=self;explorer.dataSource=self
        let explorerColumn=NSTableColumn(identifier:NSUserInterfaceItemIdentifier("facet"));explorerColumn.title="Explorer";explorerColumn.width=390;explorer.addTableColumn(explorerColumn);explorer.outlineTableColumn=explorerColumn
        let explorerScroll=NSScrollView();explorerScroll.documentView=explorer;explorerScroll.hasVerticalScroller=true;leftPane.addArrangedSubview(explorerScroll)
        let left=NSScrollView();left.documentView=table;left.hasVerticalScroller=true;left.hasHorizontalScroller=true;left.setContentCompressionResistancePriority(.defaultLow,for:.horizontal);leftPane.addArrangedSubview(left)
        split.addArrangedSubview(leftPane)
        let right=NSView();split.addArrangedSubview(right)
        inspectorTabs=NSSegmentedControl(labels:["Lire","Classer · Index"],trackingMode:.selectOne,target:self,action:#selector(showInspectorTab))
        inspectorTabs.selectedSegment=0;inspectorTabs.translatesAutoresizingMaskIntoConstraints=false;right.addSubview(inspectorTabs)
        inspectorHeading=NSTextField(labelWithString:"Sélectionne une conversation")
        inspectorHeading.font=NSFont.systemFont(ofSize:15,weight:.semibold);inspectorHeading.lineBreakMode = .byTruncatingTail;inspectorHeading.translatesAutoresizingMaskIntoConstraints=false;right.addSubview(inspectorHeading)
        variants=NSPopUpButton();variants.target=self;variants.action=#selector(showSelectedDetail);variants.translatesAutoresizingMaskIntoConstraints=false;right.addSubview(variants)
        variants.addItem(withTitle:"Sélectionnez une fiche")
        variants.isEnabled=false
        readerMenu=NSPopUpButton(frame:.zero,pullsDown:true);readerMenu.translatesAutoresizingMaskIntoConstraints=false
        readerMenu.addItem(withTitle:"Affichage du chat")
        for (title,tag) in [("Conversation",100),("Questions / prompts",101),("Réponses",102),("Texte source",103)] {
            let item=NSMenuItem(title:title,action:#selector(changeReaderMode(_:)),keyEquivalent:"")
            item.target=self;item.tag=tag;readerMenu.menu?.addItem(item)
        }
        readerMenu.menu?.addItem(NSMenuItem.separator())
        for (title,tag) in [("Texte plus petit",110),("Texte plus grand",111)] {
            let item=NSMenuItem(title:title,action:#selector(changeReaderSize(_:)),keyEquivalent:"")
            item.target=self;item.tag=tag;readerMenu.menu?.addItem(item)
        }
        right.addSubview(readerMenu)
        let copyButton=NSButton(title:"Copier",target:self,action:#selector(copyDisplayedText));copyButton.translatesAutoresizingMaskIntoConstraints=false;right.addSubview(copyButton)
        detail=NSTextView(frame:NSRect(x:0,y:0,width:320,height:600));detail.isEditable=false;detail.isSelectable=true;detail.delegate=self;detail.font=NSFont.monospacedSystemFont(ofSize:13,weight:.regular);detail.textContainerInset=NSSize(width:18,height:18)
        detail.isVerticallyResizable=true;detail.isHorizontallyResizable=false;detail.autoresizingMask=[.width]
        detail.textContainer?.widthTracksTextView=true;detail.textColor = .labelColor
        detail.string="Sélectionnez une conversation ou un prompt pour lire son contenu."
        detailScroll=NSScrollView();detailScroll.documentView=detail;detailScroll.hasVerticalScroller=true;detailScroll.translatesAutoresizingMaskIntoConstraints=false;right.addSubview(detailScroll)
        ficheScroll=makeFichePanel();ficheScroll.translatesAutoresizingMaskIntoConstraints=false;right.addSubview(ficheScroll)
        ficheScroll.isHidden=true
        libraryToolbar=[displayMenu,search,quickKind,quickProvider,fullTextToggle,filterButton,exportButton,reload,filterSummary,clearFilterButton,checkVisibleButton,clearChecksButton,checkSummary,bulkExportButton]
        topHeightConstraint=top.heightAnchor.constraint(equalToConstant:138)
        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo:root.topAnchor,constant:10),top.leadingAnchor.constraint(equalTo:root.leadingAnchor,constant:18),top.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-18),topHeightConstraint,
            navigation.leadingAnchor.constraint(equalTo:top.leadingAnchor),navigation.topAnchor.constraint(equalTo:top.topAnchor),navigation.widthAnchor.constraint(equalToConstant:370),
            displayMenu.leadingAnchor.constraint(equalTo:navigation.trailingAnchor,constant:10),displayMenu.centerYAnchor.constraint(equalTo:navigation.centerYAnchor),displayMenu.widthAnchor.constraint(equalToConstant:115),
            status.centerYAnchor.constraint(equalTo:navigation.centerYAnchor),status.leadingAnchor.constraint(greaterThanOrEqualTo:displayMenu.trailingAnchor,constant:12),status.trailingAnchor.constraint(equalTo:top.trailingAnchor),
            scanProgress.leadingAnchor.constraint(equalTo:status.leadingAnchor),scanProgress.trailingAnchor.constraint(equalTo:status.trailingAnchor),scanProgress.topAnchor.constraint(equalTo:status.bottomAnchor,constant:1),scanProgress.heightAnchor.constraint(equalToConstant:6),
            search.leadingAnchor.constraint(equalTo:top.leadingAnchor),search.topAnchor.constraint(equalTo:navigation.bottomAnchor,constant:10),search.widthAnchor.constraint(greaterThanOrEqualToConstant:250),
            quickKind.leadingAnchor.constraint(equalTo:search.trailingAnchor,constant:8),quickKind.centerYAnchor.constraint(equalTo:search.centerYAnchor),quickKind.widthAnchor.constraint(equalToConstant:115),
            quickProvider.leadingAnchor.constraint(equalTo:quickKind.trailingAnchor,constant:6),quickProvider.centerYAnchor.constraint(equalTo:search.centerYAnchor),quickProvider.widthAnchor.constraint(equalToConstant:135),
            fullTextToggle.leadingAnchor.constraint(equalTo:quickProvider.trailingAnchor,constant:8),fullTextToggle.centerYAnchor.constraint(equalTo:search.centerYAnchor),
            filterButton.leadingAnchor.constraint(equalTo:fullTextToggle.trailingAnchor,constant:8),filterButton.centerYAnchor.constraint(equalTo:search.centerYAnchor),
            exportButton.leadingAnchor.constraint(equalTo:filterButton.trailingAnchor,constant:6),exportButton.centerYAnchor.constraint(equalTo:search.centerYAnchor),
            reload.leadingAnchor.constraint(equalTo:exportButton.trailingAnchor,constant:6),reload.centerYAnchor.constraint(equalTo:search.centerYAnchor),reload.trailingAnchor.constraint(equalTo:top.trailingAnchor),
            filterSummary.leadingAnchor.constraint(equalTo:top.leadingAnchor),filterSummary.topAnchor.constraint(equalTo:search.bottomAnchor,constant:7),filterSummary.trailingAnchor.constraint(lessThanOrEqualTo:clearFilterButton.leadingAnchor,constant:-10),
            clearFilterButton.trailingAnchor.constraint(equalTo:top.trailingAnchor),clearFilterButton.centerYAnchor.constraint(equalTo:filterSummary.centerYAnchor),
            checkVisibleButton.leadingAnchor.constraint(equalTo:top.leadingAnchor),checkVisibleButton.topAnchor.constraint(equalTo:filterSummary.bottomAnchor,constant:5),
            clearChecksButton.leadingAnchor.constraint(equalTo:checkVisibleButton.trailingAnchor,constant:6),clearChecksButton.centerYAnchor.constraint(equalTo:checkVisibleButton.centerYAnchor),
            checkSummary.leadingAnchor.constraint(equalTo:clearChecksButton.trailingAnchor,constant:10),checkSummary.centerYAnchor.constraint(equalTo:checkVisibleButton.centerYAnchor),
            bulkExportButton.trailingAnchor.constraint(equalTo:top.trailingAnchor),bulkExportButton.centerYAnchor.constraint(equalTo:checkVisibleButton.centerYAnchor),
            split.topAnchor.constraint(equalTo:top.bottomAnchor,constant:8),split.leadingAnchor.constraint(equalTo:root.leadingAnchor),split.trailingAnchor.constraint(equalTo:root.trailingAnchor),split.bottomAnchor.constraint(equalTo:root.bottomAnchor),
            importPane.topAnchor.constraint(equalTo:top.bottomAnchor,constant:8),importPane.leadingAnchor.constraint(equalTo:root.leadingAnchor),importPane.trailingAnchor.constraint(equalTo:root.trailingAnchor),importPane.bottomAnchor.constraint(equalTo:root.bottomAnchor),
            inspectorTabs.topAnchor.constraint(equalTo:right.topAnchor,constant:12),inspectorTabs.leadingAnchor.constraint(equalTo:right.leadingAnchor,constant:14),inspectorTabs.trailingAnchor.constraint(equalTo:right.trailingAnchor,constant:-14),
            inspectorHeading.topAnchor.constraint(equalTo:inspectorTabs.bottomAnchor,constant:10),inspectorHeading.leadingAnchor.constraint(equalTo:right.leadingAnchor,constant:14),inspectorHeading.trailingAnchor.constraint(equalTo:right.trailingAnchor,constant:-14),
            variants.topAnchor.constraint(equalTo:inspectorHeading.bottomAnchor,constant:6),variants.leadingAnchor.constraint(equalTo:right.leadingAnchor,constant:14),variants.widthAnchor.constraint(equalToConstant:120),
            readerMenu.leadingAnchor.constraint(equalTo:variants.trailingAnchor,constant:6),readerMenu.centerYAnchor.constraint(equalTo:variants.centerYAnchor),readerMenu.widthAnchor.constraint(equalToConstant:145),
            copyButton.leadingAnchor.constraint(equalTo:readerMenu.trailingAnchor,constant:6),copyButton.centerYAnchor.constraint(equalTo:variants.centerYAnchor),copyButton.trailingAnchor.constraint(lessThanOrEqualTo:right.trailingAnchor,constant:-14),
            detailScroll.topAnchor.constraint(equalTo:variants.bottomAnchor,constant:8),detailScroll.leadingAnchor.constraint(equalTo:right.leadingAnchor),detailScroll.trailingAnchor.constraint(equalTo:right.trailingAnchor),detailScroll.bottomAnchor.constraint(equalTo:right.bottomAnchor),
            ficheScroll.topAnchor.constraint(equalTo:variants.bottomAnchor,constant:8),ficheScroll.leadingAnchor.constraint(equalTo:right.leadingAnchor),ficheScroll.trailingAnchor.constraint(equalTo:right.trailingAnchor),ficheScroll.bottomAnchor.constraint(equalTo:right.bottomAnchor)
        ])
        window.center();window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        DispatchQueue.main.async { self.ficheScroll.contentView.scroll(to:.zero) }
        // La fenêtre calcule sa largeur réelle après l’ouverture. Le séparateur est placé
        // lorsque la première lecture des archives termine, sans déplacer ensuite le choix de l’utilisateur.
        applyDisplaySettings()
        loadInspectorFiche()
        refresh()
        checkImportSourcesAtLaunch()
        DispatchQueue.main.asyncAfter(deadline:.now()+3){[weak self] in self?.startCometPerplexityImport()}
        cometImportTimer=Timer.scheduledTimer(withTimeInterval:300,repeats:true){[weak self] _ in self?.startCometPerplexityImport()}
        if localRefreshInterval>0 {DispatchQueue.main.asyncAfter(deadline:.now()+2){[weak self] in self?.syncLocal()}}
        scheduleLocalRefresh()
        if UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled") {startBrowserCapture()}
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
    @objc private func showAbout(){
        guard let path=Bundle.main.path(forResource:"AppIcon",ofType:"png"),let icon=NSImage(contentsOfFile:path) else {
            NSApp.orderFrontStandardAboutPanel(nil);return
        }
        NSApp.orderFrontStandardAboutPanel(options:[.applicationIcon:icon])
    }
    private func makeFichePanel()->NSScrollView {
        let scroll=NSScrollView();scroll.hasVerticalScroller=true
        let panel=FlippedInspectorView(frame:NSRect(x:0,y:0,width:320,height:880));panel.autoresizingMask=[.width]
        func top(_ y:CGFloat,_ height:CGFloat)->CGFloat {760-y-height}
        func label(_ text:String,_ y:CGFloat,_ size:CGFloat=12)->NSTextField {
            let view=NSTextField(labelWithString:text);view.frame=NSRect(x:12,y:top(y,24),width:290,height:24)
            view.autoresizingMask=[.width];view.font=NSFont.systemFont(ofSize:size,weight:.medium);panel.addSubview(view);return view
        }
        func button(_ title:String,_ action:Selector,_ x:CGFloat,_ y:CGFloat,_ width:CGFloat) {
            let view=NSButton(title:title,target:self,action:action);view.frame=NSRect(x:x,y:top(y,28),width:width,height:28);panel.addSubview(view)
        }
        ficheTitle=label("Sélectionne une fiche",720,16);ficheTitle.textColor=rgb(0x59c9ec);ficheTitle.frame.size.width=180
        renamePromptButton=NSButton(title:"Renommer…",target:self,action:#selector(renamePrompt));renamePromptButton.frame=NSRect(x:204,y:top(720,28),width:100,height:28);renamePromptButton.isHidden=true;panel.addSubview(renamePromptButton)
        ficheMeta=label("",694,11);ficheMeta.textColor = .secondaryLabelColor
        button("Masquer",#selector(hideSelection),12,653,88)
        button("Archiver",#selector(archiveSelection),105,653,88)
        button("Activer",#selector(restoreSelection),198,653,88)
        let fields:[(String,String,CGFloat,CGFloat)]=[("Projet","project",610,28),("Tags # / mentions @","tags",553,28),("Dossiers","folders",496,28),("Statut","status",439,28),("Priorité","priority",382,28),("Couleur","color",325,28),("Note","note",268,54)]
        for (title,key,y,height) in fields {
            _=label(title,y)
            let input:NSTextField
            if ["status","priority","color"].contains(key) {
                let choices=NSComboBox(frame:NSRect(x:12,y:top(y-height,height),width:290,height:height))
                choices.addItems(withObjectValues:key == "status" ? ["fini","classe","en-retard","urgent"] : key == "priority" ? ["essentielle","prioritaire","important","a-faire","futile","inutile"] : ["blue","green","yellow","pink"])
                input=choices
            } else {input=NSTextField(frame:NSRect(x:12,y:top(y-height,height),width:290,height:height))}
            input.autoresizingMask=[.width]
            if key == "note" {input.usesSingleLineMode=false;input.cell?.wraps=true;input.maximumNumberOfLines=3}
            input.placeholderString=key == "project" ? "Nom du projet" : key == "tags" ? "#thème, @personne" : key == "folders" ? "Projet/Dossier" : key == "color" ? "blue, green, yellow, pink" : nil
            panel.addSubview(input);ficheFields[key]=input
        }
        button("Enregistrer la fiche",#selector(saveInspectorFiche),12,168,290)
        button("Tags favoris",#selector(editFavorites),12,127,140)
        button("Ouvrir la source",#selector(openSource),162,127,140)
        button("Pièces jointes",#selector(showAttachments),12,86,140)
        button("Provenance",#selector(showProvenance),162,86,140)
        button("Exporter",#selector(exportSelection),12,45,140)
        button("Comparer",#selector(compareSelection),162,45,140)
        let divider=NSView(frame:NSRect(x:12,y:733,width:290,height:1));divider.wantsLayer=true;divider.layer?.backgroundColor=NSColor.separatorColor.cgColor;divider.autoresizingMask=[.width];panel.addSubview(divider)
        let indexTitle=NSTextField(labelWithString:"Index de la sélection ou des résultats");indexTitle.font=NSFont.systemFont(ofSize:13,weight:.semibold);indexTitle.frame=NSRect(x:12,y:746,width:290,height:23);indexTitle.autoresizingMask=[.width];panel.addSubview(indexTitle)
        let indexHint=NSTextField(labelWithString:"Choisis les champs au moment de l’export.");indexHint.textColor = .secondaryLabelColor;indexHint.frame=NSRect(x:12,y:773,width:290,height:22);indexHint.autoresizingMask=[.width];panel.addSubview(indexHint)
        let indexExport=NSButton(title:"Exporter un index…",target:self,action:#selector(exportIndex));indexExport.frame=NSRect(x:12,y:804,width:290,height:28);panel.addSubview(indexExport)
        scroll.documentView=panel
        return scroll
    }
    private func makeImportPane()->NSScrollView {
        let scroll=NSScrollView();scroll.hasVerticalScroller=true
        let panel=FlippedInspectorView(frame:NSRect(x:0,y:0,width:960,height:650));panel.autoresizingMask=[.width]
        func text(_ value:String,_ y:CGFloat,_ size:CGFloat=13,_ weight:NSFont.Weight = .regular)->NSTextField {
            let label=NSTextField(labelWithString:value);label.frame=NSRect(x:34,y:y,width:890,height:28)
            label.autoresizingMask=[.width];label.font=NSFont.systemFont(ofSize:size,weight:weight);panel.addSubview(label);return label
        }
        func rule(_ y:CGFloat){let line=NSView(frame:NSRect(x:34,y:y,width:890,height:1));line.wantsLayer=true;line.layer?.backgroundColor=NSColor.separatorColor.cgColor;line.autoresizingMask=[.width];panel.addSubview(line)}
        func button(_ value:String,_ action:Selector,_ x:CGFloat,_ y:CGFloat,_ width:CGFloat)->NSButton {
            let control=NSButton(title:value,target:self,action:action);control.frame=NSRect(x:x,y:y,width:width,height:30);panel.addSubview(control);return control
        }
        _=text("Importer",24,24,.semibold)
        _=text("Choisis une source. Les imports restent dans tes coffres locaux.",59,13)
        rule(103)
        _=text("Sessions locales",122,17,.semibold)
        importLocalSummary=text("Codex, Claude et Gemini · lecture automatique",153)
        _=button("Synchroniser maintenant",#selector(syncLocal),34,188,190)
        _=button("Fréquence…",#selector(editRefreshIntervals),233,188,130)
        _=button("État des sources…",#selector(showImportHealth),372,188,170)
        rule(236)
        _=text("Historique navigateur",255,17,.semibold)
        importStageSummary=text("ChatGPT et Perplexity · aucune capture en attente",286)
        _=button("Voir les captures reçues…",#selector(importStagedClicked),34,321,215)
        _=button("Préférences d’import…",#selector(editImportPreferences),258,321,175)
        rule(369)
        _=text("Page LLM visible",388,17,.semibold)
        _=text("Surveille le texte affiché dans le navigateur avec l’autorisation macOS Accessibilité.",419)
        captureToggleButton=button(UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled") ? "Arrêter la capture" : "Activer la capture",#selector(toggleBrowserCapture),34,454,190)
        rule(502)
        _=text("Fichier local",521,17,.semibold)
        _=text("JSON ChatGPT, conversation générique, Markdown ou texte. Sélection avant import.",552)
        _=button("Choisir un fichier…",#selector(importFileClicked),34,587,180)
        scroll.documentView=panel
        return scroll
    }
    private func refreshImportSummary(){
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        let stage=(try? JSONSerialization.jsonObject(with:Data(contentsOf:data.appendingPathComponent("stage-v3.json")))) as? [String:Any] ?? [:]
        let rows=stage["rows"] as? [String:Any] ?? [:]
        let received=stage["conversations"] as? [String:Any] ?? [:]
        importStageSummary.stringValue="ChatGPT / Perplexity · \(rows.count) repérées · \(received.count) textes reçus"
        let local=(try? JSONSerialization.jsonObject(with:Data(contentsOf:data.appendingPathComponent("import-local-v3.json")))) as? [String:Any] ?? [:]
        let state=ArchiveCore.string(local["state"])
        importLocalSummary.stringValue="Codex, Claude, Gemini · "+(state == "complete" ? "à jour" : state == "running" ? "synchronisation en cours" : state == "failed" ? "erreur de synchronisation" : "en attente")
        captureToggleButton.title=UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled") ? "Arrêter la capture" : "Activer la capture"
    }
    @objc private func showInspectorTab(){
        let tab=inspectorTabs.selectedSegment
        detailScroll.isHidden=tab != 0
        ficheScroll.isHidden=tab != 1
    }
    @objc private func navigateMain(){
        switch navigation.selectedSegment {
        case 1:openFusionLab();navigation.selectedSegment=mainSplit.isHidden ? 2 : 0
        case 2:openImportCenter()
        default:mainSplit.isHidden=false;importPane.isHidden=true;topHeightConstraint.constant=138;libraryToolbar.forEach{$0.isHidden=false};window.title="PromptMistress · Bibliothèque";window.makeKeyAndOrderFront(nil)
        }
    }
    @objc private func changeQuickFilter(){
        kindFilter=quickKind.titleOfSelectedItem == "Chats" ? "Conversations" : quickKind.titleOfSelectedItem ?? "Tout"
        providerFilter=quickProvider.titleOfSelectedItem == "Toutes sources" ? "Toutes" : quickProvider.titleOfSelectedItem ?? "Toutes"
        sourceFilter="Toutes"
        filterRows()
    }
    private func syncQuickFilters(){
        quickKind.selectItem(withTitle:kindFilter == "Conversations" ? "Chats" : kindFilter)
        quickProvider.selectItem(withTitle:providerFilter == "Toutes" ? "Toutes sources" : providerFilter)
    }
    @objc private func clearAllFilters(){
        kindFilter="Conversations";visibilityFilter="Actifs";providerFilter="Toutes";sourceFilter="Toutes";projectFilter="Tous";sortOrder="Récent"
        displaySettings.minPromptBytes=200;displaySettings.save()
        contentOnly=false;duplicatesOnly=false;booleanMode=false;tagFilter="";folderFilter="";statusFilter="";dateFrom="";dateTo=""
        search.stringValue="";searchText=true;fullTextToggle.state = .on
        syncQuickFilters();filterRows()
    }
    private func loadInspectorFiche(){
        guard let key=selectedKey,let row=workspace?.rows.first(where:{ArchiveCore.string($0["key"]) == key}) else {
            ficheTitle.stringValue="Sélectionne une fiche";ficheMeta.stringValue="";inspectorHeading.stringValue="Sélectionne une conversation"
            renamePromptButton.isHidden=true
            for input in ficheFields.values {input.stringValue="";input.isEnabled=false}
            return
        }
        let values=annotation(for:row)
        ficheTitle.stringValue=effectiveTitle(row,annotation:values)
        inspectorHeading.stringValue=effectiveTitle(row,annotation:values)
        renamePromptButton.isHidden=ArchiveCore.string(row["kind"]) != "prompt"
        ficheMeta.stringValue=[ArchiveCore.string(row["kind"]),ArchiveCore.string(row["provider"]),effectiveProject(row,annotation:values)].filter{!$0.isEmpty}.joined(separator:" · ")
        for (key,input) in ficheFields {
            input.isEnabled=true
            let stored=drafts?.values[ArchiveCore.string(row["key"])]?[key] ?? annotationText(values[key])
            input.stringValue=key == "project" && stored.isEmpty ? effectiveProject(row,annotation:values) : stored
        }
    }
    private func retainInspectorDraft(){
        guard let key=selectedKey,let original=annotations?.get(key),let row=workspace?.rows.first(where:{ArchiveCore.string($0["key"])==key}),var store=drafts else{return}
        let values=Dictionary(uniqueKeysWithValues:ficheFields.map{($0.key,$0.value.stringValue)})
        guard values.contains(where:{field,value in value != (field == "project" ? effectiveProject(row,annotation:original) : annotationText(original[field]))}) else{return}
        do{try store.update(key,values);drafts=store}
        catch{status.stringValue="Brouillon non conservé : \(error)"}
    }
    @objc private func renamePrompt(){
        guard let key=selectedKey,let row=workspace?.rows.first(where:{ArchiveCore.string($0["key"]) == key}),ArchiveCore.string(row["kind"]) == "prompt",var store=annotations else{return}
        let input=NSTextField(frame:NSRect(x:0,y:0,width:360,height:27))
        input.stringValue=effectiveTitle(row)
        let alert=NSAlert();alert.messageText="Renommer le prompt"
        alert.informativeText="Le titre local change dans la V3 et les exports. Le fichier et le titre d’origine sont conservés. Laissez vide pour rétablir le titre d’origine."
        alert.accessoryView=input;alert.addButton(withTitle:"Enregistrer");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        let title=input.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
        do {
            try store.update([key],field:"title",value:title)
            annotations=store;ruleResults[key]=nil;evaluateRules();rebuildExplorer();filterRows();loadInspectorFiche()
            status.stringValue=title.isEmpty ? "Titre d’origine rétabli." : "Prompt renommé localement."
        } catch {status.stringValue="Renommage impossible : \(error)"}
    }
    @objc private func saveInspectorFiche(){
        guard let key=selectedKey,var store=annotations else {status.stringValue="Sélectionne une fiche.";return}
        var updated=store.get(key)
        for (field,input) in ficheFields {
            let value=input.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
            updated[field]=["tags","folders"].contains(field) ? value.split(separator:",").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty} as Any : value as Any
        }
        updated["_manual"]=["project","tags","folders","note","status","priority","color"]
        do {
            try store.set(key,fields:updated);annotations=store
            if var draftStore=drafts {try draftStore.update(key,nil);drafts=draftStore}
            evaluateRules();rebuildExplorer();filterRows();loadInspectorFiche()
            status.stringValue="Fiche enregistrée."
        }catch {status.stringValue="Fiche non enregistrée : \(error)"}
    }
    func applicationWillTerminate(_ notification:Notification){retainInspectorDraft();browserImporter?.stop();localRefreshTimer?.invalidate();cometImportTimer?.invalidate()}
    private var localRefreshInterval:TimeInterval {
        let value=UserDefaults.standard.object(forKey:"V3LocalRefreshSeconds") as? Int ?? 300
        return TimeInterval([0,60,300,900,1800,3600].contains(value) ? value : 300)
    }
    private var browserScanInterval:TimeInterval {
        let value=UserDefaults.standard.object(forKey:"V3BrowserScanSeconds") as? Int ?? 10
        return TimeInterval([5,10,20,30,60].contains(value) ? value : 10)
    }
    private func scheduleLocalRefresh(){
        localRefreshTimer?.invalidate();localRefreshTimer=nil
        let interval=localRefreshInterval
        if interval>0 {localRefreshTimer=Timer.scheduledTimer(withTimeInterval:interval,repeats:true){[weak self] _ in self?.syncLocal()}}
    }
    @objc private func refreshNow(){
        manualRefreshPending=true
        browserImporter?.refreshNow()
        if importProcess?.isRunning == true || fileImportProcess?.isRunning == true {status.stringValue="Actualisation demandée · import en cours…";return}
        syncLocal()
    }
    @objc private func editRefreshIntervals(){
        let alert=NSAlert();alert.messageText="Fréquences d’actualisation"
        alert.informativeText="La synchronisation locale importe Codex, Claude et Gemini. La capture navigateur surveille seulement les pages LLM visibles lorsqu’elle est activée."
        alert.addButton(withTitle:"Enregistrer");alert.addButton(withTitle:"Annuler")
        let panel=NSView(frame:NSRect(x:0,y:0,width:430,height:85))
        let localLabel=NSTextField(labelWithString:"Sessions locales");localLabel.frame=NSRect(x:0,y:52,width:150,height:25);panel.addSubview(localLabel)
        let local=NSPopUpButton(frame:NSRect(x:155,y:52,width:270,height:28));local.addItems(withTitles:["Manuel seulement","Toutes les minutes","Toutes les 5 minutes","Toutes les 15 minutes","Toutes les 30 minutes","Toutes les heures"])
        let localValues=[0,60,300,900,1800,3600];local.selectItem(at:localValues.firstIndex(of:Int(localRefreshInterval)) ?? 2);panel.addSubview(local)
        let browserLabel=NSTextField(labelWithString:"Pages LLM visibles");browserLabel.frame=NSRect(x:0,y:16,width:150,height:25);panel.addSubview(browserLabel)
        let browser=NSPopUpButton(frame:NSRect(x:155,y:16,width:270,height:28));browser.addItems(withTitles:["Toutes les 5 secondes","Toutes les 10 secondes","Toutes les 20 secondes","Toutes les 30 secondes","Toutes les minutes"])
        let browserValues=[5,10,20,30,60];browser.selectItem(at:browserValues.firstIndex(of:Int(browserScanInterval)) ?? 1);panel.addSubview(browser)
        alert.accessoryView=panel
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        UserDefaults.standard.set(localValues[max(0,local.indexOfSelectedItem)],forKey:"V3LocalRefreshSeconds")
        UserDefaults.standard.set(browserValues[max(0,browser.indexOfSelectedItem)],forKey:"V3BrowserScanSeconds")
        scheduleLocalRefresh()
        if browserImporter != nil {browserImporter?.stop();browserImporter=nil;if UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled") {startBrowserCapture()}}
        status.stringValue="Fréquences d’actualisation enregistrées."
    }
    @objc private func toggleBrowserCapture(){
        let enabled=UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled")
        if enabled {
            UserDefaults.standard.set(false,forKey:"BrowserCaptureEnabled")
            browserImporter?.stop();browserMenuItem?.state = .off
            status.stringValue="Capture automatique du navigateur arrêtée."
        } else {
            UserDefaults.standard.set(true,forKey:"BrowserCaptureEnabled")
            startBrowserCapture()
            if !BrowserVisibleCapture.isTrusted {
                let options=[kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String:true] as CFDictionary
                _ = AXIsProcessTrustedWithOptions(options)
                status.stringValue="Autorisez PromptMistress V3 dans Réglages système → Confidentialité → Accessibilité."
            }
        }
        captureToggleButton.title=UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled") ? "Arrêter la capture" : "Activer la capture"
    }
    private func startBrowserCapture(){
        browserMenuItem?.state = .on
        if browserImporter == nil {
            let resources=Bundle.main.resourceURL!
            let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
            do {
                let config=try Data(contentsOf:data.appendingPathComponent("sources.json"))
                let sources=try JSONDecoder().decode([ArchiveSource].self,from:config)
                guard let vault=sources.first(where:{$0.type=="vault"&&$0.name=="Prompt Vault Node"}) else {
                    status.stringValue="Coffre Prompt Vault Node introuvable.";return
                }
                let destination=try NativeImportPreferences.load(file:data.appendingPathComponent("preferences.json"),defaultDestination:ArchiveCore.expandHome(vault.path)).destination
                browserImporter=BrowserAutoImporter(resources:resources,data:data,vault:destination,pollInterval:browserScanInterval) {[weak self] message,changed in
                    self?.status.stringValue=message
                    if changed {self?.refresh()}
                }
            }catch{status.stringValue="Capture navigateur indisponible : \(error)";return}
        }
        browserImporter?.start()
        if BrowserVisibleCapture.isTrusted {
            status.stringValue="Capture automatique active · en attente d’une page LLM visible."
        }
    }
    @objc private func copyForNoteMistress(){
        let range=detail.selectedRange()
        let body=detail.string as NSString
        guard let key=selectedKey,
              let row=workspace?.rows.first(where:{ArchiveCore.string($0["key"])==key}) else {
            status.stringValue="Sélectionnez une conversation avant la copie."
            return
        }
        let current=range.length>0 && NSMaxRange(range)<=body.length ? body.substring(with:range) : nil
        guard let text=current ?? (selectedExcerptKey==key ? selectedExcerpt : nil), !text.isEmpty else {
            status.stringValue="Sélectionnez un extrait dans la conversation avant la copie."
            return
        }
        let title=ArchiveCore.string(row["title"])
        let source=ArchiveCore.string(row["provider"])
        let variant=max(0,variants.indexOfSelectedItem)
        let variants=row["variants"] as? [[String:Any]] ?? []
        let link=variants.indices.contains(variant) ? ArchiveCore.string(variants[variant]["sourceURL"]) : ""
        let supportedLink=link.hasPrefix("https://") || link.hasPrefix("http://") || link.hasPrefix("promptvault://") ? link : ""
        let binary=Bundle.main.resourceURL!.appendingPathComponent("bin/chatdomina")
        status.stringValue="Mise en forme par CHATDomina…"
        DispatchQueue.global(qos:.userInitiated).async { [weak self] in
            let result=Result { try ChatDominaBridge.renderPrompt(binary:binary,title:title,text:text,source:source,sourceLink:supportedLink) }
            DispatchQueue.main.async {
                guard let self else { return }
                switch result {
                case .success(let markdown):
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(markdown,forType:.string)
                    self.status.stringValue="Extrait CHATDomina copié · prêt pour NoteMistress."
                case .failure(let error):
                    self.status.stringValue="CHATDomina : \(error.localizedDescription)"
                }
            }
        }
    }
    @objc private func exportChatForNoteMistress(){
        guard let key=selectedKey,let workspace,
              let row=workspace.rows.first(where:{ArchiveCore.string($0["key"]) == key}),
              ArchiveCore.string(row["kind"]) == "chat" else {status.stringValue="Choisissez une conversation.";return}
        let variant=max(0,variants.indexOfSelectedItem)
        guard let record=try? workspace.detail(key:key,variant:variant),
              let messages=record["messages"] as? [[String:String]],
              messages.contains(where:{$0["role"] == "user"}),messages.contains(where:{$0["role"] == "assistant"}) else {
            status.stringValue="Cette archive ne contient pas les rôles nécessaires pour exporter un chat complet.";return
        }
        let confirm=NSAlert();confirm.messageText="Cette conversation est-elle complète ?"
        confirm.informativeText="CHATDomina exige la confirmation du début et de la fin de l’échange. Vérifiez le texte source avant l’export."
        confirm.addButton(withTitle:"Oui, exporter");confirm.addButton(withTitle:"Annuler")
        guard confirm.runModal() == .alertFirstButtonReturn else{return}
        let save=NSSavePanel();save.nameFieldStringValue="CHATDomina - \(ArchiveCore.string(row["title"]).prefix(70)).md"
        guard save.runModal() == .OK,let destination=save.url else{return}
        let title=ArchiveCore.string(row["title"]),source=ArchiveCore.string(row["provider"])
        let rawLink=ArchiveCore.string(record["sourceURL"])
        let link=["http://","https://","codex://","promptvault://"].contains(where:rawLink.hasPrefix) ? rawLink : ""
        let binary=Bundle.main.resourceURL!.appendingPathComponent("bin/chatdomina")
        let body=ArchiveCore.string(record["text"])
        status.stringValue="Préparation du chat CHATDomina…"
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result {try ChatDominaBridge.renderChat(binary:binary,title:title,text:body,source:source,sourceLink:link)}
            DispatchQueue.main.async {
                switch result {
                case .success(let markdown):
                    do {try Data(markdown.utf8).write(to:destination,options:.atomic);self.status.stringValue="Chat CHATDomina enregistré pour NoteMistress."}
                    catch {self.status.stringValue="Chat non enregistré : \(error)"}
                case .failure(let error):self.status.stringValue="CHATDomina : \(error.localizedDescription)"
                }
            }
        }
    }
    func textViewDidChangeSelection(_ notification: Notification) {
        guard let key=selectedKey else { return }
        let range=detail.selectedRange()
        let body=detail.string as NSString
        guard range.length>0, NSMaxRange(range)<=body.length else { return }
        selectedExcerpt=body.substring(with:range)
        selectedExcerptKey=key
    }
    private func checkImportSourcesAtLaunch(){
        let resources=Bundle.main.resourceURL!,appRoot=resources.appendingPathComponent("app")
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        let process=Process();process.executableURL=resources.appendingPathComponent("bin/node")
        process.arguments=[appRoot.appendingPathComponent("native-v3/check-import-sources.mjs").path]
        process.currentDirectoryURL=appRoot
        var environment=ProcessInfo.processInfo.environment;environment["PROMPTMISTRESS_DATA"]=data.path;process.environment=environment
        process.standardOutput=Pipe();process.standardError=Pipe()
        process.terminationHandler={ [weak self] finished in
            DispatchQueue.main.async {
                guard let self else{return}
                if finished.terminationStatus != 0 {self.status.stringValue="Contrôle des sources d’import impossible.";return}
                let file=data.appendingPathComponent("import-health-v3.json")
                guard let report=(try? JSONSerialization.jsonObject(with:Data(contentsOf:file))) as? [String:Any] else{return}
                let ready=report["ready"] as? Int ?? 0,total=report["total"] as? Int ?? 0
                self.status.stringValue="Sources d’import : \(ready)/\(total) prêtes · détails dans Fichier"
            }
        }
        do{try process.run()}catch{status.stringValue="Contrôle des sources d’import impossible : \(error.localizedDescription)"}
    }
    private func startCometPerplexityImport(){
        guard cometImportProcess?.isRunning != true else{return}
        let resources=Bundle.main.resourceURL!,appRoot=resources.appendingPathComponent("app")
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        let process=Process();process.executableURL=resources.appendingPathComponent("bin/node")
        process.arguments=[appRoot.appendingPathComponent("native-v3/import-comet-perplexity.mjs").path]
        process.currentDirectoryURL=appRoot
        var environment=ProcessInfo.processInfo.environment;environment["PROMPTMISTRESS_DATA"]=data.path;process.environment=environment
        process.standardOutput=Pipe();process.standardError=Pipe()
        process.terminationHandler={ [weak self] finished in
            DispatchQueue.main.async {
                guard let self else{return}
                self.cometImportProcess=nil
                if finished.terminationStatus==0 {
                    let file=data.appendingPathComponent("import-comet-perplexity-v3.json")
                    let report=(try? JSONSerialization.jsonObject(with:Data(contentsOf:file))) as? [String:Any]
                    if (report?["imported"] as? Int ?? 0)>0 {self.refresh()}
                }
                self.checkImportSourcesAtLaunch()
            }
        }
        do{try process.run();cometImportProcess=process}catch{status.stringValue="Import Comet impossible : \(error.localizedDescription)"}
    }
    @objc private func showImportHealth(){
        let file=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives/import-health-v3.json")
        guard let report=(try? JSONSerialization.jsonObject(with:Data(contentsOf:file))) as? [String:Any] else {
            status.stringValue="Aucun contrôle des sources disponible.";return
        }
        var lines:[String]=[]
        for row in report["sources"] as? [[String:Any]] ?? [] {
            let name=row["name"] as? String ?? "Source",state=row["state"] as? String ?? "inconnu",detail=row["detail"] as? String ?? ""
            lines.append("\(name) : \(state) — \(detail)")
        }
        lines.append("")
        for browser in report["browsers"] as? [[String:Any]] ?? [] {
            let name=browser["name"] as? String ?? "Navigateur",ready=browser["ready"] as? Bool ?? false,profile=browser["profile"] as? String ?? ""
            lines.append("\(name) : \(ready ? "pont et extension prêts" : "configuration incomplète")\(profile.isEmpty ? "" : " (\(profile))")")
        }
        let alert=NSAlert();alert.messageText="Sources d’import au lancement"
        alert.informativeText=lines.joined(separator:"\n")
        alert.addButton(withTitle:"OK");alert.runModal()
    }
    @objc private func syncLocal(){
        guard importProcess?.isRunning != true && fileImportProcess?.isRunning != true else{return}
        let resources=Bundle.main.resourceURL!
        let appRoot=resources.appendingPathComponent("app")
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        do {
            let config=try Data(contentsOf:data.appendingPathComponent("sources.json"))
            let sources=try JSONDecoder().decode([ArchiveSource].self,from:config)
            guard let vault=sources.first(where:{$0.type=="vault"&&$0.name=="Prompt Vault Node"}) else {
                status.stringValue="Coffre Prompt Vault Node introuvable.";return
            }
            let process=Process();process.executableURL=resources.appendingPathComponent("bin/node")
            process.arguments=[appRoot.appendingPathComponent("native-v3/import-local.mjs").path]
            process.currentDirectoryURL=appRoot
            var environment=ProcessInfo.processInfo.environment
            environment["PROMPTMISTRESS_DATA"]=data.path
            environment["PROMPTMISTRESS_VAULT"]=try NativeImportPreferences.load(file:data.appendingPathComponent("preferences.json"),defaultDestination:ArchiveCore.expandHome(vault.path)).destination
            process.environment=environment
            process.terminationHandler={ [weak self] finished in
                DispatchQueue.main.async {
                    guard let self else{return}
                    self.importProcess=nil
                    let manual=self.manualRefreshPending;self.manualRefreshPending=false
                    if finished.terminationStatus==0 {
                        let statusFile=data.appendingPathComponent("import-local-v3.json")
                        let state=(try? JSONSerialization.jsonObject(with:Data(contentsOf:statusFile))) as? [String:Any]
                        if (state?["imported"] as? Int ?? 0)>0 || manual {self.refresh()}
                        else {self.status.stringValue="Sources locales à jour · \(self.workspace?.rows.count ?? 0) entrées"}
                    }
                    else {self.status.stringValue="Import local échoué. Consultez import-local-v3.json dans les archives."}
                    self.refreshImportSummary()
                }
            }
            try process.run();importProcess=process
            status.stringValue="Synchronisation locale en cours…"
        }catch{manualRefreshPending=false;status.stringValue="Import local impossible : \(error)"}
    }
    @objc private func editImportPreferences(){
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        let file=data.appendingPathComponent("preferences.json")
        do {
            let sources=try JSONDecoder().decode([ArchiveSource].self,from:Data(contentsOf:data.appendingPathComponent("sources.json")))
            guard let source=sources.first(where:{$0.type == "vault" && $0.name == "Prompt Vault Node"}) else {status.stringValue="Coffre Node introuvable.";return}
            var prefs=try NativeImportPreferences.load(file:file,defaultDestination:ArchiveCore.expandHome(source.path))
            let alert=NSAlert();alert.messageText="Préférences d’import";alert.addButton(withTitle:"Enregistrer");alert.addButton(withTitle:"Annuler")
            let panel=NSView(frame:NSRect(x:0,y:0,width:480,height:145))
            let automatic=NSButton(checkboxWithTitle:"Importer automatiquement ChatGPT et Perplexity",target:nil,action:nil)
            automatic.frame=NSRect(x:0,y:115,width:475,height:25);automatic.state=prefs.autoImport ? .on : .off;panel.addSubview(automatic)
            let label=NSTextField(labelWithString:"Dossier du coffre");label.frame=NSRect(x:0,y:78,width:140,height:25);panel.addSubview(label)
            let destination=NSTextField(frame:NSRect(x:145,y:78,width:330,height:27));destination.stringValue=prefs.destination;panel.addSubview(destination)
            let duplicateLabel=NSTextField(labelWithString:"Doublons");duplicateLabel.frame=NSRect(x:0,y:40,width:140,height:25);panel.addSubview(duplicateLabel)
            let duplicates=NSPopUpButton(frame:NSRect(x:145,y:40,width:330,height:28));duplicates.addItems(withTitles:["Ignorer","Ajouter une version"]);duplicates.selectItem(at:prefs.duplicates == "version" ? 1 : 0);panel.addSubview(duplicates)
            let hint=NSTextField(labelWithString:"Le dossier doit contenir index.json, 00_INBOX, 02_PROMPTS et RAW.");hint.frame=NSRect(x:0,y:4,width:475,height:22);hint.textColor = .secondaryLabelColor;panel.addSubview(hint)
            alert.accessoryView=panel
            guard alert.runModal() == .alertFirstButtonReturn else{return}
            prefs.destination=destination.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
            prefs.autoImport=automatic.state == .on
            prefs.duplicates=duplicates.indexOfSelectedItem == 1 ? "version" : "skip"
            try prefs.save(file:file)
            if browserImporter != nil {browserImporter?.stop();browserImporter=nil;if UserDefaults.standard.bool(forKey:"BrowserCaptureEnabled") {startBrowserCapture()}}
            refresh();status.stringValue="Préférences d’import enregistrées."
        }catch {status.stringValue="Préférences non enregistrées : \(error.localizedDescription)"}
    }
    @objc private func importFileClicked(){
        guard importProcess?.isRunning != true && fileImportProcess?.isRunning != true else{return}
        let panel=NSOpenPanel();panel.allowedContentTypes=["json","md","txt"].compactMap{UTType(filenameExtension:$0)}
        panel.canChooseDirectories=false;panel.allowsMultipleSelection=false
        panel.begin{[weak self] response in
            guard response == .OK,let file=panel.url else{return}
            self?.importFile(file)
        }
    }
    @objc private func openImportCenter(){
        refreshImportSummary()
        mainSplit.isHidden=true;importPane.isHidden=false;topHeightConstraint.constant=44;libraryToolbar.forEach{$0.isHidden=true}
        navigation.selectedSegment=2;window.title="PromptMistress · Importer"
        window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    }
    @objc private func importStagedClicked(){
        guard fileImportProcess?.isRunning != true else{return}
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        let stage=data.appendingPathComponent("stage-v3.json")
        let ids:[String]
        do {guard let chosen=try NativeStagePicker.choose(file:stage) else{return};ids=chosen}
        catch {status.stringValue="Captures illisibles : \(error.localizedDescription)";return}
        guard !ids.isEmpty else{status.stringValue="Aucun texte capturé sélectionné.";return}
        let resources=Bundle.main.resourceURL!,appRoot=resources.appendingPathComponent("app")
        do {
            let sources=try JSONDecoder().decode([ArchiveSource].self,from:Data(contentsOf:data.appendingPathComponent("sources.json")))
            guard let vault=sources.first(where:{$0.type=="vault" && $0.name=="Prompt Vault Node"}) else{status.stringValue="Coffre Node introuvable.";return}
            let prefs=try NativeImportPreferences.load(file:data.appendingPathComponent("preferences.json"),defaultDestination:ArchiveCore.expandHome(vault.path))
            let process=Process();process.executableURL=resources.appendingPathComponent("bin/node");process.arguments=[appRoot.appendingPathComponent("native-v3/import-stage.mjs").path];process.currentDirectoryURL=appRoot
            var environment=ProcessInfo.processInfo.environment;environment["PROMPTMISTRESS_DATA"]=data.path;environment["PROMPTMISTRESS_VAULT"]=prefs.destination
            environment["PROMPTMISTRESS_STAGE_IDS"]=String(data:try JSONSerialization.data(withJSONObject:ids),encoding:.utf8)
            process.environment=environment
            let output=Pipe(),errors=Pipe();process.standardOutput=output;process.standardError=errors
            process.terminationHandler={ [weak self] finished in
                let message=String(data:errors.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
                DispatchQueue.main.async {guard let self else{return};self.fileImportProcess=nil;if finished.terminationStatus==0{self.refresh();self.status.stringValue="\(ids.count) capture(s) importée(s)."}else{self.status.stringValue="Import impossible : \(message.prefix(300))"};self.refreshImportSummary()}
            }
            try process.run();fileImportProcess=process;status.stringValue="Import de \(ids.count) capture(s)…"
        }catch {status.stringValue="Import impossible : \(error.localizedDescription)"}
    }
    private func importFile(_ file:URL){
        let selection:[Int]?
        do {selection=try NativeImportPicker.choose(file:file)}
        catch {status.stringValue="Lecture du fichier impossible : \(error.localizedDescription)";return}
        if let selection,selection.isEmpty {status.stringValue="Aucune conversation sélectionnée.";return}
        let resources=Bundle.main.resourceURL!
        let appRoot=resources.appendingPathComponent("app")
        let data=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives")
        do {
            let config=try Data(contentsOf:data.appendingPathComponent("sources.json"))
            let sources=try JSONDecoder().decode([ArchiveSource].self,from:config)
            guard let vault=sources.first(where:{$0.type=="vault"&&$0.name=="Prompt Vault Node"}) else {
                status.stringValue="Coffre Prompt Vault Node introuvable.";return
            }
            let process=Process();process.executableURL=resources.appendingPathComponent("bin/node")
            process.arguments=[appRoot.appendingPathComponent("native-v3/import-file.mjs").path,file.path]
            process.currentDirectoryURL=appRoot
            var environment=ProcessInfo.processInfo.environment
            environment["PROMPTMISTRESS_DATA"]=data.path
            environment["PROMPTMISTRESS_VAULT"]=try NativeImportPreferences.load(file:data.appendingPathComponent("preferences.json"),defaultDestination:ArchiveCore.expandHome(vault.path)).destination
            if let selection,let encoded=try? JSONSerialization.data(withJSONObject:selection),let value=String(data:encoded,encoding:.utf8){environment["PROMPTMISTRESS_SELECTED_INDICES"]=value}
            process.environment=environment
            let output=Pipe();let errors=Pipe();process.standardOutput=output;process.standardError=errors
            process.terminationHandler={ [weak self] finished in
                let errorText=String(data:errors.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
                DispatchQueue.main.async {
                    guard let self else{return}
                    self.fileImportProcess=nil
                    if finished.terminationStatus==0 {self.refresh()}
                    else {self.status.stringValue="Import impossible : \(errorText.prefix(300))"}
                    self.refreshImportSummary()
                    if self.manualRefreshPending {self.syncLocal()}
                }
            }
            try process.run();fileImportProcess=process
            status.stringValue="Import du fichier \(file.lastPathComponent)…"
        }catch{status.stringValue="Import impossible : \(error)"}
    }
    @objc private func refresh(){
        generation += 1;let current=generation;status.stringValue="Lecture des sources…";detail.string=""
        scanProgress.isHidden=false;scanProgress.isIndeterminate=true;scanProgress.startAnimation(nil)
        let config=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives/sources.json").path
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result{try NativeWorkspace.load(configPath:config){source,done,total in
                DispatchQueue.main.async {
                    guard self.generation==current else{return}
                    self.scanProgress.isIndeterminate=false;self.scanProgress.maxValue=Double(max(1,total));self.scanProgress.doubleValue=Double(done)
                    self.status.stringValue="Scan · \(source) · \(done*100/max(1,total)) %"
                }
            }}
            DispatchQueue.main.async {
                guard self.generation==current else{return}
                self.scanProgress.stopAnimation(nil);self.scanProgress.isHidden=true
                switch result {
                case .success(let workspace):
                    self.workspace=workspace;self.ruleResults=[:];self.textSearchSignature=""
                    self.checkedKeys.formIntersection(Set(workspace.rows.map{ArchiveCore.string($0["key"])}))
                    if !self.initialDividerPlaced {
                        self.window.contentView?.layoutSubtreeIfNeeded()
                        let width=self.mainSplit.bounds.width
                        let preferred=self.displaySettings.listWidth < 600 ? width-430 : self.displaySettings.listWidth
                        self.mainSplit.setPosition(max(580,min(preferred,width-430)),ofDividerAt:0)
                        self.librarySplit.setPosition(self.displaySettings.explorer ? self.displaySettings.explorerHeight : 0,ofDividerAt:0)
                        self.initialDividerPlaced=true
                    }
                    let providers=Array(Set(workspace.rows.map{ArchiveCore.string($0["provider"])}.filter{!$0.isEmpty})).sorted()
                    self.quickProvider.removeAllItems();self.quickProvider.addItems(withTitles:["Toutes sources"]+providers)
                    self.syncQuickFilters();self.rebuildExplorer();self.filterRows();self.evaluateRules()
                    let errors=(workspace.summary["errors"] as? [[String:String]])?.count ?? 0
                    self.status.stringValue="\(workspace.rows.count) entrées · \(errors) erreur\(errors>1 ? "s" : "") de source"
                case .failure(let error):self.status.stringValue="Lecture impossible : \(error)"
                }
            }
        }
    }
    func controlTextDidChange(_ obj:Notification){filterRows()}
    private func applyDisplaySettings(){
        guard detail != nil,librarySplit != nil else{return}
        detail.font=NSFont.monospacedSystemFont(ofSize:CGFloat(max(10,min(24,displaySettings.textSize))),weight:.regular)
        table.rowHeight=displaySettings.rowDensity == "compact" ? 34 : displaySettings.rowDensity == "spacious" ? 56 : 44
        for column in table.tableColumns {
            let id=column.identifier.rawValue
            column.isHidden = id != "pick" && !displaySettings.showsColumn(id)
            if let width=displaySettings.widths?[id] {column.width=CGFloat(max(60,min(900,width)))}
        }
        explorer.isHidden = !displaySettings.explorer
        librarySplit.adjustSubviews()
        if !displaySettings.explorer {librarySplit.setPosition(0,ofDividerAt:0)}
        else {librarySplit.setPosition(CGFloat(displaySettings.explorerHeight),ofDividerAt:0)}
        syncDisplayMenu()
        filterRows()
    }
    private func syncDisplayMenu(){
        guard displayMenu != nil else{return}
        let sizeTag=["both":200,"lines":201,"kilobytes":202,"hidden":203][displaySettings.sizeMode ?? "both"] ?? 200
        let densityTag=["compact":210,"normal":211,"spacious":212][displaySettings.rowDensity ?? "normal"] ?? 211
        let thresholdTag=[0:240,200:241,512:242,1024:243,2048:244][displaySettings.minPromptBytes ?? 200]
        let columns=[230:"date",231:"provider",232:"project",233:"status",234:"source",
                     260:"size",261:"lines",262:"tags",263:"folders",264:"priority",265:"versions",266:"kind",
                     267:"note",268:"identity",269:"url"]
        for item in displayMenu.menu?.items ?? [] {
            let checked:Bool
            switch item.tag {
            case 200...203:checked=item.tag == sizeTag
            case 210...212:checked=item.tag == densityTag
            case 220:checked=displaySettings.explorer
            case 221:checked=displaySettings.tags
            case 222:checked=displaySettings.variants
            case 230...234,260...269:checked=displaySettings.showsColumn(columns[item.tag] ?? "")
            case 240...244:checked=item.tag == thresholdTag
            default:continue
            }
            item.state=checked ? .on : .off
        }
    }
    @objc private func changeDisplayOption(_ item:NSMenuItem){
        switch item.tag {
        case 200...203:displaySettings.sizeMode=["both","lines","kilobytes","hidden"][item.tag-200]
        case 210...212:displaySettings.rowDensity=["compact","normal","spacious"][item.tag-210]
        case 220:displaySettings.explorer.toggle()
        case 221:displaySettings.tags.toggle()
        case 222:displaySettings.variants.toggle()
        case 230...234,260...269:
            let ids=[230:"date",231:"provider",232:"project",233:"status",234:"source",
                     260:"size",261:"lines",262:"tags",263:"folders",264:"priority",265:"versions",266:"kind",
                     267:"note",268:"identity",269:"url"]
            guard let id=ids[item.tag] else{return}
            var columns=displaySettings.columns ?? [:]
            columns[id] = !displaySettings.showsColumn(id)
            displaySettings.columns=columns
        case 240...244:displaySettings.minPromptBytes=[0,200,512,1024,2048][item.tag-240]
        default:return
        }
        displaySettings.save();applyDisplaySettings()
    }
    @objc private func tableColumnResized(_ notification:Notification){
        guard let table else{return}
        var widths=displaySettings.widths ?? [:]
        for column in table.tableColumns {widths[column.identifier.rawValue]=Double(column.width)}
        displaySettings.widths=widths
        displaySettings.save()
    }
    func tableView(_ tableView:NSTableView,sortDescriptorsDidChange oldDescriptors:[NSSortDescriptor]){
        guard let descriptor=tableView.sortDescriptors.first,let key=descriptor.key else{return}
        switch key {
        case "date":sortOrder=descriptor.ascending ? "Ancien" : "Récent"
        case "title":sortOrder=descriptor.ascending ? "Titre" : "Titre Z–A"
        case "provider":sortOrder="Plateforme"
        case "project":sortOrder="Projet"
        default:return
        }
        filterRows()
    }
    @objc private func editDisplay(){
        let alert=NSAlert();alert.messageText="Affichage de la bibliothèque";alert.addButton(withTitle:"Enregistrer");alert.addButton(withTitle:"Annuler")
        let panel=NSView(frame:NSRect(x:0,y:0,width:390,height:680))
        let offset:CGFloat=250
        func checkbox(_ title:String,_ value:Bool,_ y:CGFloat)->NSButton {
            let button=NSButton(checkboxWithTitle:title,target:nil,action:nil);button.frame=NSRect(x:0,y:y+offset,width:380,height:25);button.state=value ? .on : .off;panel.addSubview(button);return button
        }
        let explorerCheck=checkbox("Explorateur",displaySettings.explorer,395)
        let tagsCheck=checkbox("Tags dans les lignes",displaySettings.tags,365)
        let variantsCheck=checkbox("Nombre de variantes dans les lignes",displaySettings.variants,335)
        let countsCheck=checkbox("Compteurs de résultats",displaySettings.counts,305)
        let fontLabel=NSTextField(labelWithString:"Taille du texte");fontLabel.frame=NSRect(x:0,y:270+offset,width:130,height:24);panel.addSubview(fontLabel)
        let font=NSTextField(frame:NSRect(x:145,y:270+offset,width:80,height:25));font.stringValue=String(Int(displaySettings.textSize));panel.addSubview(font)
        let colorLabel=NSTextField(labelWithString:"Couleurs des projets");colorLabel.frame=NSRect(x:0,y:235+offset,width:140,height:24);panel.addSubview(colorLabel)
        let projectMode=NSPopUpButton(frame:NSRect(x:145,y:235+offset,width:245,height:26));projectMode.addItems(withTitles:["Automatique par projet","Neutre","Couleur de la fiche"])
        projectMode.selectItem(at:["auto","neutral","manual"].firstIndex(of:displaySettings.projectColorMode ?? "auto") ?? 0);panel.addSubview(projectMode)
        let hint=NSTextField(labelWithString:"Glisse les séparateurs du tableau pour ajuster les largeurs.");hint.frame=NSRect(x:0,y:200+offset,width:390,height:22);hint.textColor = .secondaryLabelColor;panel.addSubview(hint)
        let columnsLabel=NSTextField(labelWithString:"Colonnes de la bibliothèque");columnsLabel.font = .boldSystemFont(ofSize:12);columnsLabel.frame=NSRect(x:0,y:173+offset,width:250,height:22);panel.addSubview(columnsLabel)
        let widthLabel=NSTextField(labelWithString:"Largeur");widthLabel.frame=NSRect(x:290,y:173+offset,width:80,height:22);panel.addSubview(widthLabel)
        var columnControls:[(id:String,show:NSButton,width:NSTextField)]=[]
        for (index,specification) in libraryColumns.enumerated() {
            let y=CGFloat(145-index*25)+offset
            let show=NSButton(checkboxWithTitle:specification.title,target:nil,action:nil)
            show.frame=NSRect(x:0,y:y,width:245,height:23)
            show.state=displaySettings.showsColumn(specification.id) ? .on : .off
            show.isEnabled=specification.id != "title"
            panel.addSubview(show)
            let width=NSTextField(frame:NSRect(x:290,y:y,width:80,height:23))
            width.stringValue=String(Int(displaySettings.widths?[specification.id] ?? Double(specification.width)))
            panel.addSubview(width)
            columnControls.append((specification.id,show,width))
        }
        let scroll=NSScrollView(frame:NSRect(x:0,y:0,width:420,height:500));scroll.documentView=panel;scroll.hasVerticalScroller=true
        scroll.contentView.scroll(to:NSPoint(x:0,y:180));scroll.reflectScrolledClipView(scroll.contentView)
        alert.accessoryView=scroll
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        displaySettings.explorer=explorerCheck.state == .on;displaySettings.tags=tagsCheck.state == .on
        displaySettings.variants=variantsCheck.state == .on;displaySettings.counts=countsCheck.state == .on
        displaySettings.projectColorMode=["auto","neutral","manual"][max(0,projectMode.indexOfSelectedItem)]
        displaySettings.textSize=Double(font.stringValue) ?? 13
        var columns=displaySettings.columns ?? [:],widths=displaySettings.widths ?? [:]
        for control in columnControls {
            columns[control.id]=control.id == "title" || control.show.state == .on
            widths[control.id]=max(60,min(900,Double(control.width.stringValue) ?? 100))
        }
        displaySettings.columns=columns;displaySettings.widths=widths
        displaySettings.listWidth=Double(mainSplit.subviews.first?.frame.width ?? 430)
        if displaySettings.explorer {displaySettings.explorerHeight=Double(librarySplit.subviews.first?.frame.width ?? 215)}
        displaySettings.save();applyDisplaySettings();status.stringValue="Affichage enregistré."
    }
    func outlineView(_ outlineView:NSOutlineView,numberOfChildrenOfItem item:Any?)->Int {
        (item as? ExplorerNode)?.children.count ?? explorerNodes.count
    }
    func outlineView(_ outlineView:NSOutlineView,child index:Int,ofItem item:Any?)->Any {
        ((item as? ExplorerNode)?.children ?? explorerNodes)[index]
    }
    func outlineView(_ outlineView:NSOutlineView,isItemExpandable item:Any)->Bool {
        !((item as? ExplorerNode)?.children.isEmpty ?? true)
    }
    func outlineView(_ outlineView:NSOutlineView,viewFor tableColumn:NSTableColumn?,item:Any)->NSView? {
        guard let node=item as? ExplorerNode else{return nil}
        let cell=NSTableCellView();let label=NSTextField(labelWithString:node.title)
        if node.id.hasPrefix("provider:") {label.textColor=providerColor(String(node.id.dropFirst(9)))}
        else if node.id.hasPrefix("project:") {label.textColor=projectBadgeColor(String(node.id.dropFirst(8)),annotation:[:])}
        else if node.id.hasPrefix("tag:") {label.textColor=tagColor(String(node.id.dropFirst(4)))}
        label.lineBreakMode = .byTruncatingMiddle
        label.font=NSFont.systemFont(ofSize:12,weight:node.children.isEmpty ? .regular : .semibold)
        label.translatesAutoresizingMaskIntoConstraints=false;cell.addSubview(label)
        NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo:cell.leadingAnchor,constant:3),label.trailingAnchor.constraint(equalTo:cell.trailingAnchor,constant:-4),label.centerYAnchor.constraint(equalTo:cell.centerYAnchor)])
        return cell
    }
    func outlineViewSelectionDidChange(_ notification:Notification){
        guard explorer.selectedRow >= 0,let node=explorer.item(atRow:explorer.selectedRow) as? ExplorerNode else{return}
        switch node.id {
        case "all":providerFilter="Toutes";sourceFilter="Toutes";projectFilter="Tous";tagFilter="";folderFilter=""
        case let value where value.hasPrefix("provider:"):providerFilter=String(value.dropFirst(9));sourceFilter="Toutes";projectFilter="Tous";tagFilter="";folderFilter=""
        case let value where value.hasPrefix("source:"):sourceFilter=String(value.dropFirst(7));providerFilter="Toutes";projectFilter="Tous";tagFilter="";folderFilter=""
        case let value where value.hasPrefix("project:"):projectFilter=String(value.dropFirst(8));providerFilter="Toutes";sourceFilter="Toutes";tagFilter="";folderFilter=""
        case let value where value.hasPrefix("folder:"):folderFilter=String(value.dropFirst(7));providerFilter="Toutes";sourceFilter="Toutes";projectFilter="Tous";tagFilter=""
        case let value where value.hasPrefix("tag:"):tagFilter=String(value.dropFirst(4));providerFilter="Toutes";sourceFilter="Toutes";projectFilter="Tous";folderFilter=""
        default:return
        }
        filterRows()
    }
    private func filterRows(){
        guard let workspace else{return}
        let previouslySelected=Set(selectedKeys)
        let query=search.stringValue.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current)
        if query.isEmpty {
            pendingTextSearch?.cancel()
            textSearchGeneration += 1;textSearchSignature=""
            booleanGeneration += 1;booleanSignature=""
        }
        if booleanMode && !query.isEmpty {evaluateBoolean(search.stringValue,workspace:workspace)}
        else if searchText && !query.isEmpty {evaluateFullText(query,workspace:workspace)}
        visible=workspace.rows.filter { row in
            let key=ArchiveCore.string(row["key"])
            let annotation=annotation(for:row)
            let visibility=ArchiveCore.string(annotation["visibility"])
            if visibilityFilter == "Actifs" && ["hidden","archived"].contains(visibility) { return false }
            if visibilityFilter == "Masqués" && visibility != "hidden" { return false }
            if visibilityFilter == "Archives" && visibility != "archived" { return false }
            if kindFilter != "Tout" && ArchiveCore.string(row["kind"]) != (kindFilter == "Prompts" ? "prompt" : "chat") { return false }
            if ArchiveCore.string(row["kind"]) == "prompt",let size=workspace.contentSizes[key],size.bytes < (displaySettings.minPromptBytes ?? 200) {return false}
            if providerFilter != "Toutes" && ArchiveCore.string(row["provider"]) != providerFilter { return false }
            if sourceFilter != "Toutes" && !((row["variants"] as? [[String:Any]] ?? []).contains{ArchiveCore.string($0["source"]) == sourceFilter}) {return false}
            if projectFilter != "Tous" && effectiveProject(row,annotation:annotation) != projectFilter {return false}
            if contentOnly && row["hasContent"] as? Bool != true {return false}
            if duplicatesOnly && (row["copies"] as? Int ?? 1) <= 1 {return false}
            if !tagFilter.isEmpty && !((annotation["tags"] as? [String]) ?? []).contains(tagFilter) {return false}
            if !folderFilter.isEmpty && !((annotation["folders"] as? [String]) ?? []).contains(where:{$0 == folderFilter || $0.hasPrefix(folderFilter+"/")}) {return false}
            if !statusFilter.isEmpty && !ArchiveCore.string(annotation["status"]).localizedCaseInsensitiveContains(statusFilter) {return false}
            let updated=ArchiveCore.string(row["updated"])
            if !dateFrom.isEmpty && updated.prefix(10) < dateFrom {return false}
            if !dateTo.isEmpty && updated.prefix(10) > dateTo {return false}
            guard !query.isEmpty else { return true }
            if booleanMode {return booleanHits.contains(key)}
            let fields=["title","project","provider","identity"].map { ArchiveCore.string(row[$0]) } + [effectiveProject(row,annotation:annotation),effectiveTitle(row,annotation:annotation)]
                + ["tags","folders","note","status","priority"].map { annotationText(annotation[$0]) }
            if fields.contains(where:{ $0.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:.current).contains(query) }) { return true }
            if searchText && textHits.contains(key) {return true}
            return false
        }
        visible.sort { a,b in
            let field=["Titre","Titre Z–A"].contains(sortOrder) ? "title" : sortOrder == "Projet" ? "project" : sortOrder == "Plateforme" ? "provider" : "updated"
            let left=field == "project" ? effectiveProject(a) : field == "title" ? effectiveTitle(a) : ArchiveCore.string(a[field])
            let right=field == "project" ? effectiveProject(b) : field == "title" ? effectiveTitle(b) : ArchiveCore.string(b[field])
            return ["Récent","Titre Z–A"].contains(sortOrder) ? left > right : left.localizedCompare(right) == .orderedAscending
        }
        table.reloadData()
        updateCheckSummary()
        let indexes=IndexSet(visible.indices.filter{previouslySelected.contains(ArchiveCore.string(visible[$0]["key"]))})
        if !indexes.isEmpty {table.selectRowIndexes(indexes,byExtendingSelection:false)}
        else if let key=selectedKey,let index=visible.firstIndex(where:{ArchiveCore.string($0["key"])==key}) {table.selectRowIndexes(IndexSet(integer:index),byExtendingSelection:false)}
        syncQuickFilters()
        var active:[String]=[]
        if kindFilter != "Conversations" {active.append(kindFilter)}
        if kindFilter != "Conversations" && (displaySettings.minPromptBytes ?? 200) > 0 {active.append("prompts ≥ \(displaySettings.minPromptBytes ?? 200) o")}
        if providerFilter != "Toutes" {active.append(providerFilter)}
        if projectFilter != "Tous" {active.append(projectFilter)}
        if sourceFilter != "Toutes" {active.append(sourceFilter)}
        if !tagFilter.isEmpty {active.append("#"+tagFilter)}
        if !folderFilter.isEmpty {active.append(folderFilter)}
        if visibilityFilter != "Actifs" {active.append(visibilityFilter.lowercased())}
        if !query.isEmpty {active.append("recherche")}
        let promptTotal=workspace.rows.filter{ArchiveCore.string($0["kind"]) == "prompt"}.count
        let resultLabel=kindFilter == "Conversations" ? "\(visible.count) chats · \(promptTotal) prompts conservés" :
            kindFilter == "Prompts" ? "\(visible.count) prompts visibles sur \(promptTotal) conservés" : "\(visible.count) résultat(s)"
        filterSummary.stringValue=resultLabel+(active.isEmpty ? " · actifs" : " · "+active.joined(separator:" · "))
        clearFilterButton.isHidden=active.isEmpty && visibilityFilter == "Actifs" && !contentOnly && !duplicatesOnly && !booleanMode && statusFilter.isEmpty && dateFrom.isEmpty && dateTo.isEmpty
    }
    func numberOfRows(in tableView:NSTableView)->Int{visible.count}
    func tableView(_ tableView:NSTableView,viewFor tableColumn:NSTableColumn?,row:Int)->NSView?{
        guard visible.indices.contains(row) else{return nil}
        let item=visible[row];let annotation=annotation(for:item)
        let column=tableColumn?.identifier.rawValue ?? "title"
        if column == "pick" {
            let identifier=NSUserInterfaceItemIdentifier("library-pick")
            let cell=(tableView.makeView(withIdentifier:identifier,owner:self) as? NSTableCellView) ?? NSTableCellView()
            let button:NSButton
            if let existing=cell.subviews.compactMap({$0 as? NSButton}).first {button=existing}
            else {
                button=NSButton(checkboxWithTitle:"",target:self,action:#selector(toggleChecked(_:)))
                button.translatesAutoresizingMaskIntoConstraints=false;cell.addSubview(button)
                NSLayoutConstraint.activate([button.centerXAnchor.constraint(equalTo:cell.centerXAnchor),button.centerYAnchor.constraint(equalTo:cell.centerYAnchor)])
            }
            button.tag=row;button.state=checkedKeys.contains(ArchiveCore.string(item["key"])) ? .on : .off
            button.setAccessibilityLabel("Cocher « \(effectiveTitle(item,annotation:annotation)) » pour le lot")
            cell.identifier=identifier
            return cell
        }
        if column != "title" {
            let value:String
            let color:NSColor
            switch column {
            case "date":
                let raw=ArchiveCore.string(item["updated"])
                if let date=ISO8601DateFormatter().date(from:raw) {
                    value=DateFormatter.localizedString(from:date,dateStyle:.short,timeStyle:.none)
                }else{value=raw.isEmpty ? "—" : String(raw.prefix(10))}
                color = .secondaryLabelColor
            case "provider":
                value=ArchiveCore.string(item["provider"])
                color=providerColor(value)
            case "project":
                value=effectiveProject(item,annotation:annotation)
                color=projectBadgeColor(value,annotation:annotation)
            case "status":
                let visibility=ArchiveCore.string(annotation["visibility"])
                value=visibility == "archived" ? "Archivé" : visibility == "hidden" ? "Masqué" : ArchiveCore.string(annotation["status"])
                color=statusColor(value)
            case "source":
                value=(item["variants"] as? [[String:Any]])?.first.map{ArchiveCore.string($0["source"])} ?? ""
                color = .secondaryLabelColor
            case "size":
                if let bytes=workspace?.contentSizes[ArchiveCore.string(item["key"])]?.bytes {
                    value=String(format:"%.1f",Double(bytes)/1024).replacingOccurrences(of:".",with:",") + " Ko"
                } else {value=""}
                color = .secondaryLabelColor
            case "lines":
                value=workspace?.contentSizes[ArchiveCore.string(item["key"])].map{String($0.lines)} ?? ""
                color = .secondaryLabelColor
            case "tags":
                value=(annotation["tags"] as? [String] ?? []).joined(separator:", ")
                color = tagColor((annotation["tags"] as? [String])?.first ?? "")
            case "folders":
                value=(annotation["folders"] as? [String] ?? []).joined(separator:", ")
                color = .secondaryLabelColor
            case "priority":
                value=ArchiveCore.string(annotation["priority"])
                color = statusColor(value)
            case "versions":
                value=String((item["variants"] as? [[String:Any]])?.count ?? 1)
                color = .secondaryLabelColor
            case "kind":
                value=ArchiveCore.string(item["kind"]) == "prompt" ? "Prompt" : "Chat"
                color = .secondaryLabelColor
            case "note":
                value=ArchiveCore.string(annotation["note"])
                color = .secondaryLabelColor
            case "identity":
                value=ArchiveCore.string(item["identity"])
                color = .secondaryLabelColor
            case "url":
                value=(item["variants"] as? [[String:Any]])?.first.map{ArchiveCore.string($0["sourceURL"])} ?? ""
                color = .secondaryLabelColor
            default:value="";color = .secondaryLabelColor
            }
            let identifier=NSUserInterfaceItemIdentifier("library-"+column)
            let cell=(tableView.makeView(withIdentifier:identifier,owner:self) as? NSTableCellView) ?? NSTableCellView()
            let label:NSTextField
            if let existing=cell.textField {label=existing}
            else {
                label=NSTextField(labelWithString:"");label.translatesAutoresizingMaskIntoConstraints=false;cell.addSubview(label);cell.textField=label
                NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo:cell.leadingAnchor,constant:6),label.trailingAnchor.constraint(equalTo:cell.trailingAnchor,constant:-5),label.centerYAnchor.constraint(equalTo:cell.centerYAnchor)])
            }
            cell.identifier=identifier
            label.stringValue=value.isEmpty ? "—" : value
            label.textColor=color;label.lineBreakMode = .byTruncatingMiddle
            label.font=NSFont.systemFont(ofSize:12,weight:column == "provider" || column == "project" ? .semibold : .regular)
            return cell
        }
        let identifier=NSUserInterfaceItemIdentifier("library-title")
        let cell=(tableView.makeView(withIdentifier:identifier,owner:self) as? LibraryTitleCell) ?? LibraryTitleCell(frame:.zero)
        cell.identifier=identifier
        let compact=displaySettings.rowDensity == "compact"
        cell.primaryTop.constant=compact ? 2 : 5
        cell.secondaryGap.constant=compact ? 0 : 2
        cell.primary.font=NSFont.systemFont(ofSize:compact ? 12.5 : 14,weight:.medium)
        let project=effectiveProject(item,annotation:annotation)
        let accent=annotationColor(ArchiveCore.string(annotation["color"])) ?? (project.isEmpty ? providerColor(ArchiveCore.string(item["provider"])) : projectBadgeColor(project,annotation:annotation))
        cell.stripe.layer?.backgroundColor=accent.cgColor
        cell.primary.stringValue=effectiveTitle(item,annotation:annotation);cell.primary.textColor=rgb(0x59c9ec)
        cell.secondary.attributedStringValue=rowSubtitle(item,annotation:annotation)
        return cell
    }
    func tableViewSelectionDidChange(_ notification:Notification){
        retainInspectorDraft()
        guard visible.indices.contains(table.selectedRow) else{
            selectedKey=nil
            variants.removeAllItems();variants.addItem(withTitle:"Sélectionnez une fiche");variants.isEnabled=false
            detail.string="Sélectionnez une conversation ou un prompt pour lire son contenu."
            loadInspectorFiche()
            return
        }
        let row=visible[table.selectedRow];selectedKey=ArchiveCore.string(row["key"])
        selectedExcerpt=nil;selectedExcerptKey=nil
        let count=(row["variants"] as? [[String:Any]])?.count ?? 1
        variants.removeAllItems();for i in 0..<count{variants.addItem(withTitle:"Version \(i+1) / \(count)")};variants.isEnabled=true
        showSelectedDetail()
        loadInspectorFiche()
    }
    @objc private func showSelectedDetail(){
        guard let key=selectedKey,let workspace else{return}
        selectedExcerpt=nil;selectedExcerptKey=nil
        do {
            let value=try workspace.detail(key:key,variant:max(0,variants.indexOfSelectedItem))
            let text=ArchiveCore.string(value?["text"])
            if readerMode == "source" {
                detail.string=text
                applyHighlights()
            } else {
                let messages=value?["messages"] as? [[String:String]] ?? []
                let kind=ArchiveCore.string(workspace.rows.first(where:{ArchiveCore.string($0["key"])==key})?["kind"])
                let rendered=NativeChatReader.render(messages:messages,kind:kind,mode:readerMode)
                detail.string=rendered.isEmpty ? stripFrontmatter(text) : rendered
                detail.font=NSFont.systemFont(ofSize:CGFloat(max(10,min(24,displaySettings.textSize))),weight:.regular)
                styleChatTurns()
            }
            syncReaderMenu()
        }catch{detail.string="Détail indisponible : \(error)"}
    }
    private func stripFrontmatter(_ text:String) -> String {
        guard let range=text.range(of:#"^---\r?\n[\s\S]*?\r?\n---\r?\n"#,options:.regularExpression) else{return text}
        var body=text;body.removeSubrange(range);return body.trimmingCharacters(in:.whitespacesAndNewlines)
    }
    private func styleChatTurns(){
        guard let storage=detail.textStorage else{return}
        let body=detail.string as NSString
        let pattern=#"(?m)^(QUESTION(?: \d+)? · [^\n]+|RÉPONSE \d+|CONTEXTE SYSTÈME|OUTIL)$"#
        guard let regex=try? NSRegularExpression(pattern:pattern) else{return}
        for match in regex.matches(in:detail.string,range:NSRange(location:0,length:body.length)) {
            let heading=body.substring(with:match.range)
            let color:NSColor=heading.hasPrefix("QUESTION") ? .systemOrange : heading.hasPrefix("RÉPONSE") ? .systemBlue : .secondaryLabelColor
            storage.addAttributes([.font:NSFont.systemFont(ofSize:CGFloat(max(10,min(24,displaySettings.textSize))),weight:.bold),.foregroundColor:color],range:match.range)
        }
    }
    private func syncReaderMenu(){
        guard readerMenu != nil else{return}
        for item in readerMenu.menu?.items ?? [] where (100...103).contains(item.tag) {
            item.state = item.tag == 100 + (NativeChatReader.modes.firstIndex(of:readerMode) ?? 0) ? .on : .off
        }
    }
    @objc private func changeReaderMode(_ sender:NSMenuItem){
        let index=sender.tag-100
        guard NativeChatReader.modes.indices.contains(index) else{return}
        displaySettings.chatViewMode=NativeChatReader.modes[index]
        displaySettings.save();showSelectedDetail();syncReaderMenu()
    }
    @objc private func changeReaderSize(_ sender:NSMenuItem){
        let delta:Double=sender.tag == 110 ? -1 : 1
        displaySettings.textSize=max(10,min(24,displaySettings.textSize+delta))
        displaySettings.save();showSelectedDetail()
    }
    @objc private func toggleReading(){
        displaySettings.chatViewMode=cleanReading ? "source" : "conversation"
        displaySettings.save();showSelectedDetail();syncReaderMenu()
        status.stringValue=cleanReading ? "Conversation affichée." : "Texte source affiché."
    }
    @objc private func showProvenance(){
        guard let key=selectedKey,let row=workspace?.rows.first(where:{ArchiveCore.string($0["key"])==key}) else{return}
        let variants=row["variants"] as? [[String:Any]] ?? []
        let text=variants.enumerated().map{index,item in
            "Version \(index+1) · \(ArchiveCore.string(item["source"]))\n\(ArchiveCore.string(item["path"]))\n\(ArchiveCore.string(item["sourceURL"]))"
        }.joined(separator:"\n\n")
        let alert=NSAlert();alert.messageText="Provenance";alert.informativeText=text.isEmpty ? "Aucune provenance disponible." : text;alert.runModal()
    }
    @objc private func copyDisplayedText(){
        guard !detail.string.isEmpty else{return}
        NSPasteboard.general.clearContents();NSPasteboard.general.setString(detail.string,forType:.string)
        status.stringValue="Texte copié."
    }
    private func highlightKey() -> String {
        String(max(0,variants.indexOfSelectedItem)) + ":" + ArchiveCore.digest(detail.string)
    }
    private func applyHighlights(){
        guard let key=selectedKey,let storage=detail.textStorage else{return}
        let annotation=annotations?.get(key) ?? [:]
        let ranges=(annotation["highlights"] as? [String:[[String:Any]]])?[highlightKey()] ?? []
        let body=detail.string as NSString
        storage.setAttributes([.font:NSFont.monospacedSystemFont(ofSize:CGFloat(max(10,min(24,displaySettings.textSize))),weight:.regular),.foregroundColor:NSColor.textColor],range:NSRange(location:0,length:body.length))
        for item in ranges {
            guard let start=item["start"] as? Int,let end=item["end"] as? Int,
                  start >= 0,end <= body.length,end > start,
                  body.substring(with:NSRange(location:start,length:end-start)) == ArchiveCore.string(item["text"]) else{continue}
            storage.addAttribute(.backgroundColor,value:NSColor.systemYellow.withAlphaComponent(0.45),range:NSRange(location:start,length:end-start))
        }
    }
    @objc private func highlightSelection(){
        guard let key=selectedKey,var store=annotations else{return}
        guard !cleanReading else{status.stringValue="Passez en texte original pour surligner.";return}
        let range=detail.selectedRange(),body=detail.string as NSString
        guard range.length > 0,NSMaxRange(range) <= body.length else{status.stringValue="Sélectionnez un passage à surligner.";return}
        var annotation=store.get(key)
        var highlights=annotation["highlights"] as? [String:[[String:Any]]] ?? [:]
        let marker=highlightKey(),existing=highlights[marker] ?? []
        guard !existing.contains(where:{item in
            let start=item["start"] as? Int ?? -1,end=item["end"] as? Int ?? -1
            return range.location < end && NSMaxRange(range) > start
        }) else{status.stringValue="Ce passage recoupe un surlignage existant.";return}
        highlights[marker]=existing+[["start":range.location,"end":NSMaxRange(range),"text":body.substring(with:range)]]
        annotation["highlights"]=highlights
        do{try store.set(key,fields:annotation);annotations=store;applyHighlights();status.stringValue="Passage surligné."}
        catch{status.stringValue="Surlignage non enregistré : \(error)"}
    }
    @objc private func clearHighlights(){
        guard let key=selectedKey,var store=annotations else{return}
        guard !cleanReading else{status.stringValue="Passez en texte original pour effacer les surlignages.";return}
        var annotation=store.get(key)
        var highlights=annotation["highlights"] as? [String:[[String:Any]]] ?? [:]
        highlights.removeValue(forKey:highlightKey());annotation["highlights"]=highlights
        do{try store.set(key,fields:annotation);annotations=store;applyHighlights();status.stringValue="Surlignages effacés."}
        catch{status.stringValue="Surlignages conservés : \(error)"}
    }
    private var selectedKeys: [String] {
        table.selectedRowIndexes.compactMap { visible.indices.contains($0) ? ArchiveCore.string(visible[$0]["key"]) : nil }
    }
    @objc private func editFilters(){
        guard let workspace else { return }
        let alert=NSAlert();alert.messageText="Filtres de la bibliothèque";alert.addButton(withTitle:"Appliquer");alert.addButton(withTitle:"Annuler")
        let panel=NSView(frame:NSRect(x:0,y:0,width:420,height:540))
        func popup(_ title:String,_ options:[String],_ selected:String,_ y:CGFloat)->NSPopUpButton {
            let label=NSTextField(labelWithString:title);label.frame=NSRect(x:0,y:y,width:120,height:24);panel.addSubview(label)
            let button=NSPopUpButton(frame:NSRect(x:130,y:y,width:280,height:26));button.addItems(withTitles:options)
            button.selectItem(withTitle:selected);panel.addSubview(button);return button
        }
        let thresholdLabel=NSTextField(labelWithString:"Prompts min. (Ko)")
        thresholdLabel.frame=NSRect(x:0,y:505,width:125,height:24);panel.addSubview(thresholdLabel)
        let threshold=NSTextField(frame:NSRect(x:130,y:505,width:280,height:26))
        threshold.stringValue=String(format:"%.1f",Double(displaySettings.minPromptBytes ?? 200)/1024).replacingOccurrences(of:".",with:",")
        threshold.placeholderString="0 pour tous les afficher";panel.addSubview(threshold)
        let kind=popup("Type",["Tout","Conversations","Prompts"],kindFilter,465)
        let providers=["Toutes"] + Array(Set(workspace.rows.map{ArchiveCore.string($0["provider"])}.filter{!$0.isEmpty})).sorted()
        let provider=popup("Plateforme",providers,providerFilter,428)
        let projects=["Tous"] + Array(Set(workspace.rows.map{effectiveProject($0)}.filter{!$0.isEmpty})).sorted()
        let project=popup("Projet",projects,projectFilter,391)
        let visibility=popup("Visibilité",["Actifs","Masqués","Archives","Tous"],visibilityFilter,354)
        let sorting=popup("Tri",["Récent","Ancien","Titre","Titre Z–A","Projet","Plateforme"],sortOrder,317)
        func field(_ title:String,_ value:String,_ y:CGFloat)->NSTextField {
            let label=NSTextField(labelWithString:title);label.frame=NSRect(x:0,y:y,width:120,height:24);panel.addSubview(label)
            let input=NSTextField(frame:NSRect(x:130,y:y,width:280,height:26));input.stringValue=value;panel.addSubview(input);return input
        }
        let tag=field("Tag",tagFilter,280)
        let folder=field("Dossier",folderFilter,243)
        let statusInput=field("Statut",statusFilter,206)
        let from=field("Depuis (AAAA-MM-JJ)",dateFrom,169)
        let until=field("Jusqu’au",dateTo,132)
        let boolean=NSButton(checkboxWithTitle:"Utiliser NyxBoolean",target:nil,action:nil)
        boolean.frame=NSRect(x:130,y:106,width:280,height:22);boolean.state=booleanMode ? .on : .off;panel.addSubview(boolean)
        let full=NSButton(checkboxWithTitle:"Chercher aussi dans le texte complet",target:nil,action:nil)
        full.frame=NSRect(x:130,y:78,width:280,height:22);full.state=searchText ? .on : .off;panel.addSubview(full)
        let hasContent=NSButton(checkboxWithTitle:"Avec contenu",target:nil,action:nil);hasContent.frame=NSRect(x:130,y:50,width:280,height:22);hasContent.state=contentOnly ? .on : .off;panel.addSubview(hasContent)
        let duplicates=NSButton(checkboxWithTitle:"Plusieurs versions",target:nil,action:nil);duplicates.frame=NSRect(x:130,y:22,width:280,height:22);duplicates.state=duplicatesOnly ? .on : .off;panel.addSubview(duplicates)
        alert.accessoryView=panel
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        if let kilo=Double(threshold.stringValue.replacingOccurrences(of:",",with:".")),kilo >= 0 {
            displaySettings.minPromptBytes=Int(min(kilo,1024)*1024);displaySettings.save()
        }
        kindFilter=kind.titleOfSelectedItem ?? "Tout";providerFilter=provider.titleOfSelectedItem ?? "Toutes";projectFilter=project.titleOfSelectedItem ?? "Tous"
        visibilityFilter=visibility.titleOfSelectedItem ?? "Actifs";sortOrder=sorting.titleOfSelectedItem ?? "Récent"
        tagFilter=tag.stringValue.trimmingCharacters(in:.whitespaces);folderFilter=folder.stringValue.trimmingCharacters(in:.whitespaces)
        statusFilter=statusInput.stringValue.trimmingCharacters(in:.whitespaces)
        dateFrom=from.stringValue.trimmingCharacters(in:.whitespaces);dateTo=until.stringValue.trimmingCharacters(in:.whitespaces)
        searchText=full.state == .on;fullTextToggle.state=searchText ? .on : .off;booleanMode=boolean.state == .on;contentOnly=hasContent.state == .on;duplicatesOnly=duplicates.state == .on;filterRows()
        status.stringValue="\(visible.count) résultat(s) · filtres appliqués"
    }
    @objc private func editAnnotation(){
        guard let key=selectedKeys.first, var store=annotations else { status.stringValue="Sélectionnez une fiche ; stockage indisponible.";return }
        let old=store.get(key)
        let fields=[("Projet","project"),("Tags","tags"),("Dossiers","folders"),("Note","note"),("Statut","status"),("Priorité","priority"),("Couleur","color")]
        let panel=NSView(frame:NSRect(x:0,y:0,width:480,height:291))
        var inputs:[String:NSTextField]=[:]
        for (index,(label,field)) in fields.enumerated(){
            let y:CGFloat=249-CGFloat(index)*39
            let text=NSTextField(labelWithString:label);text.frame=NSRect(x:0,y:y,width:90,height:25);panel.addSubview(text)
            let input=NSTextField(frame:NSRect(x:95,y:y,width:375,height:27));input.stringValue=drafts?.values[key]?[field] ?? (field == "project" ? effectiveProject(workspace?.rows.first(where:{ArchiveCore.string($0["key"])==key}) ?? [:],annotation:old) : annotationText(old[field]));panel.addSubview(input);inputs[field]=input
        }
        let alert=NSAlert();alert.messageText="Fiche locale";alert.informativeText="Les annotations sont enregistrées dans le coffre V3.";alert.accessoryView=panel
        alert.addButton(withTitle:"Enregistrer");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn else {
            let changed=fields.contains{(_,field) in
                let original=drafts?.values[key]?[field] ?? (field == "project" ? effectiveProject(workspace?.rows.first(where:{ArchiveCore.string($0["key"])==key}) ?? [:],annotation:old) : annotationText(old[field]))
                return inputs[field]?.stringValue != original
            }
            if changed,var store=drafts {
                do {try store.update(key,Dictionary(uniqueKeysWithValues:fields.map{(_,field) in (field,inputs[field]?.stringValue ?? "")}));drafts=store;status.stringValue="Brouillon de fiche conservé."}
                catch {status.stringValue="Brouillon non enregistré : \(error)"}
            }
            return
        }
        var updated=old
        for (_,key) in fields {
            let value=inputs[key]?.stringValue ?? ""
            updated[key]=["tags","folders"].contains(key) ? value.split(separator:",").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty} as Any : value as Any
        }
        updated["_manual"]=["project","tags","folders","note","status","priority","color"]
        do {try store.set(key,fields:updated);annotations=store;if var draftStore=drafts {try draftStore.update(key,nil);drafts=draftStore};evaluateRules();rebuildExplorer();filterRows();status.stringValue="Fiche enregistrée."}
        catch {status.stringValue="Fiche non enregistrée : \(error)"}
    }
    private func updateVisibility(_ value:String){
        let keys=selectedKeys
        guard !keys.isEmpty,var store=annotations else {status.stringValue="Sélectionnez des éléments.";return}
        do {try store.update(keys,field:"visibility",value:value);annotations=store;evaluateRules();filterRows();status.stringValue="\(keys.count) élément(s) mis à jour."}
        catch {status.stringValue="Modification impossible : \(error)"}
    }
    @objc private func hideSelection(){updateVisibility("hidden")}
    @objc private func archiveSelection(){updateVisibility("archived")}
    @objc private func restoreSelection(){updateVisibility("active")}
    private func bulkEdit(_ field:String, title:String, additive:Bool){
        let keys=selectedKeys
        guard !keys.isEmpty,var store=annotations else {status.stringValue="Sélectionnez des éléments.";return}
        let alert=NSAlert();alert.messageText=title;alert.addButton(withTitle:"Appliquer");alert.addButton(withTitle:"Annuler")
        let input=NSTextField(frame:NSRect(x:0,y:0,width:360,height:28));input.placeholderString=additive ? "Séparez les valeurs par des virgules" : "Valeur à appliquer"
        alert.accessoryView=input
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        let value=input.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !value.isEmpty else{return}
        do {
            if additive {try store.addValues(keys,field:field,values:value.split(separator:",").map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty})}
            else {try store.update(keys,field:field,value:value)}
            annotations=store;evaluateRules();filterRows();status.stringValue="\(keys.count) fiche(s) mises à jour."
        }catch{status.stringValue="Modification impossible : \(error)"}
    }
    @objc private func addTags(){bulkEdit("tags",title:"Ajouter des tags",additive:true)}
    @objc private func addFolders(){bulkEdit("folders",title:"Ajouter des dossiers",additive:true)}
    @objc private func setStatus(){bulkEdit("status",title:"Définir le statut",additive:false)}
    @objc private func setPriority(){bulkEdit("priority",title:"Définir la priorité",additive:false)}
    @objc private func setColor(){bulkEdit("color",title:"Définir la couleur (blue, green, yellow, pink)",additive:false)}
    @objc private func migrateV2Annotations(){
        guard var store=annotations else {status.stringValue="Stockage V3 indisponible.";return}
        do {
            let count=try V2StorageMigration.migrate(into:&store)
            if var rules=ruleStore,rules.rules.isEmpty,
               let raw=try V2StorageMigration.read()["promptmistress.workspace.rules.v1"],
               let data=raw.data(using:.utf8),let migrated=try? JSONDecoder().decode([NativeRule].self,from:data) {
                try rules.save(migrated);ruleStore=rules
            }
            if var views=viewStore,views.views.isEmpty,
               let raw=try V2StorageMigration.read()["promptmistress.workspace.views.v1"],
               let data=raw.data(using:.utf8),let migrated=try? JSONSerialization.jsonObject(with:data) as? [String:[String:Any]] {
                try views.save(migrated);viewStore=views
            }
            if var favorites=favoriteStore,favorites.items.isEmpty,
               let raw=try V2StorageMigration.read()["promptmistress.workspace.favoriteTags.v1"],
               let data=raw.data(using:.utf8),let migrated=try? JSONDecoder().decode([NativeFavorite].self,from:data) {
                try favorites.save(migrated);favoriteStore=favorites
            }
            if var draftStore=drafts,let raw=try V2StorageMigration.read()["promptmistress.workspace.annotations.v1.drafts"] {
                _ = try draftStore.mergeV2(raw);drafts=draftStore
            }
            if UserDefaults.standard.data(forKey:"V3DisplaySettings") == nil,
               let raw=try V2StorageMigration.read()["promptmistress.workspace.view.v1"],
               let migrated=NativeDisplaySettings.fromV2(raw) {
                displaySettings=migrated;migrated.save();applyDisplaySettings()
            }
            annotations=store;evaluateRules();filterRows()
            status.stringValue="\(count) fiche(s) V2 reprises · sauvegarde locale créée."
        }catch{status.stringValue="Migration V2 interrompue : \(error)"}
    }
    @objc private func editRules(){
        guard var store=ruleStore else{status.stringValue="Stockage des règles indisponible.";return}
        let alert=NSAlert();alert.messageText="Règles de classement"
        alert.informativeText="Les règles ajoutent automatiquement des tags, dossiers, couleurs, statuts ou priorités. Les fiches manuelles gardent la priorité."
        let popup=NSPopUpButton(frame:NSRect(x:0,y:0,width:440,height:28))
        popup.addItems(withTitles:store.rules.map{$0.name + ($0.enabled ? " · active" : " · inactive")})
        alert.accessoryView=popup
        alert.addButton(withTitle:"Ajouter…");alert.addButton(withTitle:"Activer / désactiver")
        alert.addButton(withTitle:"Supprimer");alert.addButton(withTitle:"Fermer")
        let choice=alert.runModal()
        if choice == .alertFirstButtonReturn {createRule();return}
        let index=popup.indexOfSelectedItem
        guard store.rules.indices.contains(index) else{return}
        var rules=store.rules
        if choice == .alertSecondButtonReturn {rules[index].enabled.toggle()}
        else if choice == .alertThirdButtonReturn {rules.remove(at:index)}
        else{return}
        do{try store.save(rules);ruleStore=store;evaluateRules();status.stringValue="Règles mises à jour."}
        catch{status.stringValue="Règle non enregistrée : \(error)"}
    }
    private func chooseRule(title:String) -> Int? {
        guard let rules=ruleStore?.rules,!rules.isEmpty else{status.stringValue="Aucune règle enregistrée.";return nil}
        let alert=NSAlert();alert.messageText=title;alert.addButton(withTitle:"Continuer");alert.addButton(withTitle:"Annuler")
        let popup=NSPopUpButton(frame:NSRect(x:0,y:0,width:380,height:28));popup.addItems(withTitles:rules.map{$0.name});alert.accessoryView=popup
        guard alert.runModal() == .alertFirstButtonReturn else{return nil}
        return popup.indexOfSelectedItem
    }
    @objc private func modifyRule(){guard let index=chooseRule(title:"Modifier une règle") else{return};createRule(existingIndex:index)}
    @objc private func reorderRule(){
        guard let index=chooseRule(title:"Réordonner les règles"),var store=ruleStore else{return}
        let alert=NSAlert();alert.messageText="Déplacer « \(store.rules[index].name) »"
        alert.addButton(withTitle:"Monter");alert.addButton(withTitle:"Descendre");alert.addButton(withTitle:"Annuler")
        let choice=alert.runModal(),target=choice == .alertFirstButtonReturn ? index-1 : choice == .alertSecondButtonReturn ? index+1 : index
        guard store.rules.indices.contains(target),target != index else{return}
        var next=store.rules;next.swapAt(index,target)
        do{try store.save(next);ruleStore=store;evaluateRules();status.stringValue="Ordre des règles mis à jour."}
        catch{status.stringValue="Réorganisation impossible : \(error)"}
    }
    @objc private func importRules(){
        guard var store=ruleStore else{return}
        let panel=NSOpenPanel();panel.allowedContentTypes=[UTType.json];panel.allowsMultipleSelection=false
        guard panel.runModal() == .OK,let file=panel.url else{return}
        do {
            let imported=try JSONDecoder().decode([NativeRule].self,from:Data(contentsOf:file))
            let disabled=imported.map{rule in var copy=rule;copy.id=UUID().uuidString;copy.enabled=false;return copy}
            try store.save(store.rules+disabled);ruleStore=store;status.stringValue="\(disabled.count) règle(s) importée(s), désactivée(s)."
        }catch{status.stringValue="Import des règles impossible : \(error)"}
    }
    @objc private func exportRules(){
        guard let rules=ruleStore?.rules else{return}
        let panel=NSSavePanel();panel.nameFieldStringValue="PromptMistress-regles.json"
        guard panel.runModal() == .OK,let target=panel.url else{return}
        do{try JSONEncoder().encode(rules).write(to:target,options:.atomic);status.stringValue="Règles exportées."}
        catch{status.stringValue="Export des règles impossible : \(error)"}
    }
    private func createRule(existingIndex:Int?=nil){
        guard var store=ruleStore else{return}
        let panel=NSView(frame:NSRect(x:0,y:0,width:470,height:265))
        func field(_ label:String,_ y:CGFloat)->NSTextField {
            let title=NSTextField(labelWithString:label);title.frame=NSRect(x:0,y:y,width:115,height:25);panel.addSubview(title)
            let input=NSTextField(frame:NSRect(x:120,y:y,width:335,height:27));panel.addSubview(input);return input
        }
        func popup(_ label:String,_ options:[String],_ y:CGFloat)->NSPopUpButton {
            let title=NSTextField(labelWithString:label);title.frame=NSRect(x:0,y:y,width:115,height:25);panel.addSubview(title)
            let input=NSPopUpButton(frame:NSRect(x:120,y:y,width:335,height:28));input.addItems(withTitles:options);panel.addSubview(input);return input
        }
        let name=field("Nom",230)
        let condition=popup("Champ",["title","provider","project","kind","tags","text"],193)
        let operation=popup("Condition",["contains","equals","notContains"],156)
        let value=field("Valeur",119)
        let action=popup("Action",["tags","folders","color","status","priority"],82)
        let actionValue=field("Appliquer",45)
        let stop=NSButton(checkboxWithTitle:"Arrêter après cette règle",target:nil,action:nil);stop.frame=NSRect(x:120,y:5,width:300,height:25);panel.addSubview(stop)
        if let index=existingIndex,store.rules.indices.contains(index) {
            let old=store.rules[index]
            name.stringValue=old.name;condition.selectItem(withTitle:old.field);operation.selectItem(withTitle:old.operator)
            value.stringValue=old.value;action.selectItem(withTitle:old.action);actionValue.stringValue=old.actionValue;stop.state=old.stop ? .on : .off
        }
        let alert=NSAlert();alert.messageText=existingIndex == nil ? "Nouvelle règle" : "Modifier la règle";alert.accessoryView=panel
        alert.addButton(withTitle:"Enregistrer");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        guard !value.stringValue.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
              !actionValue.stringValue.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{status.stringValue="Condition et action requises.";return}
        let old=existingIndex.flatMap{store.rules.indices.contains($0) ? store.rules[$0] : nil}
        let rule=NativeRule(id:old?.id ?? UUID().uuidString,name:name.stringValue.isEmpty ? value.stringValue : name.stringValue,enabled:old?.enabled ?? true,
            field:condition.titleOfSelectedItem ?? "title",operator:operation.titleOfSelectedItem ?? "contains",
            value:value.stringValue,action:action.titleOfSelectedItem ?? "tags",actionValue:actionValue.stringValue,stop:stop.state == .on)
        var next=store.rules
        if let index=existingIndex,next.indices.contains(index){next[index]=rule}else{next.append(rule)}
        do{try store.save(next);ruleStore=store;evaluateRules();status.stringValue="Règle enregistrée."}
        catch{status.stringValue="Règle non enregistrée : \(error)"}
    }
    private func currentView() -> [String:Any] {
        ["fields":["search":search.stringValue,"kind":kindFilter == "Tout" ? "" : kindFilter == "Prompts" ? "prompt" : "chat",
                   "provider":providerFilter == "Toutes" ? "" : providerFilter,"project-filter":projectFilter == "Tous" ? "" : projectFilter,"sort":sortOrder,"visibility":visibilityFilter,
                   "date-from":dateFrom,"date-to":dateTo,"filter-status":statusFilter,"full-text":searchText,"has-content":contentOnly,"duplicates":duplicatesOnly,"search-mode":booleanMode ? "boolean" : "simple"],
         "folder":folderFilter,"tag":tagFilter]
    }
    @objc private func editViews(){
        guard var store=viewStore else{status.stringValue="Stockage des vues indisponible.";return}
        let alert=NSAlert();alert.messageText="Vues sauvegardées";alert.informativeText="Enregistrez ou rechargez les filtres actuels."
        let popup=NSPopUpButton(frame:NSRect(x:0,y:0,width:380,height:28));popup.addItems(withTitles:store.views.keys.sorted());alert.accessoryView=popup
        alert.addButton(withTitle:"Enregistrer l’actuelle…");alert.addButton(withTitle:"Charger")
        alert.addButton(withTitle:"Supprimer");alert.addButton(withTitle:"Fermer")
        let choice=alert.runModal()
        if choice == .alertFirstButtonReturn {
            let nameAlert=NSAlert();nameAlert.messageText="Nom de la vue";nameAlert.addButton(withTitle:"Enregistrer");nameAlert.addButton(withTitle:"Annuler")
            let name=NSTextField(frame:NSRect(x:0,y:0,width:320,height:28));nameAlert.accessoryView=name
            guard nameAlert.runModal() == .alertFirstButtonReturn,!name.stringValue.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{return}
            var next=store.views;next[name.stringValue]=currentView()
            do{try store.save(next);viewStore=store;status.stringValue="Vue enregistrée."}
            catch{status.stringValue="Vue non enregistrée : \(error)"}
            return
        }
        guard let selected=popup.titleOfSelectedItem,let view=store.views[selected] else{return}
        if choice == .alertSecondButtonReturn {
            let fields=view["fields"] as? [String:Any] ?? [:]
            search.stringValue=ArchiveCore.string(fields["search"])
            let kind=ArchiveCore.string(fields["kind"]);kindFilter=kind == "prompt" ? "Prompts" : kind == "chat" ? "Conversations" : "Tout"
            let provider=ArchiveCore.string(fields["provider"]);providerFilter=provider.isEmpty ? "Toutes" : provider
            let project=ArchiveCore.string(fields["project-filter"]);projectFilter=project.isEmpty ? "Tous" : project
            let sort=ArchiveCore.string(fields["sort"])
            sortOrder=["Récent","Ancien","Titre","Titre Z–A","Projet","Plateforme"].contains(sort) ? sort : ["date":"Récent","oldest":"Ancien","title":"Titre","title-desc":"Titre Z–A","project":"Projet","provider":"Plateforme"].first(where:{$0.key == sort})?.value ?? "Récent"
            let visibility=ArchiveCore.string(fields["visibility"])
            visibilityFilter=["Actifs","Masqués","Archives","Tous"].contains(visibility) ? visibility : ["active":"Actifs","hidden":"Masqués","archived":"Archives","all":"Tous"].first(where:{$0.key == visibility})?.value ?? "Actifs"
            dateFrom=ArchiveCore.string(fields["date-from"]);dateTo=ArchiveCore.string(fields["date-to"])
            statusFilter=ArchiveCore.string(fields["filter-status"])
            tagFilter=ArchiveCore.string(view["tag"]);folderFilter=ArchiveCore.string(view["folder"])
            searchText=fields["full-text"] as? Bool ?? true
            fullTextToggle.state=searchText ? .on : .off
            contentOnly=fields["has-content"] as? Bool ?? false
            duplicatesOnly=fields["duplicates"] as? Bool ?? false
            booleanMode=ArchiveCore.string(fields["search-mode"]) == "boolean"
            filterRows();status.stringValue="Vue « \(selected) » chargée · \(visible.count) résultat(s)."
        } else if choice == .alertThirdButtonReturn {
            var next=store.views;next.removeValue(forKey:selected)
            do{try store.save(next);viewStore=store;status.stringValue="Vue supprimée."}
            catch{status.stringValue="Suppression impossible : \(error)"}
        }
    }
    @objc private func editFavorites(){
        guard var favorites=favoriteStore else{status.stringValue="Favoris indisponibles.";return}
        let alert=NSAlert();alert.messageText="Tags favoris";alert.informativeText="Choisissez un tag favori à ajouter aux fiches sélectionnées."
        let popup=NSPopUpButton(frame:NSRect(x:0,y:0,width:360,height:28))
        popup.addItems(withTitles:favorites.items.map{$0.tag});alert.accessoryView=popup
        alert.addButton(withTitle:"Ajouter aux fiches");alert.addButton(withTitle:"Nouveau…")
        alert.addButton(withTitle:"Supprimer");alert.addButton(withTitle:"Fermer")
        let choice=alert.runModal(),index=popup.indexOfSelectedItem
        if choice == .alertFirstButtonReturn {
            guard favorites.items.indices.contains(index),var store=annotations,!selectedKeys.isEmpty else{status.stringValue="Sélectionnez une fiche et un tag favori.";return}
            do{try store.addValues(selectedKeys,field:"tags",values:[favorites.items[index].tag]);annotations=store;evaluateRules();status.stringValue="Tag favori ajouté."}
            catch{status.stringValue="Tag non ajouté : \(error)"}
        }else if choice == .alertSecondButtonReturn {
            let add=NSAlert();add.messageText="Nouveau tag favori";add.addButton(withTitle:"Enregistrer");add.addButton(withTitle:"Annuler")
            let panel=NSView(frame:NSRect(x:0,y:0,width:360,height:65))
            let tag=NSTextField(frame:NSRect(x:0,y:35,width:360,height:27));tag.placeholderString="#tag ou @mention";panel.addSubview(tag)
            let color=NSTextField(frame:NSRect(x:0,y:0,width:360,height:27));color.placeholderString="Couleur hexadécimale, par exemple #409cff";panel.addSubview(color)
            add.accessoryView=panel
            guard add.runModal() == .alertFirstButtonReturn else{return}
            let value=tag.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
            guard value.hasPrefix("#") || value.hasPrefix("@") else{status.stringValue="Le tag doit commencer par # ou @.";return}
            let chosen=color.stringValue.range(of:#"^#[0-9a-fA-F]{6}$"#,options:.regularExpression) != nil ? color.stringValue : "#409cff"
            do{try favorites.save(favorites.items+[NativeFavorite(tag:value,color:chosen)]);favoriteStore=favorites;status.stringValue="Tag favori enregistré."}
            catch{status.stringValue="Favori non enregistré : \(error)"}
        }else if choice == .alertThirdButtonReturn,favorites.items.indices.contains(index){
            var next=favorites.items;next.remove(at:index)
            do{try favorites.save(next);favoriteStore=favorites;status.stringValue="Tag favori supprimé."}
            catch{status.stringValue="Suppression impossible : \(error)"}
        }
    }
    @objc private func openSource(){
        guard let key=selectedKeys.first,let row=workspace?.rows.first(where:{ArchiveCore.string($0["key"])==key}) else{return}
        let variants=row["variants"] as? [[String:Any]] ?? []
        let index=max(0,self.variants.indexOfSelectedItem)
        guard variants.indices.contains(index),let url=URL(string:ArchiveCore.string(variants[index]["sourceURL"])),["https","http"].contains(url.scheme?.lowercased() ?? "") else {status.stringValue="Lien source indisponible.";return}
        NSWorkspace.shared.open(url)
    }
    @objc private func showAttachments(){
        guard let key=selectedKeys.first,let workspace,let item=try? workspace.detail(key:key,variant:max(0,variants.indexOfSelectedItem)) else{return}
        let attachments=item["attachments"] as? [[String:Any]] ?? []
        let alert=NSAlert();alert.messageText="Pièces jointes · \(attachments.count)"
        alert.informativeText=attachments.isEmpty ? "Aucune pièce jointe référencée pour cette version." : "Choisissez une pièce jointe disponible à enregistrer."
        let popup=NSPopUpButton(frame:NSRect(x:0,y:0,width:420,height:28))
        popup.addItems(withTitles:attachments.map{ArchiveCore.string($0["name"]) + (ArchiveCore.string($0["status"]) == "downloaded" ? "" : " · indisponible")})
        alert.accessoryView=popup;alert.addButton(withTitle:"Enregistrer…");alert.addButton(withTitle:"Fermer")
        guard alert.runModal() == .alertFirstButtonReturn,attachments.indices.contains(popup.indexOfSelectedItem) else{return}
        let selected=attachments[popup.indexOfSelectedItem]
        guard ArchiveCore.string(selected["status"]) == "downloaded",
              let file=workspace.attachmentFile(hash:ArchiveCore.string(selected["hash"])) else{status.stringValue="Pièce jointe non téléchargée.";return}
        let save=NSSavePanel();save.nameFieldStringValue=ArchiveCore.string(selected["name"])
        guard save.runModal() == .OK,let target=save.url else{return}
        do{try Data(contentsOf:file).write(to:target,options:.atomic);status.stringValue="Pièce jointe enregistrée."}
        catch{status.stringValue="Enregistrement impossible : \(error)"}
    }
    @objc private func compareSelection(){
        let keys=selectedKeys
        guard keys.count == 2,let workspace else {status.stringValue="Sélectionnez exactement deux éléments à comparer.";return}
        do {
            let left=ArchiveCore.string(try workspace.detail(key:keys[0],variant:0)?["text"])
            let right=ArchiveCore.string(try workspace.detail(key:keys[1],variant:0)?["text"])
            let a=left.components(separatedBy:"\n"),b=right.components(separatedBy:"\n")
            let first=(0..<max(a.count,b.count)).first{ $0 >= a.count || $0 >= b.count || a[$0] != b[$0] }
            let alert=NSAlert();alert.messageText="Comparer et fusionner"
            alert.informativeText=first.map{"Première différence à la ligne \($0+1).\nGauche : \(a.count) lignes · Droite : \(b.count) lignes."} ?? "Les deux textes sont identiques."
            let editor=NSTextView(frame:NSRect(x:0,y:0,width:600,height:300))
            editor.string="# Élément 1\n\n" + left + "\n\n---\n\n# Élément 2\n\n" + right
            editor.isEditable=true;editor.font=NSFont.monospacedSystemFont(ofSize:12,weight:.regular)
            let scroll=NSScrollView(frame:NSRect(x:0,y:0,width:600,height:300));scroll.documentView=editor;scroll.hasVerticalScroller=true
            alert.accessoryView=scroll
            alert.addButton(withTitle:"Exporter la fusion…");alert.addButton(withTitle:"Fermer")
            guard alert.runModal() == .alertFirstButtonReturn else{return}
            let panel=NSSavePanel();panel.nameFieldStringValue="PromptMistress-fusion.md"
            guard panel.runModal() == .OK,let target=panel.url else{return}
            try Data(editor.string.utf8).write(to:target,options:.atomic)
            status.stringValue="Fusion exportée."
        }catch{status.stringValue="Comparaison impossible : \(error)"}
    }
    @objc private func openFusionLab(){
        guard let workspace else{status.stringValue="Archives indisponibles.";return}
        let html=Bundle.main.resourceURL!.appendingPathComponent("app/fusion.html")
        guard FileManager.default.fileExists(atPath:html.path) else{status.stringValue="Fusion / Lab absent du paquet V3.";return}
        fusionLab=NativeFusionLab(html:html,archive:workspace.archive)
    }
    @objc private func toggleChecked(_ sender:NSButton){
        guard visible.indices.contains(sender.tag) else{return}
        let key=ArchiveCore.string(visible[sender.tag]["key"])
        if sender.state == .on {checkedKeys.insert(key)} else {checkedKeys.remove(key)}
        updateCheckSummary()
    }
    @objc private func checkVisible(){
        checkedKeys.formUnion(visible.map{ArchiveCore.string($0["key"])})
        table.reloadData();updateCheckSummary()
    }
    @objc private func clearChecks(){checkedKeys.removeAll();table.reloadData();updateCheckSummary()}
    private func updateCheckSummary(){
        guard checkSummary != nil else{return}
        let inView=visible.reduce(0){$0+(checkedKeys.contains(ArchiveCore.string($1["key"])) ? 1 : 0)}
        let outside=checkedKeys.count-inView
        checkSummary.stringValue=checkedKeys.isEmpty ? "0 coché" : outside == 0 ? "\(inView) coché(s) dans cette vue" : "\(checkedKeys.count) cochés · \(inView) dans cette vue · \(outside) hors filtre"
        bulkExportButton.title=activeExport != nil ? "Annuler l’export" : checkedKeys.isEmpty ? "Export groupé…" : "Exporter \(checkedKeys.count) coché(s)…"
    }
    @objc private func exportBulk(){beginExport(preferTableSelection:false)}
    @objc private func exportSelection(){beginExport(preferTableSelection:true)}
    private func beginExport(preferTableSelection:Bool){
        if let token=activeExport {token.cancel();status.stringValue="Annulation de l’export…";return}
        let keys:[String]
        let scope:String
        if !checkedKeys.isEmpty {
            keys=(workspace?.rows ?? []).compactMap { row in
                let key=ArchiveCore.string(row["key"])
                return checkedKeys.contains(key) ? key : nil
            }
            let inView=visible.reduce(0){$0+(checkedKeys.contains(ArchiveCore.string($1["key"])) ? 1 : 0)}
            let chats=workspace?.rows.reduce(0){count,row in count+(checkedKeys.contains(ArchiveCore.string(row["key"])) && ArchiveCore.string(row["kind"]) == "chat" ? 1 : 0)} ?? 0
            scope="\(keys.count) éléments cochés : \(chats) chats, \(keys.count-chats) prompts. \(inView) dans la vue actuelle, \(keys.count-inView) hors filtre."
        } else if preferTableSelection && !selectedKeys.isEmpty {
            keys=selectedKeys;scope="La sélection sera exportée."
        } else {
            keys=visible.map{ArchiveCore.string($0["key"])}
            scope="Tous les \(keys.count) résultats visibles seront exportés."
        }
        guard !keys.isEmpty,let workspace else {status.stringValue="Sélectionnez les éléments à exporter.";return}
        let alert=NSAlert();alert.messageText="Exporter \(keys.count) élément(s)"
        alert.informativeText=scope
        alert.addButton(withTitle:"Continuer");alert.addButton(withTitle:"Annuler")
        let options=NSView(frame:NSRect(x:0,y:0,width:360,height:100))
        let formats=NSPopUpButton(frame:NSRect(x:0,y:70,width:300,height:28));formats.addItems(withTitles:["Markdown","Texte","JSON","ZIP","Corpus complet (ZIP)"]);options.addSubview(formats)
        let modes=NSPopUpButton(frame:NSRect(x:0,y:36,width:300,height:28));modes.addItems(withTitles:["Tout le texte","Questions","Réponses","Texte brut"]);options.addSubview(modes)
        let variants=NSButton(checkboxWithTitle:"Inclure toutes les versions",target:nil,action:nil);variants.frame=NSRect(x:0,y:0,width:330,height:25);options.addSubview(variants)
        alert.accessoryView=options
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        let format:NativeExport.Format = ["Markdown":.markdown,"Texte":.text,"JSON":.json,"ZIP":.zip,"Corpus complet (ZIP)":.corpus][formats.titleOfSelectedItem ?? "Markdown"] ?? .markdown
        let mode:NativeExport.Mode = ["Tout le texte":.all,"Questions":.questions,"Réponses":.answers,"Texte brut":.raw][modes.titleOfSelectedItem ?? "Tout le texte"] ?? .all
        let panel=NSSavePanel();panel.nameFieldStringValue="PromptMistress-export." + (format == .json ? "json" : format == .text ? "txt" : format == .zip || format == .corpus ? "zip" : "md")
        guard panel.runModal() == .OK,let destination=panel.url else{return}
        let savedAnnotations=annotations,includeVariants=variants.state == .on
        let effective=ruleResults
        let titleOverrides=Dictionary(uniqueKeysWithValues:workspace.rows.map{(ArchiveCore.string($0["key"]),effectiveTitle($0))})
        let token=NativeChunkedExport.CancelToken()
        activeExport=token
        bulkExportButton.title="Annuler l’export"
        status.stringValue="Export en cours…"
        let rowLookup=Dictionary(workspace.rows.map{(ArchiveCore.string($0["key"]),$0)},uniquingKeysWith:{first,_ in first})
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result { () throws -> NativeChunkedExport.Report in
                try NativeChunkedExport.run(keys:keys,format:format,destination:destination,titles:titleOverrides,records:{key in
                    if format == .corpus {
                        return NativeExport.corpusRecords(workspace:workspace,keys:[key],allVariants:includeVariants,mode:mode,titleOverrides:titleOverrides,rowLookup:rowLookup)
                    }
                    return try NativeExport.records(workspace:workspace,keys:[key],annotations:savedAnnotations,allVariants:includeVariants,mode:mode,effectiveAnnotations:effective,rowLookup:rowLookup)
                },progress:{done,total in
                    if done == total || done % 100 == 0 {
                        DispatchQueue.main.async{self.status.stringValue="Export en cours… \(done)/\(total)"}
                    }
                },isCancelled:{token.isCancelled})
            }
            DispatchQueue.main.async{self.finishExport(result)}
        }
    }

    /// Fin commune des exports : restaure le bouton, affiche le rapport ou l'annulation.
    private func finishExport(_ result:Result<NativeChunkedExport.Report,Error>){
        activeExport=nil
        updateCheckSummary()
        switch result {
        case .success(let report):
            let omitted=report.omissions.isEmpty ? "" : " \(report.omissions.count) omise(s) : \(report.omissions.prefix(3).map{$0.title}.joined(separator:", "))."
            status.stringValue="\(report.written) élément(s) exporté(s).\(omitted)"
        case .failure(let error):
            if case NativeChunkedExport.Failure.cancelled = error {status.stringValue="Export annulé. Destination inchangée."}
            else {status.stringValue="Export impossible : \(error.localizedDescription)"}
        }
    }

    @objc private func exportIndex(){
        if let token=activeExport {token.cancel();status.stringValue="Annulation de l’export…";return}
        guard let workspace else{return}
        let keys=checkedKeys.isEmpty ? (selectedKeys.isEmpty ? visible.map{ArchiveCore.string($0["key"])} : selectedKeys) : workspace.rows.compactMap{let key=ArchiveCore.string($0["key"]);return checkedKeys.contains(key) ? key : nil}
        guard !keys.isEmpty else{status.stringValue="Aucune entrée à indexer.";return}
        let alert=NSAlert();alert.messageText="Exporter un index";alert.informativeText=checkedKeys.isEmpty ? "La sélection est utilisée ; sans sélection, l’index contient les résultats visibles." : "L’index contiendra les \(keys.count) éléments cochés."
        let options=NSView(frame:NSRect(x:0,y:0,width:340,height:270))
        let fields=[("source","Lien source"),("identity","Identifiant"),("provider","Plateforme"),("project","Projet"),("updated","Date"),("tags","Tags"),("folders","Dossiers"),("note","Note"),("status","Statut"),("priority","Priorité")]
        var checks:[String:NSButton]=[:]
        for (index,(key,label)) in fields.enumerated() {
            let button=NSButton(checkboxWithTitle:label,target:nil,action:nil)
            button.frame=NSRect(x:0,y:245-CGFloat(index)*26,width:330,height:24)
            button.state=["source","provider","project","tags","folders"].contains(key) ? .on : .off
            options.addSubview(button);checks[key]=button
        }
        alert.accessoryView=options;alert.addButton(withTitle:"Exporter…");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        let save=NSSavePanel();save.nameFieldStringValue="PromptMistress-index.md"
        guard save.runModal() == .OK,let target=save.url else{return}
        let wantSource=checks["source"]?.state == .on
        let wantedFields=fields.filter{$0.0 != "source" && checks[$0.0]?.state == .on}
        let rowLookup=Dictionary(workspace.rows.map{(ArchiveCore.string($0["key"]),$0)},uniquingKeysWith:{first,_ in first})
        var blocks:[String]=[]
        for key in keys {
            guard let row=rowLookup[key] else{continue}
            let annotation=annotation(for:row)
            let title=effectiveTitle(row,annotation:annotation).replacingOccurrences(of:"[",with:"\\[").replacingOccurrences(of:"]",with:"\\]")
            let source=(row["variants"] as? [[String:Any]])?.compactMap{URL(string:ArchiveCore.string($0["sourceURL"]))}.first{["http","https"].contains($0.scheme ?? "")}
            var lines=["- " + ((wantSource ? source : nil).map{"[\(title)](<\($0.absoluteString)>)"} ?? title)]
            for (field,label) in wantedFields {
                let value=field == "project" ? effectiveProject(row,annotation:annotation) :
                    field == "tags" || field == "folders" ? annotationText(annotation[field]) :
                    ArchiveCore.string(["note","status","priority"].contains(field) ? annotation[field] : row[field])
                let clean=value.replacingOccurrences(of:"\n",with:" ").trimmingCharacters(in:.whitespacesAndNewlines)
                if !clean.isEmpty {lines.append("  - \(label) : \(clean)")}
            }
            blocks.append(lines.joined(separator:"\n"))
        }
        let token=NativeChunkedExport.CancelToken()
        activeExport=token
        bulkExportButton.title="Annuler l’export"
        status.stringValue="Export de l’index en cours…"
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result { () throws -> NativeChunkedExport.Report in
                try NativeChunkedExport.runIndex(blocks:blocks,destination:target,progress:{done,total in
                    if done == total || done % 500 == 0 {
                        DispatchQueue.main.async{self.status.stringValue="Index en cours… \(done)/\(total)"}
                    }
                },isCancelled:{token.isCancelled})
            }
            DispatchQueue.main.async{self.finishExport(result)}
        }
    }
    @objc private func searchOutputs(){
        guard let workspace else{return}
        let keys=selectedKeys.isEmpty ? nil : Set(selectedKeys)
        outputBrowser=NativeOutputBrowser(workspace:workspace,keys:keys) {[weak self] item in
            guard let self else{return}
            self.kindFilter="Tout";self.visibilityFilter="Tous";self.providerFilter="Toutes";self.projectFilter="Tous";self.tagFilter="";self.folderFilter="";self.statusFilter="";self.dateFrom="";self.dateTo="";self.contentOnly=false;self.duplicatesOnly=false;self.search.stringValue="";self.selectedKey=item.key
            self.filterRows()
            guard let index=self.visible.firstIndex(where:{ArchiveCore.string($0["key"]) == item.key}) else{return}
            self.table.selectRowIndexes(IndexSet(integer:index),byExtendingSelection:false)
            self.table.scrollRowToVisible(index)
            self.variants.selectItem(at:max(0,item.variant-1));self.showSelectedDetail()
            self.window.makeKeyAndOrderFront(nil)
        }
    }
    private func showTextWindow(title:String,text:String){
        let viewer=NSTextView(frame:NSRect(x:0,y:0,width:900,height:600));viewer.string=text.isEmpty ? "Aucun résultat." : text
        viewer.isEditable=false;viewer.isSelectable=true;viewer.font=NSFont.monospacedSystemFont(ofSize:12,weight:.regular)
        let scroll=NSScrollView(frame:NSRect(x:0,y:0,width:900,height:600));scroll.documentView=viewer;scroll.hasVerticalScroller=true;scroll.autoresizingMask=[.width,.height]
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:900,height:600),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title=title;window.contentView=scroll;window.center();window.makeKeyAndOrderFront(nil)
        outputWindow=window
    }
    private func runLegacy(module:String,command:String,arguments:[String]=[],title:String){
        let resources=Bundle.main.resourceURL!
        let config=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives/sources.json")
        status.stringValue="\(title) en cours…"
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result {try LegacyBridge.run(module:module,command:command,arguments:arguments,resources:resources,config:config)}
            DispatchQueue.main.async {
                switch result {
                case .success(let value):
                    self.showTextWindow(title:title,text:value);self.status.stringValue="\(title) terminé."
                    if ["assign","archive","delete","project-create","project-rename","backfill-prompts","rebuild-index"].contains(command) {self.refresh()}
                case .failure(let error):self.status.stringValue="\(title) : \(error.localizedDescription)"
                }
            }
        }
    }
    private func legacyQuery(module:String){
        let alert=NSAlert();alert.messageText="Chercher dans Prompt Vault \(module == "python" ? "Python" : "Node")"
        let input=NSTextField(frame:NSRect(x:0,y:0,width:360,height:28));alert.accessoryView=input
        alert.addButton(withTitle:"Chercher");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn,!input.stringValue.isEmpty else{return}
        runLegacy(module:module,command:"search",arguments:[input.stringValue],title:"Recherche Prompt Vault \(module == "python" ? "Python" : "Node")")
    }
    @objc private func searchNodeVault(){legacyQuery(module:"node")}
    @objc private func searchPythonVault(){legacyQuery(module:"python")}
    @objc private func listNodePrompts(){runLegacy(module:"node",command:"prompts",title:"Prompts Node")}
    @objc private func openCodexExporter(){
        guard let workspace else{status.stringValue="Archives indisponibles.";return}
        let html=Bundle.main.resourceURL!.appendingPathComponent("app/projects/project-b-import/codex_history_public_import.html")
        guard FileManager.default.fileExists(atPath:html.path) else{status.stringValue="Codex Exporter absent du paquet V3.";return}
        codexExporter=NativeCodexExporter(html:html,archive:workspace.archive)
    }
    @objc private func listNodeProjects(){runLegacy(module:"node",command:"projects",title:"Projets Node")}
    @objc private func listNodeInbox(){runLegacy(module:"node",command:"inbox",title:"Boîte de réception Node")}
    @objc private func doctorNodeVault(){runLegacy(module:"node",command:"doctor",title:"Diagnostic Node")}
    @objc private func showLaro(){runLegacy(module:"node",command:"laro",title:"Méthode LARO")}
    @objc private func listPythonProjects(){runLegacy(module:"python",command:"projects",title:"Projets Python")}
    @objc private func listPythonInbox(){runLegacy(module:"python",command:"inbox",title:"Boîte de réception Python")}
    @objc private func doctorPythonVault(){runLegacy(module:"python",command:"doctor",title:"Diagnostic Python")}
    @objc private func reindexNode(){runLegacy(module:"node",command:"rebuild-index",title:"Index Node")}
    @objc private func reindexPython(){runLegacy(module:"python",command:"rebuild-index",title:"Index Python")}
    private func selectedLegacyIDs(_ module:String)->String {
        let keys=Set(selectedKeys)
        guard let workspace else{return ""}
        let ids=workspace.rows.filter{keys.contains(ArchiveCore.string($0["key"]))}.flatMap { row -> [String] in
            let versions=row["variants"] as? [[String:Any]] ?? []
            return versions.compactMap{version in
                guard let editor=version["editor"] as? [String:Any],ArchiveCore.string(editor["module"]) == module else{return nil}
                let id=ArchiveCore.string(editor["id"]);return id.isEmpty ? nil : id
            }
        }
        return Array(Set(ids)).sorted().joined(separator:",")
    }
    private func legacyFields(_ title:String,_ labels:[String],defaults:[String]=[])->[String]? {
        let alert=NSAlert();alert.messageText=title;alert.addButton(withTitle:"Continuer");alert.addButton(withTitle:"Annuler")
        let panel=NSView(frame:NSRect(x:0,y:0,width:440,height:CGFloat(labels.count*44)))
        var inputs:[NSTextField]=[]
        for (index,label) in labels.enumerated() {
            let y=CGFloat((labels.count-index-1)*44)
            let name=NSTextField(labelWithString:label);name.frame=NSRect(x:0,y:y,width:145,height:25);panel.addSubview(name)
            let input=NSTextField(frame:NSRect(x:150,y:y,width:285,height:27));if defaults.indices.contains(index){input.stringValue=defaults[index]};panel.addSubview(input);inputs.append(input)
        }
        alert.accessoryView=panel
        guard alert.runModal() == .alertFirstButtonReturn else{return nil}
        let values=inputs.map{$0.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)}
        guard values.allSatisfy({!$0.isEmpty}) else{status.stringValue="Complétez tous les champs.";return nil}
        return values
    }
    @objc private func deepScanNode(){
        guard let values=legacyFields("Analyse approfondie Node",["Mots clés séparés par des virgules"]) else{return}
        runLegacy(module:"node",command:"deep-scan",arguments:["--keywords",values[0],"--scope","all"],title:"Analyse approfondie Node")
    }
    @objc private func backfillNode(){
        let alert=NSAlert();alert.messageText="Compléter les prompts Node";alert.addButton(withTitle:"Lancer");alert.addButton(withTitle:"Annuler")
        let source=NSPopUpButton(frame:NSRect(x:0,y:0,width:350,height:28));source.addItems(withTitles:["chatgpt","claude","codex","gemini","perplexity"]);alert.accessoryView=source
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        runLegacy(module:"node",command:"backfill-prompts",arguments:["--source",source.titleOfSelectedItem ?? "codex"],title:"Prompts Node complétés")
    }
    @objc private func createNodeProject(){
        guard let values=legacyFields("Créer un projet Node",["Projet / dossier"]) else{return}
        runLegacy(module:"node",command:"project-create",arguments:["--project",values[0]],title:"Projet Node créé")
    }
    @objc private func renameNodeProject(){
        guard let values=legacyFields("Renommer un projet Node",["Ancien nom","Nouveau nom"]) else{return}
        runLegacy(module:"node",command:"project-rename",arguments:["--from",values[0],"--to",values[1]],title:"Projet Node renommé")
    }
    @objc private func assignNodeProject(){
        guard let values=legacyFields("Affecter des entrées Node",["Identifiants (virgules)","Projet"],defaults:[selectedLegacyIDs("node")]) else{return}
        runLegacy(module:"node",command:"assign",arguments:["--ids",values[0],"--project",values[1]],title:"Entrées Node affectées")
    }
    @objc private func archiveNodeEntries(){
        guard let values=legacyFields("Archiver des entrées Node",["Identifiants (virgules)"],defaults:[selectedLegacyIDs("node")]) else{return}
        runLegacy(module:"node",command:"archive",arguments:["--ids",values[0]],title:"Entrées Node archivées")
    }
    @objc private func deleteNodeEntries(){
        guard let values=legacyFields("Supprimer des entrées Node",["Identifiants (virgules)"],defaults:[selectedLegacyIDs("node")]) else{return}
        let alert=NSAlert();alert.messageText="Supprimer définitivement ces entrées du coffre Node ?"
        alert.informativeText=values[0];alert.alertStyle = .warning
        alert.addButton(withTitle:"Supprimer");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        runLegacy(module:"node",command:"delete",arguments:["--ids",values[0]],title:"Entrées Node supprimées")
    }
    @objc private func exportNodeEntries(){
        guard let values=legacyFields("Exporter des entrées Node",["Identifiants (virgules)"],defaults:[selectedLegacyIDs("node")]) else{return}
        let save=NSSavePanel();save.nameFieldStringValue="PromptVault-export.md"
        guard save.runModal() == .OK,let destination=save.url else{return}
        runLegacy(module:"node",command:"export",arguments:["--ids",values[0],"--out",destination.path],title:"Export Node")
    }
    @objc private func exportPythonVault(){
        let save=NSSavePanel();save.nameFieldStringValue="PromptVault-Python.json"
        guard save.runModal() == .OK,let destination=save.url else{return}
        let resources=Bundle.main.resourceURL!
        let config=FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".promptmistress-v2/archives/sources.json")
        status.stringValue="Export Python en cours…"
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result {try LegacyBridge.run(module:"python",command:"export",arguments:[],resources:resources,config:config)}
            DispatchQueue.main.async {
                switch result {
                case .success(let value):
                    do {try Data(value.utf8).write(to:destination,options:.atomic);self.status.stringValue="Coffre Python exporté."}
                    catch {self.status.stringValue="Export Python impossible : \(error)"}
                case .failure(let error):self.status.stringValue="Export Python impossible : \(error)"
                }
            }
        }
    }
    @objc private func importPythonVault(){
        let alert=NSAlert();alert.messageText="Importer Codex dans le coffre Python"
        alert.informativeText="Les sessions locales Codex seront ajoutées au coffre Python existant."
        alert.addButton(withTitle:"Importer");alert.addButton(withTitle:"Annuler")
        guard alert.runModal() == .alertFirstButtonReturn else{return}
        runLegacy(module:"python",command:"import",title:"Import Python")
    }
}
let app=NSApplication.shared
let delegate=V3App();app.delegate=delegate;app.setActivationPolicy(.regular);app.run()
