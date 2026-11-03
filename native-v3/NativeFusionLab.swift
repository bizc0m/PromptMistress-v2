import Cocoa
import WebKit

final class NativeFusionLab:NSObject,WKScriptMessageHandlerWithReply,WKNavigationDelegate,WKDownloadDelegate {
    private let archive:NativeArchive
    private var window:NSWindow!
    private var webView:WKWebView!

    init(html:URL,archive:NativeArchive) {
        self.archive=archive
        super.init()
        let controller=WKUserContentController()
        controller.addScriptMessageHandler(self,contentWorld:.page,name:"archive")
        let bridge="""
        (() => {
          const originalFetch = window.fetch.bind(window);
          window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input.url;
            if (url.startsWith('/api/archive')) {
              const result = await window.webkit.messageHandlers.archive.postMessage(url);
              return new Response(result.body, {status: result.status, headers: {'Content-Type':'application/json'}});
            }
            return originalFetch(input, init);
          };
        })();
        """
        controller.addUserScript(WKUserScript(source:bridge,injectionTime:.atDocumentStart,forMainFrameOnly:true))
        let configuration=WKWebViewConfiguration();configuration.userContentController=controller
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1280,height:820),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Fusion / Lab · sans serveur"
        webView=WKWebView(frame:window.contentView!.bounds,configuration:configuration)
        webView.autoresizingMask=[.width,.height];webView.navigationDelegate=self
        window.contentView=webView
        webView.loadFileURL(html,allowingReadAccessTo:html.deletingLastPathComponent())
        window.center();window.makeKeyAndOrderFront(nil)
    }
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage,replyHandler:@escaping (Any?,String?)->Void){
        guard let request=message.body as? String,let url=URLComponents(string:"https://local.invalid"+request) else {replyHandler(["status":400,"body":"{}"],nil);return}
        if url.path == "/api/archive" {
            do {
                let data=try JSONSerialization.data(withJSONObject:["rows":archive.rows,"summary":archive.summary])
                replyHandler(["status":200,"body":String(decoding:data,as:UTF8.self)],nil)
            }catch {replyHandler(["status":500,"body":"{}"],nil)}
            return
        }
        guard url.path == "/api/archive/detail" else{replyHandler(["status":404,"body":"{}"],nil);return}
        let query=Dictionary(uniqueKeysWithValues:(url.queryItems ?? []).map{($0.name,$0.value ?? "")})
        let key=query["key"] ?? "",variant=Int(query["variant"] ?? "0") ?? 0
        DispatchQueue.global(qos:.userInitiated).async {
            let result=Result {try self.archive.detail(key:key,variant:variant)}
            DispatchQueue.main.async {
                switch result {
                case .success(let detail):
                    guard let detail,let data=try? JSONSerialization.data(withJSONObject:detail) else {replyHandler(["status":404,"body":"{}"],nil);return}
                    replyHandler(["status":200,"body":String(decoding:data,as:UTF8.self)],nil)
                case .failure(let error):
                    let body=(try? JSONSerialization.data(withJSONObject:["error":error.localizedDescription])).map{String(decoding:$0,as:UTF8.self)} ?? "{}"
                    replyHandler(["status":500,"body":body],nil)
                }
            }
        }
    }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping (WKNavigationActionPolicy)->Void){
        if navigationAction.shouldPerformDownload {decisionHandler(.download);return}
        decisionHandler(.allow)
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
    func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping (URL?)->Void){
        let panel=NSSavePanel();panel.nameFieldStringValue=suggestedFilename
        panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.url : nil)}
    }
}
