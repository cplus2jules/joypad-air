/// Keeps short touches visible to a polling game, including distinct rapid taps.
/// Each button has its own queue so a pending release never delays the joystick
/// or another button. Times use the caller's monotonic clock, in seconds.
public struct ButtonPressTiming: Sendable {
    public static let minimumHold = 0.100
    public static let minimumRelease = 0.050
    public enum QueueError: Error { case full }

    private var requestedDown = false
    private var emittedDown = false
    private var changedAt: Double?
    private var pending: [Bool] = []

    public init() {}

    public var hasPending: Bool { !pending.isEmpty }

    public mutating func append(down: Bool) throws {
        guard down != requestedDown else { return }
        guard pending.count < 32 else { throw QueueError.full }
        requestedDown = down
        pending.append(down)
    }

    public func delay(now: Double) -> Double {
        guard hasPending, let changedAt else { return 0 }
        let duration = emittedDown ? Self.minimumHold : Self.minimumRelease
        return max(0, changedAt + duration - now)
    }

    public mutating func pop(now: Double) -> Bool? {
        guard hasPending, delay(now: now) == 0 else { return nil }
        emittedDown = pending.removeFirst()
        changedAt = now
        return emittedDown
    }
}
