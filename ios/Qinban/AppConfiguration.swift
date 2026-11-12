import Foundation

struct BridgeError: LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { "\(code): \(message)" }

    static let invalidRequest = BridgeError(code: "INVALID_REQUEST", message: "请求格式无效，请重新打开页面。")
    static let untrustedPage = BridgeError(code: "UNTRUSTED_PAGE", message: "此页面不能使用琴伴的应用内购买。")
}

struct AppConfiguration {
    enum Destination: Equatable { case production, sandbox }
    let origin: URL
    let productIDs: [String: String]
    let externalHosts: Set<String>

    var allowedProductIDs: Set<String> { Set(productIDs.values) }

    init(origin: String, productIDs: [String: String], externalHosts: Set<String> = []) throws {
        guard let components = URLComponents(string: origin),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              !host.isEmpty, !host.hasSuffix(".invalid"),
              !host.contains("$"), !host.contains("*"),
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              components.port == nil || (1...65535).contains(components.port!),
              let url = components.url else {
            throw BridgeError(code: "CONFIGURATION_REQUIRED", message: "服务地址尚未配置。")
        }
        guard Set(productIDs.keys) == Set(["light", "standard", "professional", "topup"]),
              Set(productIDs.values).count == 4,
              productIDs.values.allSatisfy({ value in
                  !value.isEmpty && value.count <= 200 &&
                  value.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil
              }) else {
            throw BridgeError(code: "CONFIGURATION_REQUIRED", message: "应用内购买商品尚未配置。")
        }
        self.origin = url
        self.productIDs = productIDs
        self.externalHosts = Set(externalHosts.map { $0.lowercased() })
    }

    static func load(destination: Destination, bundle: Bundle = .main) throws -> AppConfiguration {
        guard let origin = bundle.object(forInfoDictionaryKey: "QinbanServerOrigin") as? String,
              let sandboxOrigin = bundle.object(forInfoDictionaryKey: "QinbanSandboxOrigin") as? String,
              let products = bundle.object(forInfoDictionaryKey: "QinbanProducts") as? [String: String] else {
            throw BridgeError(code: "CONFIGURATION_REQUIRED", message: "应用配置暂不可用。")
        }
        return try destinations(production: origin, sandbox: sandboxOrigin, products: products, externalHosts: Set(bundle.object(forInfoDictionaryKey: "QinbanExternalHosts") as? [String] ?? []), selected: destination)
    }

    static func destinations(production: String, sandbox: String, products: [String: String], externalHosts: Set<String> = [], selected: Destination) throws -> AppConfiguration {
        let live = try AppConfiguration(
            origin: production,
            productIDs: products,
            externalHosts: externalHosts
        )
        let test = try AppConfiguration(
            origin: sandbox,
            productIDs: products,
            externalHosts: externalHosts
        )
        // Ports don't isolate cookies. Separate hostnames prevent a production
        // session cookie from being sent to the sandbox origin or vice versa.
        guard live.origin.host?.lowercased() != test.origin.host?.lowercased() else {
            throw BridgeError(code: "CONFIGURATION_REQUIRED", message: "测试服务和正式服务必须使用不同的主机名。")
        }
        return selected == .production ? live : test
    }

    func trusts(_ url: URL?) -> Bool {
        guard let url, url.user == nil, url.password == nil else { return false }
        return url.scheme?.lowercased() == "https" &&
            url.host?.lowercased() == origin.host?.lowercased() &&
            (url.port ?? 443) == (origin.port ?? 443)
    }

    func trusts(scheme: String, host: String, port: Int) -> Bool {
        scheme.lowercased() == "https" &&
            host.lowercased() == origin.host?.lowercased() &&
            (port == 0 ? 443 : port) == (origin.port ?? 443)
    }

    func allowsExternal(_ url: URL) -> Bool {
        guard url.user == nil, url.password == nil else { return false }
        return url.scheme?.lowercased() == "https" &&
            (url.port ?? 443) == 443 &&
            externalHosts.contains(url.host?.lowercased() ?? "")
    }

    func validatesProduct(_ value: String) throws {
        guard allowedProductIDs.contains(value) else {
            throw BridgeError(code: "PRODUCT_NOT_ALLOWED", message: "该商品未在当前版本中开放。")
        }
    }
}

struct BridgeCommand {
    enum Method: String {
        case getProducts, purchase, pendingTransactions, restore, finishTransaction, manageSubscriptions, clearSession
    }
    let method: Method
    let payload: [String: Any]

    init(body: Any) throws {
        guard let envelope = body as? [String: Any],
              Set(envelope.keys).isSubset(of: ["version", "method", "payload"]),
              let version = envelope["version"] as? Int, version == 1,
              let name = envelope["method"] as? String,
              let method = Method(rawValue: name),
              let payload = envelope["payload"] as? [String: Any],
              JSONSerialization.isValidJSONObject(envelope),
              let encoded = try? JSONSerialization.data(withJSONObject: envelope),
              encoded.count <= 8192 else { throw BridgeError.invalidRequest }
        self.method = method
        self.payload = payload
    }

    func productIDs(allowed: Set<String>) throws -> [String] {
        guard let values = payload["productIds"] as? [String],
              !values.isEmpty, values.count <= 4,
              Set(values).count == values.count,
              Set(values).isSubset(of: allowed) else { throw BridgeError.invalidRequest }
        return values
    }

    func purchase(allowed: Set<String>) throws -> (String, UUID) {
        guard let productID = payload["productId"] as? String,
              allowed.contains(productID),
              let value = payload["appAccountToken"] as? String,
              let token = UUID(uuidString: value),
              value.count == 36,
              token != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else {
            throw BridgeError.invalidRequest
        }
        return (productID, token)
    }

    func transactionID() throws -> String {
        guard let value = payload["transactionId"] as? String,
              value.range(of: "^[0-9]{1,32}$", options: .regularExpression) != nil else {
            throw BridgeError.invalidRequest
        }
        return value
    }
}
