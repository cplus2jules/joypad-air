import Foundation
import Testing
@testable import JoypadCore

private func sample(time: Double = 1, gyro: Vector3 = .zero,
                    gravity: Vector3 = Vector3(0, 0, -1), user: Vector3 = .zero) throws -> MotionSample {
    try MotionSample(rotationRadiansPerSecond: gyro, gravityG: gravity,
                     userAccelerationG: user, timestampSeconds: time)
}

@Test func radiansBecomeDegreesWithoutChangingAxes() throws {
    let result = try sample(gyro: Vector3(.pi, -.pi / 2, .pi * 2))
    #expect(result.rotationDegreesPerSecond == Vector3(180, -90, 360))
}

@Test(arguments: [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 1, 0),
                   Vector3(0, -1, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)])
func allSixStationaryFacesPreserveGravity(gravity: Vector3) throws {
    let result = try sample(gravity: gravity)
    #expect(result.accelerationG == gravity)
    #expect(result.accelerationG.magnitude == 1)
    #expect(result.rotationDegreesPerSecond == .zero)
}

@Test func linearAccelerationAddsToGravityInG() throws {
    let result = try sample(gravity: Vector3(0, -1, 0), user: Vector3(0.2, 0.3, -0.4))
    #expect(result.accelerationG == Vector3(0.2, -0.7, -0.4))
}

@Test func sensorTimeBecomesIntegerMicroseconds() throws {
    #expect(try sample(time: 1234.567891).timestampMicroseconds == 1_234_567_891)
    #expect(try sample(time: 0).timestampMicroseconds == 0)
}

@Test(arguments: [-1.0, Double.nan, Double.infinity, 1e100, MotionSample.maximumJSONInteger])
func invalidSensorTimeCannotReachJSON(time: Double) {
    #expect(throws: SampleError.invalidTimestamp) { try sample(time: time) }
}

@Test func nonFiniteMotionIsRejected() {
    #expect(throws: SampleError.nonFiniteVector) { try sample(gyro: Vector3(.nan, 0, 0)) }
    #expect(throws: SampleError.nonFiniteVector) { try sample(gravity: Vector3(0, .infinity, 0)) }
}

@Test func strongMovementIsReportedWithoutSilentClipping() throws {
    let result = try sample(gyro: Vector3(40, 0, 0), user: Vector3(9, 0, 0))
    #expect(result.exceedsBridgeRange)
    #expect(result.accelerationG.x == 9)
    #expect(result.rotationDegreesPerSecond.x > 2000)
    #expect(try !sample().exceedsBridgeRange)
}

@Test func reconnectResetsSequenceAndIdentity() throws {
    var first = SampleSequencer()
    #expect(first.packet(for: try sample(time: 9))?.seq == 1)
    #expect(first.packet(for: try sample(time: 9)) == nil)
    #expect(first.packet(for: try sample(time: 8)) == nil)
    #expect(first.packet(for: try sample(time: 10))?.seq == 2)
    let firstID = first.sessionID
    first = SampleSequencer()
    #expect(first.sessionID != firstID)
    #expect(first.packet(for: try sample(time: 1))?.seq == 1)
}

@Test func encodedMotionMatchesTheNodeWireContract() throws {
    let id = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    let packet = MotionPacket(sample: try sample(time: 1, gyro: Vector3(.pi, 0, 0)), sessionID: id, sequence: 7)
    let json = try bridgeJSON(packet)
    #expect(json == "{\"ax\":0,\"ay\":0,\"az\":-1,\"gx\":180,\"gy\":0,\"gz\":0,\"seq\":7,\"sessionId\":\"00000000-0000-0000-0000-000000000001\",\"t\":\"motion\",\"ts\":1000000}")
}

@Test func exactProfileAcknowledgmentIsRequired() throws {
    let decoder = JSONDecoder()
    let good = try decoder.decode(BridgeMessage.self, from: Data("{\"t\":\"config-ack\",\"motionProfile\":\"just-dance\",\"orientation\":\"portrait\",\"motion\":true}".utf8))
    #expect(good.acknowledges(motion: true))
    #expect(!good.acknowledges(motion: false))
    let old = try decoder.decode(BridgeMessage.self, from: Data("{\"t\":\"hello\",\"player\":1}".utf8))
    #expect(!old.supportsDance)
    #expect(!old.acknowledges(motion: true))
    let supported = try decoder.decode(BridgeMessage.self, from: Data("{\"t\":\"hello\",\"motionProfiles\":[\"just-dance\"]}".utf8))
    #expect(supported.supportsDance)
}

