import Foundation

/// Reliable events retain FIFO order. Only the newest unsent motion can survive a slow writer.
public struct OutboundBuffer: Sendable {
    public enum BufferError: Error { case full }
    private struct Control: Sendable {
        let text: String
        let isControllerInput: Bool
    }
    private var controls: [Control] = []
    private var motion: (text: String, queuedAt: TimeInterval)?
    public let capacity: Int
    public let maximumMotionAge: TimeInterval
    public private(set) var discardedMotion = 0

    public init(capacity: Int = 32, maximumMotionAge: TimeInterval = 0.1) {
        self.capacity = capacity
        self.maximumMotionAge = maximumMotionAge
    }
    public var count: Int { controls.count + (motion == nil ? 0 : 1) }
    public mutating func appendControl(_ text: String, isControllerInput: Bool = false) throws {
        guard controls.count < capacity else { throw BufferError.full }
        controls.append(Control(text: text, isControllerInput: isControllerInput))
    }
    /// Dance Lock cancels pending touches, while configuration, heartbeat and motion survive.
    public mutating func removeControllerInput() { controls.removeAll { $0.isControllerInput } }
    public mutating func replaceMotion(_ text: String, now: TimeInterval) {
        if motion != nil { discardedMotion += 1 }
        motion = (text, now)
    }
    public mutating func removeMotion() {
        if motion != nil { discardedMotion += 1 }
        motion = nil
    }
    public mutating func pop(now: TimeInterval) -> String? {
        if !controls.isEmpty { return controls.removeFirst().text }
        guard let next = motion else { return nil }
        motion = nil
        guard now >= next.queuedAt, now - next.queuedAt <= maximumMotionAge else {
            discardedMotion += 1
            return nil
        }
        return next.text
    }
}
