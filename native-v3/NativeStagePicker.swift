import AppKit

final class NativeStagePicker:NSObject,NSTableViewDataSource,NSTableViewDelegate,NSSearchFieldDelegate {
    private struct Entry {let id:String;let title:String;let source:String;let received:Bool}
    private let entries:[Entry]
    private var filtered:[Entry]
    private var selected:Set<String>
    private let table=NSTableView()
    private let count=NSTextField(labelWithString:"")

    static func choose(file:URL) throws -> [String]? {
        guard FileManager.default.fileExists(atPath:file.path) else{return []}
        let data=try Data(contentsOf:file,options:.mappedIfSafe)
        let stage=try JSONSerialization.jsonObject(with:data) as? [String:Any] ?? [:]
        let rows=stage["rows"] as? [String:[String:Any]] ?? [:]
        let conversations=stage["conversations"] as? [String:Any] ?? [:]
        let picker=NativeStagePicker(rows:rows,received:Set(conversations.keys))
        return picker.present()
    }
    private init(rows:[String:[String:Any]],received:Set<String>){
        entries=rows.map{id,row in Entry(id:id,title:ArchiveCore.string(row["title"]),source:ArchiveCore.string(row["source"]),received:received.contains(id))}.sorted{$0.title.localizedStandardCompare($1.title) == .orderedAscending}
        filtered=entries;selected=Set(entries.filter(\.received).map(\.id));super.init()
    }
    private func present()->[String]? {
        let alert=NSAlert();alert.messageText="Conversations capturées"
        alert.informativeText=String(entries.count)+" repérées · "+String(entries.filter(\.received).count)+" textes reçus. Seuls les textes reçus sont importables."
        alert.addButton(withTitle:"Importer la sélection");alert.addButton(withTitle:"Fermer")
        let container=NSView(frame:NSRect(x:0,y:0,width:650,height:430))
        let search=NSSearchField(frame:NSRect(x:0,y:400,width:650,height:28));search.placeholderString="Filtrer par titre ou plateforme";search.delegate=self;container.addSubview(search)
        let all=NSButton(title:"Tout cocher",target:self,action:#selector(selectAll));all.frame=NSRect(x:0,y:365,width:115,height:28);container.addSubview(all)
        let none=NSButton(title:"Tout décocher",target:self,action:#selector(selectNone));none.frame=NSRect(x:120,y:365,width:125,height:28);container.addSubview(none)
        count.frame=NSRect(x:370,y:365,width:275,height:28);count.alignment = .right;container.addSubview(count)
        for (id,title,width) in [("selection","",40),("title","Conversation",430),("source","Plateforme",150)] {
            let column=NSTableColumn(identifier:NSUserInterfaceItemIdentifier(id));column.title=title;column.width=CGFloat(width);table.addTableColumn(column)
        }
        table.headerView=NSTableHeaderView();table.rowHeight=27;table.delegate=self;table.dataSource=self
        let scroll=NSScrollView(frame:NSRect(x:0,y:0,width:650,height:355));scroll.hasVerticalScroller=true;scroll.documentView=table;container.addSubview(scroll)
        alert.accessoryView=container;updateCount()
        guard alert.runModal() == .alertFirstButtonReturn else{return nil}
        return selected.sorted()
    }
    private func updateCount(){count.stringValue="(selected.count) texte(s) sélectionné(s)"}
    @objc private func selectAll(){for entry in filtered where entry.received{selected.insert(entry.id)};table.reloadData();updateCount()}
    @objc private func selectNone(){for entry in filtered{selected.remove(entry.id)};table.reloadData();updateCount()}
    @objc private func toggle(_ sender:NSButton){guard filtered.indices.contains(sender.tag),filtered[sender.tag].received else{return};let id=filtered[sender.tag].id;if sender.state == .on{selected.insert(id)}else{selected.remove(id)};updateCount()}
    func controlTextDidChange(_ obj:Notification){guard let search=obj.object as? NSSearchField else{return};let query=search.stringValue.trimmingCharacters(in:.whitespacesAndNewlines);filtered=query.isEmpty ? entries : entries.filter{$0.title.localizedCaseInsensitiveContains(query)||$0.source.localizedCaseInsensitiveContains(query)};table.reloadData()}
    func numberOfRows(in tableView:NSTableView)->Int{filtered.count}
    func tableView(_ tableView:NSTableView,viewFor tableColumn:NSTableColumn?,row:Int)->NSView?{
        guard filtered.indices.contains(row) else{return nil};let entry=filtered[row]
        switch tableColumn?.identifier.rawValue {
        case "selection":let button=NSButton(checkboxWithTitle:"",target:self,action:#selector(toggle));button.tag=row;button.state=selected.contains(entry.id) ? .on : .off;button.isEnabled=entry.received;return button
        case "source":return NSTextField(labelWithString:entry.source)
        default:return NSTextField(labelWithString:entry.received ? entry.title : "(entry.title) · texte en attente")
        }
    }
}
