import AppKit
import Foundation

final class NativeImportPicker: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    private struct Entry { let index:Int; let title:String; let source:String }
    private let entries:[Entry]
    private var filtered:[Entry]
    private var selected:Set<Int>
    private let table=NSTableView()
    private let count=NSTextField(labelWithString:"")

    static func choose(file:URL) throws -> [Int]? {
        guard file.pathExtension.lowercased() == "json" else{return nil}
        let data=try Data(contentsOf:file,options:.mappedIfSafe)
        guard data.count <= 100*1024*1024 else{throw NSError(domain:"PromptMistress",code:3,userInfo:[NSLocalizedDescriptionKey:"Fichier supérieur à 100 Mo."])}
        let parsed=try JSONSerialization.jsonObject(with:data)
        let list=(parsed as? [Any]) ?? ((parsed as? [String:Any])?["conversations"] as? [Any]) ?? [parsed]
        guard list.count > 1 else{return [0]}
        let picker=NativeImportPicker(list:list)
        return picker.present()
    }

    private init(list:[Any]) {
        entries=list.enumerated().map { index,value in
            let item=value as? [String:Any] ?? [:]
            let title=ArchiveCore.string(item["title"]).isEmpty ? ArchiveCore.string(item["conversation_id"] ?? item["id"]) : ArchiveCore.string(item["title"])
            return Entry(index:index,title:title.isEmpty ? "Conversation \(index+1)" : title,source:ArchiveCore.string(item["source"] ?? item["provider"]))
        }
        filtered=entries;selected=Set(entries.map(\.index))
        super.init()
    }
    private func present() -> [Int]? {
        let alert=NSAlert();alert.messageText="Choisir les conversations à importer"
        alert.informativeText="\(entries.count) conversations dans ce fichier. Décochez celles à ignorer."
        alert.addButton(withTitle:"Importer la sélection");alert.addButton(withTitle:"Annuler")
        let container=NSView(frame:NSRect(x:0,y:0,width:620,height:430))
        let search=NSSearchField(frame:NSRect(x:0,y:400,width:620,height:28));search.placeholderString="Filtrer par titre ou plateforme";search.delegate=self;container.addSubview(search)
        let all=NSButton(title:"Tout cocher",target:self,action:#selector(selectAll));all.frame=NSRect(x:0,y:365,width:115,height:28);container.addSubview(all)
        let none=NSButton(title:"Tout décocher",target:self,action:#selector(selectNone));none.frame=NSRect(x:120,y:365,width:125,height:28);container.addSubview(none)
        count.frame=NSRect(x:365,y:365,width:250,height:28);count.alignment = .right;container.addSubview(count)
        let scroll=NSScrollView(frame:NSRect(x:0,y:0,width:620,height:355));scroll.hasVerticalScroller=true;scroll.autoresizingMask=[.width,.height]
        for (identifier,title,width) in [("selection","",40),("title","Conversation",430),("source","Plateforme",140)] {
            let column=NSTableColumn(identifier:NSUserInterfaceItemIdentifier(identifier));column.title=title;column.width=CGFloat(width);table.addTableColumn(column)
        }
        table.headerView=NSTableHeaderView();table.rowHeight=27;table.delegate=self;table.dataSource=self
        scroll.documentView=table;container.addSubview(scroll);alert.accessoryView=container
        updateCount()
        guard alert.runModal() == .alertFirstButtonReturn else{return []}
        return selected.sorted()
    }
    private func updateCount(){count.stringValue="\(selected.count) sélectionnée(s)"}
    @objc private func selectAll(){for entry in filtered{selected.insert(entry.index)};table.reloadData();updateCount()}
    @objc private func selectNone(){for entry in filtered{selected.remove(entry.index)};table.reloadData();updateCount()}
    @objc private func toggle(_ sender:NSButton){
        let index=sender.tag
        if sender.state == .on {selected.insert(index)} else {selected.remove(index)}
        updateCount()
    }
    func controlTextDidChange(_ obj:Notification){
        guard let search=obj.object as? NSSearchField else{return}
        let query=search.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
        filtered=query.isEmpty ? entries : entries.filter{$0.title.localizedCaseInsensitiveContains(query) || $0.source.localizedCaseInsensitiveContains(query)}
        table.reloadData()
    }
    func numberOfRows(in tableView:NSTableView) -> Int {filtered.count}
    func tableView(_ tableView:NSTableView,viewFor tableColumn:NSTableColumn?,row:Int) -> NSView? {
        guard row >= 0 && row < filtered.count else{return nil}
        let entry=filtered[row]
        switch tableColumn?.identifier.rawValue {
        case "selection":
            let button=NSButton(checkboxWithTitle:"",target:self,action:#selector(toggle));button.tag=entry.index;button.state=selected.contains(entry.index) ? .on : .off
            return button
        case "source":return NSTextField(labelWithString:entry.source)
        default:return NSTextField(labelWithString:entry.title)
        }
    }
}
