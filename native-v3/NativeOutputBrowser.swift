import Cocoa

final class NativeOutputBrowser: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    private let workspace:NativeWorkspace
    private let keys:Set<String>?
    private let openSource:(NativeOutput)->Void
    private var window:NSWindow!
    private var table:NSTableView!
    private var detail:NSTextView!
    private var search:NSSearchField!
    private var filesOnly:NSButton!
    private var progress:NSTextField!
    private var more:NSButton!
    private var items:[NativeOutput]=[]
    private var total=0
    private var revision=0

    init(workspace:NativeWorkspace,keys:Set<String>?,openSource:@escaping (NativeOutput)->Void) {
        self.workspace=workspace;self.keys=keys;self.openSource=openSource
        super.init();build();load(reset:true)
    }
    private func build(){
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1080,height:700),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Réponses et fichiers cités"
        let root=NSView(frame:window.contentView!.bounds);root.autoresizingMask=[.width,.height];window.contentView=root
        search=NSSearchField();search.placeholderString="Chercher dans les prompts, réponses et références";search.delegate=self;search.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(search)
        filesOnly=NSButton(checkboxWithTitle:"Avec fichiers ou liens",target:self,action:#selector(changeFilter));filesOnly.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(filesOnly)
        progress=NSTextField(labelWithString:"Analyse des conversations…");progress.textColor = .secondaryLabelColor;progress.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(progress)
        more=NSButton(title:"100 suivantes",target:self,action:#selector(loadMore));more.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(more);more.isEnabled=false
        let open=NSButton(title:"Ouvrir la conversation source",target:self,action:#selector(openSelected));open.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(open)
        let split=NSSplitView();split.isVertical=true;split.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(split)
        table=NSTableView();table.headerView=nil;table.rowHeight=54;table.delegate=self;table.dataSource=self
        let column=NSTableColumn(identifier:NSUserInterfaceItemIdentifier("output"));column.width=340;table.addTableColumn(column)
        let listScroll=NSScrollView();listScroll.documentView=table;listScroll.hasVerticalScroller=true;split.addArrangedSubview(listScroll)
        detail=NSTextView();detail.isEditable=false;detail.isSelectable=true;detail.font=NSFont.monospacedSystemFont(ofSize:12,weight:.regular);detail.textContainerInset=NSSize(width:14,height:14)
        let textScroll=NSScrollView();textScroll.documentView=detail;textScroll.hasVerticalScroller=true;split.addArrangedSubview(textScroll)
        NSLayoutConstraint.activate([
            search.topAnchor.constraint(equalTo:root.topAnchor,constant:12),search.leadingAnchor.constraint(equalTo:root.leadingAnchor,constant:14),search.widthAnchor.constraint(greaterThanOrEqualToConstant:350),
            filesOnly.leadingAnchor.constraint(equalTo:search.trailingAnchor,constant:10),filesOnly.centerYAnchor.constraint(equalTo:search.centerYAnchor),filesOnly.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-14),
            progress.leadingAnchor.constraint(equalTo:search.leadingAnchor),progress.topAnchor.constraint(equalTo:search.bottomAnchor,constant:8),
            more.leadingAnchor.constraint(equalTo:progress.trailingAnchor,constant:12),more.centerYAnchor.constraint(equalTo:progress.centerYAnchor),
            open.trailingAnchor.constraint(equalTo:root.trailingAnchor,constant:-14),open.centerYAnchor.constraint(equalTo:progress.centerYAnchor),
            split.topAnchor.constraint(equalTo:progress.bottomAnchor,constant:10),split.leadingAnchor.constraint(equalTo:root.leadingAnchor),split.trailingAnchor.constraint(equalTo:root.trailingAnchor),split.bottomAnchor.constraint(equalTo:root.bottomAnchor)
        ])
        window.center();window.makeKeyAndOrderFront(nil)
        DispatchQueue.main.async {split.layoutSubtreeIfNeeded();split.setPosition(360,ofDividerAt:0)}
    }
    func controlTextDidChange(_ notification:Notification){load(reset:true)}
    @objc private func changeFilter(){load(reset:true)}
    @objc private func loadMore(){load(reset:false)}
    private func load(reset:Bool){
        revision += 1;let current=revision
        if reset {items=[];total=0;table.reloadData();detail.string=""}
        let offset=items.count,query=search.stringValue,files=filesOnly.state == .on
        progress.stringValue="Analyse des conversations…";more.isEnabled=false
        DispatchQueue.global(qos:.userInitiated).async {
            let result=NativeOutputs.scan(workspace:self.workspace,keys:self.keys,query:query,offset:offset,limit:100,filesOnly:files)
            DispatchQueue.main.async {
                guard self.revision == current else{return}
                self.items.append(contentsOf:result.items);self.total=result.total;self.table.reloadData()
                self.progress.stringValue="\(self.items.count) / \(result.total) réponses · \(result.warnings) version(s) sans rôles"
                self.more.isEnabled=self.items.count < result.total
                if !self.items.isEmpty && self.table.selectedRow < 0 {self.table.selectRowIndexes(IndexSet(integer:0),byExtendingSelection:false)}
                if self.items.isEmpty {self.detail.string="Aucune réponse trouvée."}
            }
        }
    }
    func numberOfRows(in tableView:NSTableView)->Int{items.count}
    func tableView(_ tableView:NSTableView,viewFor tableColumn:NSTableColumn?,row:Int)->NSView? {
        guard items.indices.contains(row) else{return nil}
        let item=items[row],cell=NSTableCellView()
        let title=NSTextField(labelWithString:item.title);title.font=NSFont.systemFont(ofSize:13,weight:.medium);title.lineBreakMode = .byTruncatingTail;title.translatesAutoresizingMaskIntoConstraints=false;cell.addSubview(title)
        let subtitle=NSTextField(labelWithString:"\(item.provider) · version \(item.variant) · tour \(item.turn) · \(item.references.count) référence(s)")
        subtitle.font=NSFont.systemFont(ofSize:11);subtitle.textColor = .secondaryLabelColor;subtitle.lineBreakMode = .byTruncatingTail;subtitle.translatesAutoresizingMaskIntoConstraints=false;cell.addSubview(subtitle)
        NSLayoutConstraint.activate([title.leadingAnchor.constraint(equalTo:cell.leadingAnchor,constant:8),title.trailingAnchor.constraint(equalTo:cell.trailingAnchor,constant:-5),title.topAnchor.constraint(equalTo:cell.topAnchor,constant:6),subtitle.leadingAnchor.constraint(equalTo:title.leadingAnchor),subtitle.trailingAnchor.constraint(equalTo:title.trailingAnchor),subtitle.topAnchor.constraint(equalTo:title.bottomAnchor,constant:4)])
        return cell
    }
    func tableViewSelectionDidChange(_ notification:Notification){
        guard items.indices.contains(table.selectedRow) else{return}
        let item=items[table.selectedRow]
        detail.string="Prompt précédent\n\n\(item.prompt.isEmpty ? "Aucun prompt identifiable." : item.prompt)\n\n──────── Réponse ────────\n\n\(item.output)" + (item.references.isEmpty ? "" : "\n\n──────── Fichiers et liens cités ────────\n\n"+item.references.joined(separator:"\n"))
    }
    @objc private func openSelected(){guard items.indices.contains(table.selectedRow) else{return};openSource(items[table.selectedRow])}
}
