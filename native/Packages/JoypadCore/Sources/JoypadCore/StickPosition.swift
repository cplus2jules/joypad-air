import Foundation

/// Screen coordinates match the existing bridge: positive x is right, positive y is down.
public struct StickPosition: Sendable, Equatable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        guard x.isFinite, y.isFinite else { self = .center; return }
        let length = hypot(x, y)
        let scale = max(1, length)
        self.x = x / scale
        self.y = y / scale
    }

    private init(center: Void) { x = 0; y = 0 }
    public static let center = Self(center: ())
    public static let up = Self(x: 0, y: -1)
    public static let down = Self(x: 0, y: 1)
    public static let left = Self(x: -1, y: 0)
    public static let right = Self(x: 1, y: 0)

    public static func displacement(x: Double, y: Double, radius: Double) -> Self {
        guard radius.isFinite, radius > 0 else { return .center }
        return Self(x: x / radius, y: y / radius)
    }
}

public struct StickPacket: Encodable, Sendable {
    public let t = "stick"
    public let s = "R"
    public let x: Double
    public let y: Double
    public init(position: StickPosition) { x = position.x; y = position.y }
}
