import Foundation
import Observation
import UIKit
import JoypadCore

@MainActor @Observable
final class ProbeSession {
    private(set) var status = "Disconnected"
    private(set) var notice = "Connect a paired Mac or scan its QR code to start playing."
    private(set) var connected = false
    private(set) var connecting = false
    private(set) var compatible = false
    private(set) var motionEnabled = false
    private(set) var motionPending = false
    private(set) var danceLocked = false
    private(set) var aPressed = false
    private(set) var pressedButtons: Set<ControllerButtonID> = []
    private(set) var sample: MotionSample?
    private(set) var sampleRate = 0.0
    private(set) var maximumGapMilliseconds = 0.0
    private(set) var rangeExceededCount = 0
    private(set) var droppedMotion = 0
    private(set) var roundTripMilliseconds: Double?
    private(set) var samplesSent: UInt64 = 0
    private(set) var keyboardReady = "Unknown"
    private(set) var connectedMacName: String?

    @ObservationIgnored private let capture = MotionCapture()
    @ObservationIgnored private let feedback = ControllerFeedback()
    @ObservationIgnored private var lastSensorArrival: Double?
    @ObservationIgnored private var stickFeedbackEngaged = false
    @ObservationIgnored private var networkSession: URLSession?
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var reader: Task<Void, Never>?
    @ObservationIgnored private var writer: Task<Void, Never>?
    @ObservationIgnored private var heartbeat: Task<Void, Never>?
    @ObservationIgnored private var sensorTask: Task<Void, Never>?
    @ObservationIgnored private var buttonTapTasks: [ControllerButtonID: Task<Void, Never>] = [:]
    @ObservationIgnored private var buttonReleaseTasks: [ControllerButtonID: Task<Void, Never>] = [:]
    @ObservationIgnored private var buttonTiming: [ControllerButtonID: ButtonPressTiming] = [:]
    @ObservationIgnored private var stickTapTask: Task<Void, Never>?
    @ObservationIgnored private var stickPosition = StickPosition.center
    @ObservationIgnored private var connectionID = UUID()
    @ObservationIgnored private var motionID = UUID()
    @ObservationIgnored private var sequencer = SampleSequencer()
    @ObservationIgnored private var buffer = OutboundBuffer()
    @ObservationIgnored private var connectionStarted = 0.0
    @ObservationIgnored private var lastPong = 0.0
    @ObservationIgnored private var pendingMotion: Bool?
    @ObservationIgnored private var configRequestedAt = 0.0
    @ObservationIgnored private var sendingSince: Double?
    @ObservationIgnored private var lastDisplay = 0.0
    @ObservationIgnored private var rateStart: UInt64?
    @ObservationIgnored private var rateSamples = 0
    @ObservationIgnored private var previousSampleTimestamp: UInt64?
    @ObservationIgnored private var measuredMaximumGap = 0.0
    @ObservationIgnored private var rangeExceeded = 0
    @ObservationIgnored private var sentCount: UInt64 = 0

    var sensorAvailable: Bool { capture.isAvailable }
    var controlsEnabled: Bool { connected && !danceLocked }
    var motionIsFresh: Bool {
        connected && motionEnabled && lastSensorArrival.map { now - $0 < 0.25 } == true
    }
    private var now: Double { ProcessInfo.processInfo.systemUptime }

    func connect(host: String, port: String) {
        guard let url = BridgeEndpoint.url(host: host, port: port) else {
            disconnect()
            notice = "Use a private IPv4 address or a .local hostname, and port 1–65535."
            return
        }
        beginConnection(request: URLRequest(url: url), using: URLSession(configuration: .ephemeral), name: nil)
    }

    func connect(to mac: SavedMac, host: String) {
        guard let url = mac.url(host: host, path: "/controller", websocket: true) else { return }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(mac.token)", forHTTPHeaderField: "Authorization")
        beginConnection(request: request, using: PairingTransport.session(fingerprint: mac.fingerprint), name: mac.name)
    }