@Test func bridgeUnknownAccessibilityDoesNotRejectHandshake() throws {
    let data = Data("{\"t\":\"hello\",\"player\":1,\"native\":false,\"accessibility\":\"unknown\",\"motionProfiles\":[\"just-dance\"]}".utf8)
    let message = try JSONDecoder().decode(BridgeMessage.self, from: data)
    #expect(message.player == 1)
    #expect(message.accessibility == nil)
    #expect(message.supportsDance)
}

@Test(arguments: ["192.168.1.5", "10.2.3.4", "172.20.10.2", "169.254.1.1", "127.0.0.1", "macbook-air.local"])
func acceptsLocalEndpoints(host: String) throws {
    let url = try #require(BridgeEndpoint.url(host: host, port: "3001"))
    #expect(url.scheme == "ws")
    #expect(url.query == "p=1")
    #expect(url.port == 3001)
}

@Test(arguments: ["https://192.168.1.1", "8.8.8.8", "example.com", "user@mac.local", "mac.local/path",
                   "mac..local", "172.32.0.1", "192.168.999.1", "010.0.0.1", "", "a.local?x=1"])
func rejectsMalformedAndPublicEndpoints(host: String) {
    #expect(BridgeEndpoint.url(host: host, port: "3001") == nil)
}

@Test func rejectsInvalidPorts() {
    #expect(BridgeEndpoint.url(host: "localhost", port: "0") == nil)
    #expect(BridgeEndpoint.url(host: "localhost", port: "65536") == nil)
}

@Test func queuedButtonTapSurvivesMotionCoalescing() throws {
    var buffer = OutboundBuffer()
    try buffer.appendControl("down")
    buffer.replaceMotion("old", now: 1)
    try buffer.appendControl("up")
    buffer.replaceMotion("fresh", now: 1.01)
    #expect(buffer.count == 3)
    #expect(buffer.discardedMotion == 1)
    #expect(buffer.pop(now: 1.02) == "down")
    #expect(buffer.pop(now: 1.02) == "up")
    #expect(buffer.pop(now: 1.02) == "fresh")
    #expect(buffer.pop(now: 1.02) == nil)
}

@Test func staleMotionAndDisableCannotReplay() throws {
    var buffer = OutboundBuffer()
    buffer.replaceMotion("stale", now: 1)
    #expect(buffer.pop(now: 1.2) == nil)
    buffer.replaceMotion("disabled", now: 2)
    buffer.removeMotion()
    #expect(buffer.pop(now: 2) == nil)
    #expect(buffer.discardedMotion == 2)
}

@Test func controlBufferHasAHardLimit() throws {
    var buffer = OutboundBuffer(capacity: 2)
    try buffer.appendControl("down")
    try buffer.appendControl("up")
    #expect(throws: OutboundBuffer.BufferError.full) { try buffer.appendControl("extra") }
    #expect(buffer.pop(now: 0) == "down")
    #expect(buffer.pop(now: 0) == "up")
}

@Test func joystickClampsRadiallyAndPreservesScreenDirections() {
    #expect(StickPosition.displacement(x: 0, y: -52, radius: 52) == .up)
    #expect(StickPosition.displacement(x: 104, y: 0, radius: 52) == .right)
    let diagonal = StickPosition(x: 3, y: 4)
    #expect(abs(diagonal.x - 0.6) < 1e-10)
    #expect(abs(diagonal.y - 0.8) < 1e-10)
    #expect(StickPosition(x: .nan, y: 1) == .center)
    #expect(StickPosition.displacement(x: 5, y: 5, radius: 0) == .center)
}

@Test func joystickUsesRightJoyConAndReleaseIsExplicit() throws {
    #expect(try bridgeJSON(StickPacket(position: .up)) == "{\"s\":\"R\",\"t\":\"stick\",\"x\":0,\"y\":-1}")
    #expect(try bridgeJSON(StickPacket(position: .center)) == "{\"s\":\"R\",\"t\":\"stick\",\"x\":0,\"y\":0}")
}

@Test(arguments: ControllerButtonID.allCases)
func navigationButtonsHaveStableWireIdentifiers(button: ControllerButtonID) throws {
    let data = Data(try bridgeJSON(ButtonPacket(button: button, isDown: true)).utf8)
    let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(json["k"] as? String == button.rawValue)
    #expect(json["d"] as? Bool == true)
}
