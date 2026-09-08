import Foundation

public enum PairingError: Error, LocalizedError, Sendable {
    case invalidInvitation
    case expiredInvitation
    case unavailable(String)
    case keychain(Int32)

    public var errorDescription: String? {
        switch self {
        case .invalidInvitation: "This is not a valid Joypad Air pairing code. Scan the QR shown on your Mac."
        case .expiredInvitation: "This QR code expired. Generate a new code on the Mac and scan again."
        case .unavailable(let message): message
        case .keychain: "The pairing could not be saved securely. Unlock your iPhone and try again."
        }
    }
}

public struct PairingInvitation: Codable, Sendable, Equatable, Identifiable {
    public let v: Int
    public let id: String
    public let name: String
    public let hosts: [String]
    public let port: Int
    public let fingerprint: String
    public let code: String
    public let expiresAt: Double

    public static func parse(_ text: String, now: Date = Date()) throws -> Self {
        let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard input.utf8.count <= 8192 else { throw PairingError.invalidInvitation }
        let data: Data
        if input.hasPrefix("{") { data = Data(input.utf8) }
        else {
            guard let components = URLComponents(string: input), components.scheme == "joypadair", components.host == "pair",
                  let payload = components.queryItems?.first(where: { $0.name == "data" })?.value else { throw PairingError.invalidInvitation }
            let base64 = payload.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            guard let decoded = Data(base64Encoded: base64 + String(repeating: "=", count: (4 - base64.count % 4) % 4)) else { throw PairingError.invalidInvitation }
            data = decoded
        }
        guard let value = try? JSONDecoder().decode(Self.self, from: data), value.v == 1,
              UUID(uuidString: value.id) != nil, !value.name.isEmpty, value.name.count <= 64,
              (1...8).contains(value.hosts.count), (1...65535).contains(value.port),
              value.hosts.allSatisfy({ BridgeEndpoint.url(host: $0, port: String(value.port)) != nil }),
              value.fingerprint.utf8.count == 64,
              value.fingerprint.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) || (65...70).contains($0) }),
              value.code.utf8.count == 6, value.code.utf8.allSatisfy({ (48...57).contains($0) }),
              value.expiresAt.isFinite else { throw PairingError.invalidInvitation }
        guard value.expiresAt > now.timeIntervalSince1970 * 1000 else { throw PairingError.expiredInvitation }
        return value
    }
}

public struct SavedMac: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public var hosts: [String]
    public let port: Int
    public let fingerprint: String
    public let token: String
    public let clientID: String
    public let pairedAt: Date

    public init(invitation: PairingInvitation, reply: PairingReply, connectedHost: String) throws {
        guard reply.id == invitation.id, invitation.hosts.contains(connectedHost),
              (20...128).contains(reply.token.utf8.count),
              reply.token.utf8.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95 }),
              UUID(uuidString: reply.clientID) != nil,
              !reply.name.isEmpty, reply.name.count <= 64 else { throw PairingError.invalidInvitation }
        id = invitation.id
        name = reply.name
        hosts = [connectedHost] + invitation.hosts.filter { $0 != connectedHost }
        port = invitation.port
        fingerprint = invitation.fingerprint.lowercased()
        token = reply.token
        clientID = reply.clientID
        pairedAt = Date()
    }

    public func url(host: String, path: String, websocket: Bool = false) -> URL? {
        guard let base = BridgeEndpoint.url(host: host, port: String(port)), var url = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        url.scheme = websocket ? "wss" : "https"
        url.path = path
        url.query = nil
        return url.url
    }
}

public struct PairingReply: Codable, Sendable {
    public let token: String
    public let id: String
    public let name: String
    public let clientID: String
}
