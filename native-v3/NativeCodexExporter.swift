import Cocoa
import WebKit

final class NativeCodexExporter:NSObject,WKNavigationDelegate,WKDownloadDelegate {
    private var window:NSWindow!
    private var webView:WKWebView!
    private let archive:NativeArchive

    init(html:URL,archive:NativeArchive) {
        self.archive=archive
        super.init()
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1250,height:800),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Codex Exporter · sans serveur"
        webView=WKWebView(frame:window.contentView!.bounds)
        webView.autoresizingMask=[.width,.height];webView.navigationDelegate=self
        window.contentView=webView
        webView.loadFileURL(html,allowingReadAccessTo:html.deletingLastPathComponent())
        window.center();window.makeKeyAndOrderFront(nil)
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
        let archive=self.archive
        DispatchQueue.global(qos:.userInitiated).async { [weak self] in
            let rows=archive.rows.filter{ArchiveCore.string($0["provider"]) == "codex"}
            let prepared:[[String:Any]]=rows.map { row in
                let key=ArchiveCore.string(row["key"])
                let variants=row["variants"] as? [[String:Any]] ?? []
                let preferred=variants.firstIndex(where:{$0["hasContent"] as? Bool == true}) ?? 0
                let detail=(try? archive.detail(key:key,variant:preferred)) ?? [:]
                let text=NativeWorkspace.promptBody(ArchiveCore.string(detail["text"]))
                let messages=NativeWorkspace.markdownMessages(text)
                let preview=messages.first(where:{$0["role"] == "user"})?["content"] ?? String(text.prefix(1000))
                let id=ArchiveCore.string(row["identity"])
                let sourceURL=ArchiveCore.string(detail["sourceURL"])
                let deeplink=sourceURL.hasPrefix("codex://") ? sourceURL : "codex://threads/\(id.isEmpty ? key : id)"
                return ["id":id.isEmpty ? key : id,"name":row["title"] ?? "Conversation",
                    "runCount":1,"updatedAt":row["updated"] ?? "","project":row["project"] ?? "",
                    "promptPreview":String(preview.prefix(2000)),"promptCount":messages.filter{$0["role"] == "user"}.count,
                    "fullText":text,"textCount":text.count,"runStatus":"inconnu","lastStartedAt":row["updated"] ?? "",
                    "waitingDays":"","deeplink":deeplink,
                    "cwd":"","sessionFile":"","gitBranch":"","gitRemote":"","githubUrl":"","lastPushAt":""]
            }
            DispatchQueue.main.async { [weak self] in self?.inject(rows:prepared,index:0) }
        }
    }
    private func inject(rows:[[String:Any]],index:Int){
        guard index < rows.count else {
            webView.evaluateJavaScript("try{window.CodexHistoryApp.render();document.getElementById('meta').textContent=window.CodexHistoryApp.rows.length+' chats Codex · '+window.CodexHistoryApp.visible.length+' visibles · '+document.querySelectorAll('#rows tr').length+' lignes'}catch(error){document.getElementById('meta').textContent='Erreur Codex : '+String(error)}",completionHandler:nil)
            return
        }
        let end=min(index+20,rows.count)
        guard let data=try? JSONSerialization.data(withJSONObject:Array(rows[index..<end])),
              let json=String(data:data,encoding:.utf8) else{return}
        webView.evaluateJavaScript("window.CodexHistoryApp.rows.push(...\(json));") { [weak self] _,error in
            if error == nil {self?.inject(rows:rows,index:end)}
            else {self?.webView.evaluateJavaScript("document.getElementById('meta').textContent='Chargement Codex impossible';",completionHandler:nil)}
        }
    }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping (WKNavigationActionPolicy)->Void){
        if navigationAction.shouldPerformDownload {decisionHandler(.download);return}
        if let url=navigationAction.request.url,!url.isFileURL,!(["about","blob"].contains(url.scheme ?? "")) {
            NSWorkspace.shared.open(url);decisionHandler(.cancel);return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
    func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping (URL?)->Void){
        let panel=NSSavePanel();panel.nameFieldStringValue=suggestedFilename
        panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.url : nil)}
    }
}