    private func beginConnection(request: URLRequest, using urlSession: URLSession, name: String?) {
        disconnect()
        networkSession = urlSession
        connectedMacName = name
        let id = UUID()
        connectionID = id
        sequencer = SampleSequencer(sessionID: id)
        resetDiagnostics()
        connectionStarted = now
        lastPong = now
        connecting = true
        status = "Connecting…"
        notice = "Waiting for the Mac bridge."
        let socket = urlSession.webSocketTask(with: request)
        socket.maximumMessageSize = 65_536
        self.socket = socket
        socket.resume()
        reader = Task { [weak self] in
            do {
                while !Task.isCancelled {
                    let frame = try await socket.receive()
                    guard let self, self.connectionID == id else { return }
                    let data: Data
                    switch frame {
                    case .string(let text): data = Data(text.utf8)
                    case .data(let bytes): data = bytes
                    @unknown default: continue
                    }
                    let message = try JSONDecoder().decode(BridgeMessage.self, from: data)
                    self.receive(message)
                }
            } catch {
                guard let self, self.connectionID == id, !Task.isCancelled else { return }
                let reason: String
                if socket.closeCode.rawValue == 4000 {
                    reason = "Another controller took Player 1. Connect again when ready."
                } else if socket.closeCode.rawValue == 4001 || (socket.response as? HTTPURLResponse)?.statusCode == 401 {
                    reason = "This pairing was removed on the Mac. Forget this Mac and scan its QR code again."
                } else {
                    reason = "Connection closed: \(error.localizedDescription)"
                }
                self.disconnect(reason: reason)
            }
        }
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                guard let self, self.connectionID == id else { return }
                if !self.connected {
                    if self.now - self.connectionStarted > 5 {
                        self.disconnect(reason: "No bridge reply. Check its address, port, and Local Network access.")
                    }
                    continue
                }
                if self.now - self.lastPong > 2 {
                    self.disconnect(reason: "The bridge stopped responding. Reconnect to start a fresh session.")
                    return
                }
                if let since = self.sendingSince, self.now - since > 1 {
                    self.disconnect(reason: "Sending stalled. Old motion was discarded; reconnect to continue.")
                    return
                }
                if self.pendingMotion != nil, self.now - self.configRequestedAt > 2 {
                    self.disconnect(reason: "The bridge did not acknowledge the dance profile. Update and restart the bridge.")
                    return
                }
                self.enqueue(PingPacket(timestampMilliseconds: self.now * 1000))
            }
        }
    }

    func disconnect(reason: String = "Disconnected. Inputs released.") {
        if danceLocked { feedback.play(.warning) }
        danceLocked = false
        connectionID = UUID() // Invalidate every callback before cancellation or a new connection.
        stopCapture()
        reader?.cancel(); reader = nil
        writer?.cancel(); writer = nil
        heartbeat?.cancel(); heartbeat = nil
        buttonTapTasks.values.forEach { $0.cancel() }; buttonTapTasks.removeAll()
        buttonReleaseTasks.values.forEach { $0.cancel() }; buttonReleaseTasks.removeAll()
        buttonTiming.removeAll()
        pressedButtons.removeAll()
        stickTapTask?.cancel(); stickTapTask = nil
        stickPosition = .center
        stickFeedbackEngaged = false
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        networkSession?.invalidateAndCancel(); networkSession = nil
        connectedMacName = nil
        buffer = OutboundBuffer()
        pendingMotion = nil
        sendingSince = nil
        connected = false
        connecting = false
        compatible = false
        aPressed = false
        motionPending = false
        roundTripMilliseconds = nil
        keyboardReady = "Unknown"
        status = "Disconnected"
        notice = reason
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func setMotion(_ enabled: Bool) {
        guard connected, compatible, !motionPending, !danceLocked else { return }
        guard !enabled || capture.isAvailable else {
            notice = "Device motion is unavailable. Use a physical iPhone for sensor testing."
            return
        }
        if !enabled { stopCapture(); feedback.play(.selection) }
        requestConfiguration(motion: enabled)
    }

    func lockForDance() {
        guard connected, motionEnabled, !motionPending, !danceLocked else { return }
        danceLocked = true // Close the input gate before any UIKit cancellation callback.
        let buttonsToRelease = Array(buttonTiming.keys)
        buttonTapTasks.values.forEach { $0.cancel() }; buttonTapTasks.removeAll()
        buttonReleaseTasks.values.forEach { $0.cancel() }; buttonReleaseTasks.removeAll()
        buttonTiming.removeAll()
        pressedButtons.removeAll()
        aPressed = false
        stickTapTask?.cancel(); stickTapTask = nil
        stickPosition = .center
        stickFeedbackEngaged = false
        buffer.removeControllerInput()
        // A send already in flight stays before these releases in the one writer.
        // Release every button used in this connection: its queued UP may have
        // just been discarded even if the physical finger is already lifted.
        for button in buttonsToRelease { enqueue(ButtonPacket(button: button, isDown: false)) }
        enqueue(StickPacket(position: .center))
        if connected { feedback.play(.success) }
    }

    func unlockControls() {
        guard danceLocked else { return }
        danceLocked = false
        feedback.play(.selection)
    }

    func previewHaptics() { feedback.play(.press) }

    func setButton(_ button: ControllerButtonID, down: Bool) {
        buttonTapTasks.removeValue(forKey: button)?.cancel()
        guard controlsEnabled, pressedButtons.contains(button) != down else { return }
        if down { pressedButtons.insert(button) } else { pressedButtons.remove(button) }
        aPressed = pressedButtons.contains(.a)
        do { try buttonTiming[button, default: ButtonPressTiming()].append(down: down) }
        catch { disconnect(reason: "Too many button presses queued. Reconnect to clear the session."); return }
        drainButton(button)
        if down, connected { feedback.play(.press) }
    }

    private func drainButton(_ button: ControllerButtonID) {
        guard controlsEnabled, buttonReleaseTasks[button] == nil else { return }
        if let down = buttonTiming[button]?.pop(now: now) {
            enqueue(ButtonPacket(button: button, isDown: down))
        }
        guard connected, let timing = buttonTiming[button], timing.hasPending else { return }
        let delay = timing.delay(now: now)
        let id = connectionID
        buttonReleaseTasks[button] = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard let self, self.connectionID == id else { return }
            self.buttonReleaseTasks[button] = nil
            self.drainButton(button)
        }
    }

    /// VoiceOver activation supplies a complete tap; ordinary touches support simultaneous holds.
    func tapButton(_ button: ControllerButtonID) {
        guard controlsEnabled, !pressedButtons.contains(button) else { return }
        setButton(button, down: true)
        let id = connectionID
        buttonTapTasks[button] = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
            guard let self, self.connectionID == id else { return }
            self.buttonTapTasks[button] = nil
            self.setButton(button, down: false)
        }
    }

    func moveStick(_ position: StickPosition) {
        stickTapTask?.cancel(); stickTapTask = nil
        guard controlsEnabled, position != stickPosition else { return }
        stickPosition = position
        let magnitude = hypot(position.x, position.y)
        if magnitude >= 0.55, !stickFeedbackEngaged {
            stickFeedbackEngaged = true
            feedback.play(.selection)
        } else if magnitude <= 0.4 { stickFeedbackEngaged = false }
        enqueue(StickPacket(position: position))
    }

    /// VoiceOver can issue a short direction without requiring a continuous drag.
    func nudgeStick(_ position: StickPosition) {
        guard controlsEnabled else { return }
        moveStick(position)
        let id = connectionID
        stickTapTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(180)) } catch { return }
            guard let self, self.connectionID == id else { return }
            self.stickTapTask = nil
            self.moveStick(.center)
        }
    }

    private func receive(_ message: BridgeMessage) {
        switch message.t {
        case "hello":
            guard message.player == 1, !connected else { return }
            connected = true
            connecting = false
            compatible = message.supportsDance
            lastPong = now
            status = "Connected · Player 1"
            feedback.play(.success)
            keyboardReady = message.native == true && message.accessibility == true ? "Available; focus Ryujinx" : "Check Mac Accessibility / keyboard backend"
            UIApplication.shared.isIdleTimerDisabled = true
            if compatible { requestConfiguration(motion: false) }
            else { notice = "This bridge needs the dance-profile update. The A-button test is still available." }
        case "config-ack":
            guard let expected = pendingMotion else { return }
            guard message.acknowledges(motion: expected) else {
                disconnect(reason: "The bridge selected a different motion profile. Update the bridge before testing.")
                return
            }
            pendingMotion = nil
            motionPending = false
            if expected { startCapture() }
            else { notice = "Dance profile acknowledged. Enable motion when ready." }
        case "pong":
            guard let timestamp = message.ts, timestamp.isFinite else { return }
            let roundTrip = now * 1000 - timestamp
            guard roundTrip >= 0, roundTrip < 10_000 else { return }
            lastPong = now
            roundTripMilliseconds = roundTrip
        default: break
        }
    }

    private func requestConfiguration(motion: Bool) {
        pendingMotion = motion
        motionPending = true
        configRequestedAt = now
        enqueue(BridgeConfiguration(motion: motion))
    }

    private func startCapture() {
        stopCapture()
        guard capture.isAvailable else {
            notice = "Device motion is unavailable on this device."
            requestConfiguration(motion: false)
            return
        }
        motionEnabled = true
        feedback.play(.success)
        notice = "Hold upright in your right hand, top toward your fingertips. Grip mapping awaits physical validation."
        let id = connectionID
        let captureID = UUID()
        motionID = captureID
        let samples = capture.start()
        sensorTask = Task { [weak self] in
            do {
                for try await sample in samples {
                    guard let self, !Task.isCancelled, self.connectionID == id, self.motionID == captureID else { return }
                    self.consume(sample)
                }
            } catch {
                guard let self, self.connectionID == id, self.motionID == captureID else { return }
                self.disconnect(reason: "Motion stopped: \(error.localizedDescription)")
            }
        }
    }

    private func stopCapture() {
        motionID = UUID()
        capture.stop()
        sensorTask?.cancel(); sensorTask = nil
        motionEnabled = false
        lastSensorArrival = nil
        sample = nil
        buffer.removeMotion()
        previousSampleTimestamp = nil
        rateStart = nil
        rateSamples = 0
        sampleRate = 0
    }

    private func consume(_ sample: MotionSample) {
        guard let packet = sequencer.packet(for: sample) else { return }
        lastSensorArrival = now
        if sample.exceedsBridgeRange { rangeExceeded += 1 }
        if let previous = previousSampleTimestamp {
            measuredMaximumGap = max(measuredMaximumGap, Double(sample.timestampMicroseconds - previous) / 1000)
        }
        previousSampleTimestamp = sample.timestampMicroseconds
        if rateStart == nil { rateStart = sample.timestampMicroseconds }
        rateSamples += 1
        do {
            buffer.replaceMotion(try bridgeJSON(packet), now: now)
            startWriter()
        } catch { disconnect(reason: "Could not encode motion: \(error.localizedDescription)"); return }
        if now - lastDisplay >= 0.2 {
            self.sample = sample
            maximumGapMilliseconds = measuredMaximumGap
            rangeExceededCount = rangeExceeded
            droppedMotion = buffer.discardedMotion
            samplesSent = sentCount
            if let start = rateStart, sample.timestampMicroseconds > start {
                sampleRate = Double(rateSamples - 1) * 1_000_000 / Double(sample.timestampMicroseconds - start)
            }
            lastDisplay = now
        }
    }

    private func enqueue<T: Encodable>(_ packet: T) {
        guard connected else { return }
        do {
            try buffer.appendControl(bridgeJSON(packet), isControllerInput: packet is ButtonPacket || packet is StickPacket)
            startWriter()
        } catch { disconnect(reason: "The control queue filled. Reconnect to clear the session.") }
    }

    private func startWriter() {
        guard writer == nil, let socket else { return }
        let id = connectionID
        writer = Task { [weak self] in
            guard let self else { return }
            do {
                while !Task.isCancelled, self.connectionID == id, let text = self.buffer.pop(now: self.now) {
                    self.sendingSince = self.now
                    try await socket.send(.string(text))
                    guard self.connectionID == id else { return }
                    self.sendingSince = nil
                    if text.contains("\"t\":\"motion\"") { self.sentCount += 1 }
                }
                if self.connectionID == id { self.writer = nil }
            } catch {
                guard self.connectionID == id, !Task.isCancelled else { return }
                self.disconnect(reason: "Send failed: \(error.localizedDescription)")
            }
        }
    }

    private func resetDiagnostics() {
        sample = nil
        sampleRate = 0
        maximumGapMilliseconds = 0
        rangeExceededCount = 0
        droppedMotion = 0
        samplesSent = 0
        lastDisplay = 0
        measuredMaximumGap = 0
        rangeExceeded = 0
        sentCount = 0
    }
}
