import Testing
@testable import JoypadCore

@Test func fastTouchRemainsDownForAPollingGame() throws {
    var input = ButtonPressTiming()
    try input.append(down: true)
    #expect(input.pop(now: 0) == true)
    try input.append(down: false)
    #expect(input.pop(now: 0.005) == nil)
    #expect(input.pop(now: 0.099) == nil)
    #expect(input.pop(now: 0.100) == false)
    #expect(!input.hasPending)
}

@Test func longHoldReleasesImmediatelyAndDoesNotRepeat() throws {
    var input = ButtonPressTiming()
    try input.append(down: true)
    #expect(input.pop(now: 0) == true)
    #expect(input.pop(now: 10) == nil)
    try input.append(down: false)
    #expect(input.pop(now: 10) == false)
}

@Test func repeatedQuickTapsHaveDistinctDownAndUpIntervals() throws {
    var input = ButtonPressTiming()
    for _ in 0..<3 {
        try input.append(down: true)
        try input.append(down: false)
    }
    #expect(input.pop(now: 0) == true)
    #expect(input.pop(now: 0.1) == false)
    #expect(input.pop(now: 0.12) == nil)
    #expect(input.pop(now: 0.151) == true)
    #expect(input.pop(now: 0.252) == false)
    #expect(input.pop(now: 0.303) == true)
    #expect(input.pop(now: 0.404) == false)
    #expect(!input.hasPending)
}

@Test func duplicateTouchEventsDoNotCreateExtraPresses() throws {
    var input = ButtonPressTiming()
    try input.append(down: false)
    #expect(!input.hasPending)
    try input.append(down: true)
    try input.append(down: true)
    try input.append(down: false)
    try input.append(down: false)
    #expect(input.pop(now: 0) == true)
    #expect(input.pop(now: 0.1) == false)
    #expect(!input.hasPending)
}

@Test func stalledDeliveryKeepsIntervalsRelativeToActualEmission() throws {
    var input = ButtonPressTiming()
    try input.append(down: true)
    try input.append(down: false)
    try input.append(down: true)
    #expect(input.pop(now: 10) == true)
    #expect(input.pop(now: 10) == nil)
    #expect(input.pop(now: 11) == false)
    #expect(input.pop(now: 11) == nil)
    #expect(input.pop(now: 11.051) == true)
}

@Test func simultaneousButtonsDoNotDelayOneAnother() throws {
    var a = ButtonPressTiming()
    var b = ButtonPressTiming()
    try a.append(down: true)
    try b.append(down: true)
    #expect(a.pop(now: 0) == true)
    #expect(b.pop(now: 0) == true)
    try a.append(down: false)
    #expect(a.pop(now: 0.1) == false)
    #expect(b.pop(now: 0.1) == nil)
}

@Test func disconnectResetDiscardsEveryPendingTransition() throws {
    var input = ButtonPressTiming()
    try input.append(down: true)
    #expect(input.pop(now: 0) == true)
    try input.append(down: false)
    input = ButtonPressTiming()
    #expect(input.pop(now: 1) == nil)
    try input.append(down: true)
    #expect(input.pop(now: 1) == true)
}

@Test func inputBacklogIsBounded() throws {
    var input = ButtonPressTiming()
    for _ in 0..<16 {
        try input.append(down: true)
        try input.append(down: false)
    }
    #expect(throws: ButtonPressTiming.QueueError.full) { try input.append(down: true) }
}
