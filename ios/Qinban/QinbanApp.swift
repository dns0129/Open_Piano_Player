import SwiftUI
import UIKit
import WebKit

@main
@MainActor
struct QinbanApp: App {
    @StateObject private var model = WebAppModel()

    var body: some Scene {
        WindowGroup { QinbanRootView(model: model) }
    }
}

private struct QinbanRootView: View {
    @ObservedObject var model: WebAppModel

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color(red: 0.984, green: 0.973, blue: 0.937).ignoresSafeArea()
                if let webView = model.webView {
                    HostedWebView(webView: webView)
                }
                if model.isLoading {
                    ProgressView().progressViewStyle(.linear).tint(Color.accentColor)
                        .accessibilityLabel("正在载入琴伴")
                }
                if let error = model.loadingError {
                    VStack(spacing: 18) {
                        Image(systemName: "pianokeys").font(.system(size: 42)).foregroundStyle(Color.accentColor)
                        Text("与你的下一首曲子相伴").font(.title3.weight(.semibold))
                        Text(error).font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button("重新连接", action: model.reload).buttonStyle(.borderedProminent)
                            .disabled(model.isLoading)
                    }
                    .padding(28).frame(maxWidth: 420, maxHeight: .infinity)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 0.984, green: 0.973, blue: 0.937))
                }
            }
            .navigationTitle("琴伴")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: model.goBack) { Image(systemName: "chevron.left") }
                        .disabled(!model.canGoBack).accessibilityLabel("返回")
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: model.reload) { Image(systemName: "arrow.clockwise") }
                        .disabled(model.isLoading).accessibilityLabel("重新载入")
                }
            }
            .alert("琴伴", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
                Button("知道了", role: .cancel) { model.notice = nil }
            } message: { Text(model.notice ?? "") }
            .sheet(item: $model.sharedFile, onDismiss: model.removeSharedFile) { item in
                ShareSheet(url: item.url)
            }
        }
    }
}

private struct HostedWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
