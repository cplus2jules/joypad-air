import Testing
@testable import JoypadCore

@Test func danceLockDiscardsQueuedTouchesButPreservesConfigurationAndMotion() throws {
    var buffer = OutboundBuffer()
    try buffer.appendControl("config")
    try buffer.appendControl("A down", isControllerInput: true)
    try buffer.appendControl("stick right", isControllerInput: true)
    try buffer.appendControl("ping")
    buffer.replaceMotion("live motion", now: 1)
    buffer.removeControllerInput()
    try buffer.appendControl("A up", isControllerInput: true)
    try buffer.appendControl("stick center", isControllerInput: true)
    #expect(buffer.pop(now: 1.01) == "config")
    #expect(buffer.pop(now: 1.01) == "ping")
    #expect(buffer.pop(now: 1.01) == "A up")
    #expect(buffer.pop(now: 1.01) == "stick center")
    #expect(buffer.pop(now: 1.01) == "live motion")
    #expect(buffer.pop(now: 1.01) == nil)
}

@Test func lockReleasesAnInflightPressEvenWhenItsQueuedReleaseWasDiscarded() throws {
    var buffer = OutboundBuffer()
    try buffer.appendControl("A down", isControllerInput: true)
    #expect(buffer.pop(now: 0) == "A down") // Already selected by the writer.
    try buffer.appendControl("A up", isControllerInput: true)
    try buffer.appendControl("A down", isControllerInput: true) // Rapid second tap.
    buffer.removeControllerInput()
    try buffer.appendControl("A up", isControllerInput: true)
    #expect(buffer.pop(now: 0.01) == "A up")
    #expect(buffer.pop(now: 0.01) == nil)
}
