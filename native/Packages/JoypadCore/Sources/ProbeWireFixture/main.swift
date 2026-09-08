import Foundation
import JoypadCore

// Deliberate stdout fixture for native/tools/probe-wire-check.mjs, never a physical sensor claim.
let motion = try MotionSample(rotationRadiansPerSecond: Vector3(.pi, 2 * .pi, 3 * .pi),
                              gravityG: Vector3(0, 0, -1), userAccelerationG: Vector3(0.2, -0.4, 0.2),
                              timestampSeconds: 1)
var sequencer = SampleSequencer()
let frames = [
    try bridgeJSON(BridgeConfiguration(motion: true)),
    try bridgeJSON(ButtonPacket(isDown: true)),
    try bridgeJSON(ButtonPacket(isDown: false)),
    try bridgeJSON(sequencer.packet(for: motion)!),
    try bridgeJSON(BridgeConfiguration(motion: false))
]
for frame in frames { print(frame) }
