import CoreMotion
import Foundation
import JoypadCore

@MainActor
final class MotionCapture {
    private let manager = CMMotionManager()
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "JoypadAir.sensor"
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInitiated
        return queue
    }()
    private var continuation: AsyncThrowingStream<MotionSample, Error>.Continuation?
    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    func start() -> AsyncThrowingStream<MotionSample, Error> {
        stop()
        let (stream, continuation) = AsyncThrowingStream<MotionSample, Error>.makeStream(
            bufferingPolicy: .bufferingNewest(1)
        )
        self.continuation = continuation
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        // Core Motion's Objective-C handler is not annotated Sendable. Without
        // this annotation Swift inherits MainActor here and traps on the first
        // callback delivered by the sensor queue on a physical iPhone.
        manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: queue) { @Sendable motion, error in
            if let error { continuation.finish(throwing: error); return }
            guard let motion else { return }
            do {
                // Copy Core Motion objects into Sendable values on the serial callback queue.
                let sample = try MotionSample(
                    rotationRadiansPerSecond: Vector3(motion.rotationRate.x, motion.rotationRate.y, motion.rotationRate.z),
                    gravityG: Vector3(motion.gravity.x, motion.gravity.y, motion.gravity.z),
                    userAccelerationG: Vector3(motion.userAcceleration.x, motion.userAcceleration.y, motion.userAcceleration.z),
                    timestampSeconds: motion.timestamp
                )
                continuation.yield(sample)
            } catch { continuation.finish(throwing: error) }
        }
        return stream
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        continuation?.finish()
        continuation = nil
    }
}
