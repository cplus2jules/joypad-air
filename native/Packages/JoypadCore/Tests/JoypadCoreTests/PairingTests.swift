import Foundation
import Testing
@testable import JoypadCore

private func invitationJSON(changes: [String: Any] = [:]) throws -> Data {
    var fields: [String: Any] = ["v": 1, "id": "00000000-0000-0000-0000-000000000001", "name": "Test Mac",
                               "hosts": ["192.168.1.2", "test-mac.local"], "port": 3443,
                               "fingerprint": String(repeating: "ab", count: 32), "code": "012345", "expiresAt": 2_000_000]
    fields.merge(changes, uniquingKeysWith: { _, new in new })
    return try JSONSerialization.data(withJSONObject: fields)
}
private let testNow = Date(timeIntervalSince1970: 1000)

@Test func pairingAcceptsQRAndCopiedJSON() throws {
    let data = try invitationJSON()
    let base64 = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let qr = try PairingInvitation.parse("joypadair://pair?data=\(base64)", now: testNow)
    #expect(qr == (try PairingInvitation.parse(String(decoding: data, as: UTF8.self), now: testNow)))
    #expect(qr.code == "012345")
}

@Test func pairingRejectsExpiredMalformedOrRemoteInvitations() throws {
    let expired = String(decoding: try invitationJSON(changes: ["expiresAt": 999_000]), as: UTF8.self)
    #expect(throws: PairingError.self) { try PairingInvitation.parse(expired, now: testNow) }
    for changes: [String: Any] in [["v": 2], ["id": "bad"], ["hosts": ["8.8.8.8"]], ["hosts": []],
                                  ["port": 0], ["fingerprint": "bad"], ["code": "12345"], ["code": "a12345"], ["name": ""]] {
        let text = String(decoding: try invitationJSON(changes: changes), as: UTF8.self)
        #expect(throws: PairingError.self) { try PairingInvitation.parse(text, now: testNow) }
    }
    #expect(throws: PairingError.self) { try PairingInvitation.parse("https://example.com", now: testNow) }
    #expect(throws: PairingError.self) { try PairingInvitation.parse(String(repeating: "a", count: 8193), now: testNow) }
}

@Test func savedMacBindsReplyToScannedIdentityAndUsesEncryptedURLs() throws {
    let invitation = try PairingInvitation.parse(String(decoding: invitationJSON(), as: UTF8.self), now: testNow)
    let reply = PairingReply(token: String(repeating: "a", count: 43), id: invitation.id, name: invitation.name,
                             clientID: "00000000-0000-0000-0000-000000000002")
    let mac = try SavedMac(invitation: invitation, reply: reply, connectedHost: "test-mac.local")
    #expect(mac.hosts == ["test-mac.local", "192.168.1.2"])
    let url = try #require(mac.url(host: mac.hosts[0], path: "/controller", websocket: true))
    #expect(url.absoluteString == "wss://test-mac.local:3443/controller")
    #expect(url.user == nil && url.password == nil && url.query == nil)
    let differentMac = PairingReply(token: reply.token, id: reply.clientID, name: reply.name, clientID: reply.clientID)
    #expect(throws: PairingError.self) { try SavedMac(invitation: invitation, reply: differentMac, connectedHost: "test-mac.local") }
    #expect(throws: PairingError.self) { try SavedMac(invitation: invitation, reply: reply, connectedHost: "other.local") }
    let badToken = PairingReply(token: reply.token + "\r\nX-Injected: yes", id: reply.id, name: reply.name, clientID: reply.clientID)
    #expect(throws: PairingError.self) { try SavedMac(invitation: invitation, reply: badToken, connectedHost: "test-mac.local") }
}
