import Foundation

public struct Vector3: Codable, Sendable, Equatable {
    public let x: Double
    public let y: Double
    public let z: Double

    public init(_ x: Double, _ y: Double, _ z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    public var magnitude: Double { sqrt(x * x + y * y + z * z) }
    public var isFinite: Bool { x.isFinite && y.isFinite && z.isFinite }
    public var maximumAbsoluteAxis: Double { max(abs(x), abs(y), abs(z)) }
    public static let zero = Vector3(0, 0, 0)
    public static func + (lhs: Self, rhs: Self) -> Self {
        Self(lhs.x + rhs.x, lhs.y + rhs.y, lhs.z + rhs.z)
    }
    public static func * (lhs: Self, rhs: Double) -> Self {
        Self(lhs.x * rhs, lhs.y * rhs, lhs.z * rhs)
    }
}

public enum SampleError: Error, Equatable {
    case invalidTimestamp
    case nonFiniteVector
}

/// Device axes: +x right, +y toward the earpiece, +z out of the screen.
/// No grip transform, steering gain, bias subtraction, or silent clipping occurs here.
public struct MotionSample: Sendable, Equatable {
    public let accelerationG: Vector3
    public let rotationDegreesPerSecond: Vector3
    public let timestampMicroseconds: UInt64
    public static let maximumJSONInteger: Double = 9_007_199_254_740_991

    public init(rotationRadiansPerSecond: Vector3, gravityG: Vector3,
                userAccelerationG: Vector3, timestampSeconds: Double) throws {
        let microseconds = (timestampSeconds * 1_000_000).rounded()
        guard microseconds.isFinite, timestampSeconds >= 0,
              microseconds <= Self.maximumJSONInteger else {
            throw SampleError.invalidTimestamp
        }
        let acceleration = gravityG + userAccelerationG
        let rotation = rotationRadiansPerSecond * (180 / .pi)
        guard gravityG.isFinite, userAccelerationG.isFinite,
              acceleration.isFinite, rotation.isFinite else {
            throw SampleError.nonFiniteVector
        }
        accelerationG = acceleration
        rotationDegreesPerSecond = rotation
        timestampMicroseconds = UInt64(microseconds)
    }

    /// The existing Node validator clips at these limits; report exceedances before sending.
    public var exceedsBridgeRange: Bool {
        accelerationG.maximumAbsoluteAxis > 8 || rotationDegreesPerSecond.maximumAbsoluteAxis > 2000
    }
}

public struct MotionPacket: Encodable, Sendable {
    public let t = "motion"
    public let sessionId: String
    public let seq: UInt64
    public let ts: UInt64
    public let gx: Double
    public let gy: Double
    public let gz: Double
    public let ax: Double
    public let ay: Double
    public let az: Double

    public init(sample: MotionSample, sessionID: UUID, sequence: UInt64) {
        sessionId = sessionID.uuidString
        seq = sequence
        ts = sample.timestampMicroseconds
        gx = sample.rotationDegreesPerSecond.x
        gy = sample.rotationDegreesPerSecond.y
        gz = sample.rotationDegreesPerSecond.z
        ax = sample.accelerationG.x
        ay = sample.accelerationG.y
        az = sample.accelerationG.z
    }
}

/// Recreated for every connection; old or duplicate samples never advance the stream.
public struct SampleSequencer: Sendable {
    public let sessionID: UUID
    public private(set) var sequence: UInt64 = 0
    public private(set) var lastTimestamp: UInt64?

    public init(sessionID: UUID = UUID()) { self.sessionID = sessionID }

    public mutating func packet(for sample: MotionSample) -> MotionPacket? {
        guard lastTimestamp.map({ sample.timestampMicroseconds > $0 }) ?? true else { return nil }
        guard sequence < UInt64(MotionSample.maximumJSONInteger) else { return nil }
        sequence += 1
        lastTimestamp = sample.timestampMicroseconds
        return MotionPacket(sample: sample, sessionID: sessionID, sequence: sequence)
    }
}
