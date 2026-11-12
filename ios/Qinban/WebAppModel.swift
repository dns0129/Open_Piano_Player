import Combine
import Foundation
import StoreKit
import UIKit
import WebKit

struct SharedFile: Identifiable {
    let id = UUID()
    let url: URL
}

@MainActor
private final class WeakBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var target: WebAppModel?
    init(_ target: WebAppModel) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard let target else { replyHandler(nil, "APP_CLOSED: 应用已关闭。"); return }
        target.userContentController(userContentController, didReceive: message, replyHandler: replyHandler)
    }
}

@MainActor
final class WebAppModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, WKDownloadDelegate {
    @Published var isLoading = false
    @Published var canGoBack = false
    @Published var loadingError: String?
    @Published var notice: String?
    @Published var sharedFile: SharedFile?
    private(set) var configuration: AppConfiguration?
    @Published private(set) var webView: WKWebView?
    private var store: QinbanStore?
    private var requests = 0
    private var isStarting = false
    private var setupTask: Task<Void, Never>?
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var completedDownloads: [URL] = []
    private var sharedDirectory: URL?

    override init() {
        super.init()
        start()
    }

    private func start(refreshAppTransaction: Bool = false) {
        guard !isStarting, webView == nil else { return }
        isStarting = true
        isLoading = true
        loadingError = nil
        setupTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.isStarting = false }
            do {
                let destination: AppConfiguration.Destination
                #if DEBUG
                // A development build never logs into the production service.
                destination = .sandbox
                #else
                let result: VerificationResult<AppTransaction>
                if refreshAppTransaction {
                    // refresh may prompt for an App Store sign-in. Only the
                    // explicit retry button can reach this branch.
                    result = try await AppTransaction.refresh()
                } else {
                    result = try await AppTransaction.shared
                }
                guard case .verified(let app) = result,
                      app.bundleID == Bundle.main.bundleIdentifier else {
                    throw BridgeError(code: "APP_UNVERIFIED", message: "暂时无法确认应用来源，请联网后重试。")
                }
                if app.environment == .production {
                    destination = .production
                } else if app.environment == .sandbox {
                    destination = .sandbox
                } else {
                    throw BridgeError(code: "APP_ENVIRONMENT", message: "暂时无法确认应用运行环境，请重试。")
                }
                #endif
                let settings = try AppConfiguration.load(destination: destination)
                try self.install(settings)
                self.reload()
            } catch {
                self.isLoading = false
                self.loadingError = "琴伴暂时无法连接服务，请检查网络后重试。"
                #if DEBUG
                self.loadingError = "开发配置尚未完成。\n\(error.localizedDescription)\n请检查 ios/Configuration/Local.xcconfig。"
                #endif
            }
        }
    }

    private func install(_ settings: AppConfiguration) throws {
            configuration = settings
            let controller = WKUserContentController()
            controller.addScriptMessageHandler(WeakBridgeHandler(self), contentWorld: .page, name: "qinban")
            guard let bridgeURL = Bundle.main.url(forResource: "NativeBridge", withExtension: "js") else {
                throw BridgeError(code: "CONFIGURATION_REQUIRED", message: "应用组件未完整安装。")
            }
            let source = try String(contentsOf: bridgeURL, encoding: .utf8)
            // Each call also checks the exact main-frame security origin.
            controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            let webConfiguration = WKWebViewConfiguration()
            webConfiguration.userContentController = controller
            webConfiguration.websiteDataStore = .default()
            webConfiguration.applicationNameForUserAgent = "QinbanIOS/1.0"
            webConfiguration.allowsInlineMediaPlayback = true
            webConfiguration.mediaTypesRequiringUserActionForPlayback = [.audio, .video]
            let view = WKWebView(frame: .zero, configuration: webConfiguration)
            view.navigationDelegate = self
            view.uiDelegate = self
            view.allowsBackForwardNavigationGestures = true
            view.isOpaque = false
            view.backgroundColor = UIColor(red: 0.984, green: 0.973, blue: 0.937, alpha: 1)
            view.scrollView.contentInsetAdjustmentBehavior = .never
            webView = view
            let purchases = QinbanStore(configuration: settings)
            purchases.onTransaction = { [weak self] transaction in self?.emit(transaction) }
            store = purchases
    }

    func reload() {
        guard let configuration, let webView else {
            start(refreshAppTransaction: true)
            return
        }
        loadingError = nil
        let url = configuration.trusts(webView.url) ? webView.url! : configuration.origin
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue("app-store", forHTTPHeaderField: "X-Qinban-Distribution")
        webView.load(request)
    }

    func goBack() {
        if webView?.canGoBack == true { webView?.goBack() }
    }

    private func emit(_ transaction: [String: Any]) {
        guard let configuration, let webView,
              configuration.trusts(webView.url),
              let bytes = try? JSONSerialization.data(withJSONObject: transaction),
              let json = String(data: bytes, encoding: .utf8) else { return }
        // A newly loaded page calls pendingTransactions to recover early events.
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('qinban:transaction',{detail:" + json + "}));",
            completionHandler: nil
        )
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        guard let configuration, let webView, let store,
              message.webView === webView,
              message.frameInfo.isMainFrame,
              configuration.trusts(webView.url),
              configuration.trusts(
                scheme: message.frameInfo.securityOrigin.protocol,
                host: message.frameInfo.securityOrigin.host,
                port: message.frameInfo.securityOrigin.port
              ) else {
            replyHandler(nil, BridgeError.untrustedPage.localizedDescription)
            return
        }
        guard requests < 8 else {
            replyHandler(nil, "TOO_MANY_REQUESTS: 请等待当前操作完成。")
            return
        }
        let command: BridgeCommand
        do { command = try BridgeCommand(body: message.body) }
        catch { replyHandler(nil, error.localizedDescription); return }
        requests += 1
        Task { @MainActor [weak self] in
            guard let self else { replyHandler(nil, "APP_CLOSED: 应用已关闭。"); return }
            defer { self.requests -= 1 }
            do {
                let response: [String: Any]
                switch command.method {
                case .getProducts:
                    response = try await store.products(ids: command.productIDs(allowed: configuration.allowedProductIDs))
                case .purchase:
                    let (productID, token) = try command.purchase(allowed: configuration.allowedProductIDs)
                    response = try await store.purchase(productID: productID, accountToken: token)
                case .pendingTransactions:
                    response = await store.pendingTransactions()
                case .restore:
                    response = try await store.restore()
                case .finishTransaction:
                    response = try await store.finish(transactionID: command.transactionID())
                case .manageSubscriptions:
                    guard let scene = webView.window?.windowScene else {
                        throw BridgeError(code: "APP_NOT_ACTIVE", message: "请在琴伴窗口中重试。")
                    }
                    response = try await store.manageSubscriptions(in: scene)
                case .clearSession:
                    await self.clearSession()
                    response = ["cleared": true]
                }
                replyHandler(response, nil)
            } catch {
                if let failure = error as? BridgeError {
                    replyHandler(nil, failure.localizedDescription)
                } else {
                    replyHandler(nil, "STORE_UNAVAILABLE: 暂时无法完成操作，请稍后重试；如已付款，请恢复购买。")
                }
            }
        }
    }

    private func clearSession() async {
        guard let configuration, let webView else { return }
        let dataStore = webView.configuration.websiteDataStore
        let host = configuration.origin.host?.lowercased() ?? ""
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            dataStore.httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
        }
        for cookie in cookies {
            let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
            if host == domain || host.hasSuffix("." + domain) {
                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    dataStore.httpCookieStore.delete(cookie) { continuation.resume() }
                }
            }
        }
        // Preserve localStorage, IndexedDB and score data. Server logout comes first.
        // displayName is a user-facing domain label, not an exact host, so clear
        // only these HTTP cache types for the app's store without host matching.
        let types = Set([WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache])
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            dataStore.removeData(ofTypes: types, modifiedSince: .distantPast) { continuation.resume() }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let configuration, let url = navigationAction.request.url else {
            decisionHandler(.cancel); return
        }
        if configuration.trusts(url) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
            } else if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }
        // Same-page score exports may download a blob but never navigate to it.
        if url.scheme == "blob", navigationAction.shouldPerformDownload,
           configuration.trusts(webView.url) {
            decisionHandler(.download); return
        }
        if navigationAction.navigationType == .linkActivated {
            if configuration.allowsExternal(url) || url.scheme?.lowercased() == "mailto" {
                UIApplication.shared.open(url)
            } else {
                notice = "此链接无法在琴伴中打开。请通过“帮助与反馈”联系支持人员。"
            }
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        guard let configuration else { decisionHandler(.cancel); return }
        let url = navigationResponse.response.url
        guard configuration.trusts(url) ||
                (url?.scheme == "blob" && configuration.trusts(webView.url)) else {
            decisionHandler(.cancel); return
        }
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        loadingError = nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        canGoBack = webView.canGoBack
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { handleNavigationError(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { handleNavigationError(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isLoading = false
        loadingError = "页面已暂时关闭，重新载入即可继续。已提交的任务仍会保留。"
    }
    private func handleNavigationError(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        isLoading = false
        loadingError = "暂时无法连接琴伴。请检查网络后重试；已提交的任务和已购买的权益不会因此丢失。"
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
        guard let configuration, frame.isMainFrame,
              configuration.trusts(scheme: origin.protocol, host: origin.host, port: origin.port),
              type == .camera else { decisionHandler(.deny); return }
        decisionHandler(.prompt)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, decisionHandler: @escaping @MainActor @Sendable (WKDownload.RedirectPolicy) -> Void) {
        decisionHandler(configuration?.trusts(request.url) == true ? .allow : .cancel)
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping @MainActor @Sendable (URL?) -> Void) {
        do {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("qinban-export-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let base = (suggestedFilename as NSString).lastPathComponent
            let name = base.isEmpty || base == "." || base == ".." ? "琴伴乐谱" : String(base.prefix(180))
            let destination = directory.appendingPathComponent(name)
            downloads[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        } catch {
            notice = "无法准备导出文件，请稍后重试。"
            completionHandler(nil)
        }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        completedDownloads.append(url)
        presentNextSharedFile()
    }
    private func presentNextSharedFile() {
        // Keep the current export alive until its share sheet is dismissed.
        // A later completed download must not replace or delete that file.
        guard sharedDirectory == nil, !completedDownloads.isEmpty else { return }
        let url = completedDownloads.removeFirst()
        sharedDirectory = url.deletingLastPathComponent()
        sharedFile = SharedFile(url: url)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        notice = "导出未完成，请重新导出乐谱。"
    }
    func removeSharedFile() {
        if let sharedDirectory { try? FileManager.default.removeItem(at: sharedDirectory) }
        sharedDirectory = nil
        sharedFile = nil
        Task { @MainActor [weak self] in
            self?.presentNextSharedFile()
        }
    }
}
