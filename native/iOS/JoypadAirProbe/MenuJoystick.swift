import SwiftUI
import UIKit
import JoypadCore

struct MenuJoystick: View {
    let enabled: Bool
    let move: (StickPosition) -> Void
    let nudge: (StickPosition) -> Void
    @State private var position = StickPosition.center
    @State private var touching = false

    private let diameter = 176.0
    private let travel = 52.0

    var body: some View {
        ZStack {
            Circle().fill(.secondary.opacity(0.10))
            Circle().strokeBorder(.secondary.opacity(0.25), lineWidth: 1)
            Image(systemName: "chevron.up").offset(y: -68)
            Image(systemName: "chevron.down").offset(y: 68)
            Image(systemName: "chevron.left").offset(x: -68)
            Image(systemName: "chevron.right").offset(x: 68)
            Circle()
                .fill(enabled && touching ? Color.accentColor : Color(uiColor: .secondarySystemGroupedBackground))
                .overlay(Circle().strokeBorder(.secondary.opacity(0.35), lineWidth: 1))
                .overlay(Image(systemName: "plus").foregroundStyle(enabled && touching ? .white : .secondary))
                .frame(width: 64, height: 64)
                .offset(x: position.x * travel, y: position.y * travel)
                .accessibilityHidden(true)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .frame(width: diameter, height: diameter)
        .contentShape(Circle())
        .opacity(enabled ? 1 : 0.45)
        .overlay {
            JoystickTouchSurface(enabled: enabled, travel: travel, changed: { value in
                touching = true
                position = value
                move(value)
            }, ended: release)
            .accessibilityHidden(true)
        }
        .onChange(of: enabled) { _, active in if !active { release() } }
        .onDisappear { release() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Menu joystick")
        .accessibilityValue(enabled ? (touching ? "Moving" : "Centered") : "Disconnected")
        .accessibilityHint("Drag to navigate. Lift your finger to stop. Actions move one direction briefly.")
        .accessibilityIdentifier("menuJoystick")
        .accessibilityAction(named: Text("Move up")) { if enabled { nudge(.up) } }
        .accessibilityAction(named: Text("Move down")) { if enabled { nudge(.down) } }
        .accessibilityAction(named: Text("Move left")) { if enabled { nudge(.left) } }
        .accessibilityAction(named: Text("Move right")) { if enabled { nudge(.right) } }
        .accessibilityAction(named: Text("Release joystick")) { release() }
    }

    private func release() {
        touching = false
        position = .center
        move(.center)
    }
}

/// UIControl owns one touch throughout a hold. A second finger on a button
/// must neither move the stick's reference point nor end the first finger's hold.
private struct JoystickTouchSurface: UIViewRepresentable {
    let enabled: Bool
    let travel: Double
    let changed: (StickPosition) -> Void
    let ended: () -> Void

    func makeUIView(context: Context) -> TouchControl {
        let control = TouchControl()
        control.isExclusiveTouch = false
        control.isMultipleTouchEnabled = false
        return control
    }

    func updateUIView(_ control: TouchControl, context: Context) {
        control.changed = changed
        control.ended = ended
        control.travel = travel
        if !enabled { control.finishTracking() }
        control.isEnabled = enabled
    }

    static func dismantleUIView(_ control: TouchControl, coordinator: ()) { control.finishTracking() }

    @MainActor final class TouchControl: UIControl {
        var changed: ((StickPosition) -> Void)?
        var ended: (() -> Void)?
        var travel = 52.0
        private var controllingTouch: UITouch?

        override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
            hypot(point.x - bounds.midX, point.y - bounds.midY) <= min(bounds.width, bounds.height) / 2
        }

        override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
            guard isEnabled, controllingTouch == nil else { return false }
            controllingTouch = touch
            updatePosition(touch)
            return true
        }

        override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
            guard touch === controllingTouch else { return false }
            updatePosition(touch)
            return true
        }

        override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
            if touch == nil || touch === controllingTouch { finishTracking() }
        }

        override func cancelTracking(with event: UIEvent?) { finishTracking() }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if window == nil { finishTracking() }
        }

        func finishTracking() {
            guard controllingTouch != nil else { return }
            controllingTouch = nil
            ended?()
        }

        private func updatePosition(_ touch: UITouch) {
            let point = touch.location(in: self)
            changed?(.displacement(x: point.x - bounds.midX, y: point.y - bounds.midY, radius: travel))
        }
    }
}
