import XCTest
@testable import Qinban

final class BridgeSecurityTests: XCTestCase {
    private let products = [
        "light": "test.qinban.light",
        "standard": "test.qinban.standard",
        "professional": "test.qinban.professional",
        "topup": "test.qinban.topup",
    ]

    func testOriginMustBeExactHTTPSWithoutCredentialsOrPath() throws {
        let config = try AppConfiguration(origin: "https://music.example.com", productIDs: products)
        XCTAssertTrue(config.trusts(URL(string: "https://music.example.com/account.html")))
        XCTAssertTrue(config.trusts(URL(string: "https://music.example.com:443/subscription.html")))
        for address in [
            "http://music.example.com", "https://music.example.com.attacker.test",
            "https://attacker.test/music.example.com", "https://music.example.com:444",
            "https://user@music.example.com", "javascript:alert(1)", "file:///account.html",
        ] { XCTAssertFalse(config.trusts(URL(string: address)), address) }
        XCTAssertFalse(config.trusts(scheme: "https", host: "attacker.test", port: 443))
        XCTAssertTrue(config.trusts(scheme: "https", host: "music.example.com", port: 0))
        for address in [
            "http://localhost:8793", "https://qinban.example.invalid", "https://music.example.com/app",
            "https://music.example.com?secret=1", "https://u:p@music.example.com",
        ] { XCTAssertThrowsError(try AppConfiguration(origin: address, productIDs: products), address) }
    }

    func testExternalAllowlistDoesNotMatchSuffixesOrCredentials() throws {
        let config = try AppConfiguration(origin: "https://music.example.com", productIDs: products, externalHosts: ["support.apple.com"])
        XCTAssertTrue(config.allowsExternal(URL(string: "https://support.apple.com/help")!))
        XCTAssertFalse(config.allowsExternal(URL(string: "https://support.apple.com.attacker.test/help")!))
        XCTAssertFalse(config.allowsExternal(URL(string: "https://support.apple.com:444/help")!))
        XCTAssertFalse(config.allowsExternal(URL(string: "https://user@support.apple.com/help")!))
    }

    func testSandboxAndProductionCannotShareCookieHostname() throws {
        XCTAssertThrowsError(try AppConfiguration.destinations(
            production: "https://music.example.com",
            sandbox: "https://music.example.com:444",
            products: products,
            selected: .sandbox
        ))
        let sandbox = try AppConfiguration.destinations(
            production: "https://music.example.com",
            sandbox: "https://staging.example.com",
            products: products,
            selected: .sandbox
        )
        XCTAssertTrue(sandbox.trusts(URL(string: "https://staging.example.com/account.html")))
        XCTAssertFalse(sandbox.trusts(URL(string: "https://music.example.com/account.html")))
    }

    func testBridgeRejectsUnknownVersionMethodOrOversizedMessage() {
        XCTAssertThrowsError(try BridgeCommand(body: ["version": 2, "method": "purchase", "payload": [:]]))
        XCTAssertThrowsError(try BridgeCommand(body: ["version": 1, "method": "openURL", "payload": [:]]))
        XCTAssertThrowsError(try BridgeCommand(body: ["version": 1, "method": "purchase", "payload": ["extra": String(repeating: "x", count: 8192)]]))
        XCTAssertThrowsError(try BridgeCommand(body: ["version": 1, "method": "restore", "payload": [:], "origin": "spoofed"]))
    }

    func testPurchasesRequireAllowlistedProductAndNonzeroAccountUUID() throws {
        let allowed = Set(products.values)
        let token = UUID().uuidString
        let command = try BridgeCommand(body: ["version": 1, "method": "purchase", "payload": ["productId": products["topup"]!, "appAccountToken": token]])
        XCTAssertEqual(try command.purchase(allowed: allowed).1, UUID(uuidString: token))
        for invalid in [
            ["productId": "attacker.product", "appAccountToken": token],
            ["productId": products["topup"]!, "appAccountToken": "user-id"],
            ["productId": products["topup"]!, "appAccountToken": "00000000-0000-0000-0000-000000000000"],
        ] {
            let rejected = try BridgeCommand(body: ["version": 1, "method": "purchase", "payload": invalid])
            XCTAssertThrowsError(try rejected.purchase(allowed: allowed))
        }
    }

    func testFinishingRejectsUntrustedTransactionIdentifierFormats() throws {
        for invalid in ["", "../12", "1;delete()", "1.3", String(repeating: "1", count: 33)] {
            let command = try BridgeCommand(body: ["version": 1, "method": "finishTransaction", "payload": ["transactionId": invalid]])
            XCTAssertThrowsError(try command.transactionID())
        }
    }
}
