import Foundation

public struct BridgeConfiguration: Encodable, Sendable {
    public let t = "config"
    public let name = "Swift motion probe"
    public let orientation = "portrait"
    public let motionProfile = "just-dance"
    public let motion: Bool
    public init(motion: Bool) { self.motion = motion }
}

public enum ControllerButtonID: String, Codable, Sendable, CaseIterable {
    case a, b, x, y, plus, minus, l, r, zl, zr, sl, sr
    case dpadUp = "dpad_up", dpadDown = "dpad_down", dpadLeft = "dpad_left", dpadRight = "dpad_right"
}

public struct ButtonPacket: Encodable, Sendable {
    public let t = "btn"
    public let k: ControllerButtonID
    public let d: Bool
    public init(button: ControllerButtonID = .a, isDown: Bool) { k = button; d = isDown }
}

public struct PingPacket: Encodable, Sendable {
    public let t = "ping"
    public let ts: Double
    public init(timestampMilliseconds: Double) { ts = timestampMilliseconds }
}

public struct BridgeMessage: Decodable, Sendable {
    public let t: String
    public let player: Int?
    public let motionProfiles: [String]?
    public let motionProfile: String?
    public let orientation: String?
    public let motion: Bool?
    public let native: Bool?
    public let accessibility: Bool?
    public let ts: Double?
    private enum CodingKeys: String, CodingKey {
        case t, player, motionProfiles, motionProfile, orientation, motion, native, accessibility, ts
    }
    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        t = try values.decode(String.self, forKey: .t)
        player = try values.decodeIfPresent(Int.self, forKey: .player)
        motionProfiles = try values.decodeIfPresent([String].self, forKey: .motionProfiles)
        motionProfile = try values.decodeIfPresent(String.self, forKey: .motionProfile)
        orientation = try values.decodeIfPresent(String.self, forKey: .orientation)
        motion = try values.decodeIfPresent(Bool.self, forKey: .motion)
        native = try values.decodeIfPresent(Bool.self, forKey: .native)
        // The Node bridge deliberately returns "unknown" before a permission check.
        accessibility = try? values.decodeIfPresent(Bool.self, forKey: .accessibility)
        ts = try values.decodeIfPresent(Double.self, forKey: .ts)
    }
    public var supportsDance: Bool { motionProfiles?.contains("just-dance") == true }
    public func acknowledges(motion expected: Bool) -> Bool {
        t == "config-ack" && motionProfile == "just-dance" && orientation == "portrait" && motion == expected
    }
}

public enum BridgeEndpoint {
    /// A deliberate private IPv4 or .local address. No path, credentials, query, or public endpoint.
    public static func url(host input: String, port: String) -> URL? {
        let host = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let portNumber = Int(port), (1...65535).contains(portNumber), isLocalHost(host) else { return nil }
        var parts = URLComponents()
        parts.scheme = "ws"
        parts.host = host
        parts.port = portNumber
        parts.path = "/"
        parts.queryItems = [URLQueryItem(name: "p", value: "1")]
        return parts.url
    }

    private static func isLocalHost(_ host: String) -> Bool {
        if host == "localhost" { return true }
        if host.hasSuffix(".local") {
            return host.split(separator: ".", omittingEmptySubsequences: false).allSatisfy { label in
                !label.isEmpty && label.count <= 63 && label.first != "-" && label.last != "-" &&
                label.utf8.allSatisfy { (97...122).contains($0) || (48...57).contains($0) || $0 == 45 }
            }
        }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return false }
        let bytes = parts.compactMap { part -> UInt8? in
            guard !part.isEmpty, part.utf8.allSatisfy({ (48...57).contains($0) }),
                  part.count == 1 || part.first != "0" else { return nil }
            return UInt8(part)
        }
        guard bytes.count == 4 else { return false }
        return bytes[0] == 10 || bytes[0] == 127 ||
            (bytes[0] == 172 && (16...31).contains(bytes[1])) ||
            (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254)
    }
}

public func bridgeJSON<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}
