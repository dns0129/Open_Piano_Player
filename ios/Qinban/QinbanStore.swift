import Foundation
import StoreKit
import UIKit

@MainActor
final class QinbanStore {
    private let configuration: AppConfiguration
    private var pending: [String: (transaction: Transaction, jws: String)] = [:]
    private var updates: Task<Void, Never>?
    private var isPresentingStore = false
    var onTransaction: (([String: Any]) -> Void)?

    init(configuration: AppConfiguration) {
        self.configuration = configuration
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self, !Task.isCancelled else { break }
                if let payload = self.capture(result) {
                    self.onTransaction?(payload)
                }
            }
        }
    }

    deinit { updates?.cancel() }

    private func typeName(_ type: Product.ProductType) -> String {
        switch type {
        case .consumable: return "consumable"
        case .autoRenewable: return "autoRenewable"
        case .nonConsumable: return "nonConsumable"
        case .nonRenewable: return "nonRenewable"
        default: return "unknown"
        }
    }

    private func period(_ value: Product.SubscriptionPeriod) -> [String: Any] {
        let unit: String
        switch value.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "unknown"
        }
        return ["value": value.value, "unit": unit]
    }

    private func validateType(_ product: Product) throws {
        try configuration.validatesProduct(product.id)
        let isTopup = product.id == configuration.productIDs["topup"]
        guard (isTopup && product.type == .consumable) ||
                (!isTopup && product.type == .autoRenewable) else {
            throw BridgeError(code: "PRODUCT_CONFIGURATION", message: "商品类型与当前应用配置不一致，请联系支持人员。")
        }
    }

    func products(ids: [String]) async throws -> [String: Any] {
        let values = try await Product.products(for: ids)
        for product in values { try validateType(product) }
        let sorted = ids.compactMap { id in values.first(where: { $0.id == id }) }
        return ["products": sorted.map { product -> [String: Any] in
            var row: [String: Any] = [
                "id": product.id,
                "displayName": product.displayName,
                "description": product.description,
                "displayPrice": product.displayPrice,
                "type": typeName(product.type),
                "subscriptionPeriod": NSNull(),
            ]
            if let subscription = product.subscription {
                row["subscriptionPeriod"] = period(subscription.subscriptionPeriod)
            }
            return row
        }]
    }

    func purchase(productID: String, accountToken: UUID) async throws -> [String: Any] {
        guard !isPresentingStore else {
            throw BridgeError(code: "PURCHASE_BUSY", message: "请先完成当前购买操作。")
        }
        isPresentingStore = true
        defer { isPresentingStore = false }
        try configuration.validatesProduct(productID)
        guard let product = try await Product.products(for: [productID]).first else {
            throw BridgeError(code: "PRODUCT_UNAVAILABLE", message: "商品暂不可购买，请稍后重试。")
        }
        try validateType(product)
        switch try await product.purchase(options: [.appAccountToken(accountToken)]) {
        case .success(let result):
            guard let transaction = capture(result) else {
                throw BridgeError(code: "TRANSACTION_UNVERIFIED", message: "购买暂时无法验证，请稍后恢复购买，不要重复付款。")
            }
            // Acknowledge only after the webpage has received a durable server
            // acceptance for this signed transaction and the signed-in account.
            return ["status": "success", "transaction": transaction]
        case .userCancelled:
            return ["status": "cancelled"]
        case .pending:
            return ["status": "pending"]
        @unknown default:
            throw BridgeError(code: "PURCHASE_UNKNOWN", message: "购买状态尚未确认，请稍后恢复购买，不要重复付款。")
        }
    }

    private func capture(_ result: VerificationResult<Transaction>) -> [String: Any]? {
        guard case .verified(let transaction) = result,
              configuration.allowedProductIDs.contains(transaction.productID) else { return nil }
        let key = String(transaction.id)
        pending[key] = (transaction, result.jwsRepresentation)
        return payload(transaction: transaction, jws: result.jwsRepresentation)
    }

    private func payload(transaction: Transaction, jws: String) -> [String: Any] {
        var value: [String: Any] = [
            "signedTransaction": jws,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
        ]
        if let account = transaction.appAccountToken {
            value["appAccountToken"] = account.uuidString.lowercased()
        }
        return value
    }

    func pendingTransactions() async -> [String: Any] {
        var unverifiedCount = 0
        // currentEntitlements excludes finished consumables. unfinished includes
        // interrupted consumable purchases that have not yet reached the server.
        for await result in Transaction.currentEntitlements {
            if case .unverified = result { unverifiedCount += 1; continue }
            _ = capture(result)
        }
        for await result in Transaction.unfinished {
            if case .unverified = result { unverifiedCount += 1; continue }
            _ = capture(result)
        }
        return [
            "transactions": pending.keys.sorted().compactMap { key in
                pending[key].map { payload(transaction: $0.transaction, jws: $0.jws) }
            },
            "unverifiedCount": unverifiedCount,
        ]
    }

    func restore() async throws -> [String: Any] {
        guard !isPresentingStore else {
            throw BridgeError(code: "PURCHASE_BUSY", message: "请先完成当前购买操作。")
        }
        isPresentingStore = true
        defer { isPresentingStore = false }
        // Explicit button only. Background resumption does not prompt for Apple ID.
        try await AppStore.sync()
        return await pendingTransactions()
    }

    func finish(transactionID: String) async throws -> [String: Any] {
        if pending[transactionID] == nil { _ = await pendingTransactions() }
        guard let item = pending[transactionID] else {
            throw BridgeError(code: "TRANSACTION_NOT_PENDING", message: "未找到待确认交易，请刷新购买记录。")
        }
        await item.transaction.finish()
        pending.removeValue(forKey: transactionID)
        return ["finished": true, "transactionId": transactionID]
    }

    func manageSubscriptions(in scene: UIWindowScene) async throws -> [String: Any] {
        guard !isPresentingStore else {
            throw BridgeError(code: "PURCHASE_BUSY", message: "请先完成当前购买操作。")
        }
        isPresentingStore = true
        defer { isPresentingStore = false }
        try await AppStore.showManageSubscriptions(in: scene)
        return ["opened": true]
    }
}
