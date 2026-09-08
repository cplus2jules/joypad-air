import SwiftUI
import UIKit
import JoypadCore

struct NavigationControls: View {
    let session: ProbeSession

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                button(.minus, "−", "Minus")
                button(.plus, "+", "Plus / pause")
                button(.sl, "SL", "SL")
                button(.sr, "SR", "SR")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { joystick; faceButtons }
                VStack(spacing: 16) { joystick; faceButtons }
            }
            Text("Move with the stick. A selects, B goes back.")
                .font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                button(.dpadLeft, "←", "D-pad left")
                button(.dpadUp, "↑", "D-pad up")
                button(.dpadDown, "↓", "D-pad down")
                button(.dpadRight, "→", "D-pad right")
            }
            DisclosureGroup("Shoulder buttons") {
                HStack(spacing: 10) {
                    button(.l, "L", "Left shoulder")
                    button(.zl, "ZL", "Left trigger")
                    button(.zr, "ZR", "Right trigger")
                    button(.r, "R", "Right shoulder")
                }.padding(.top, 8)
            }.font(.subheadline)
        }.padding(.vertical, 8)
    }

    private var joystick: some View {
        MenuJoystick(enabled: session.controlsEnabled, move: session.moveStick, nudge: session.nudgeStick)
    }

    private var faceButtons: some View {
        VStack(spacing: 4) {
            button(.x, "X", "X").frame(width: 48)
            HStack(spacing: 36) {
                button(.y, "Y", "Y").frame(width: 48)
                button(.a, "A", "A / select").frame(width: 48)
            }
            button(.b, "B", "B / back").frame(width: 48)
        }.frame(width: 132)
    }

    private func button(_ id: ControllerButtonID, _ title: String, _ label: String) -> some View {
        ControllerPressButton(title: title, label: label, identifier: "control-\(id.rawValue)",
                              enabled: session.controlsEnabled,
                              changed: { session.setButton(id, down: $0) },
                              activate: { session.tapButton(id) })
            .frame(minWidth: 44, minHeight: 44, maxHeight: 48)
    }
}

/// UIKit touch cancellation keeps simultaneous shoulder/face/stick input independent of Form scrolling.
struct ControllerPressButton: UIViewRepresentable {
    let title: String
    let label: String
    let identifier: String
    let enabled: Bool
    let changed: (Bool) -> Void
    let activate: () -> Void

    func makeUIView(context: Context) -> TouchButton {
        let button = TouchButton(type: .system)
        button.isExclusiveTouch = false
        button.addTarget(button, action: #selector(TouchButton.press), for: [.touchDown, .touchDragEnter])
        button.addTarget(button, action: #selector(TouchButton.endPress), for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit])
        return button
    }

    func updateUIView(_ button: TouchButton, context: Context) {
        button.changed = changed
        button.activate = activate
        if !enabled { button.endPress() }
        button.isEnabled = enabled
        button.accessibilityLabel = label
        button.accessibilityIdentifier = identifier
        var configuration = UIButton.Configuration.tinted()
        configuration.title = title
        configuration.cornerStyle = .capsule
        configuration.baseForegroundColor = .label
        configuration.baseBackgroundColor = .systemGray3
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var attributes = incoming
            attributes.font = UIFont.preferredFont(forTextStyle: .headline)
            return attributes
        }
        button.configuration = configuration
    }

    static func dismantleUIView(_ button: TouchButton, coordinator: ()) { button.endPress() }

    @MainActor final class TouchButton: UIButton {
        var changed: ((Bool) -> Void)?
        var activate: (() -> Void)?
        private var down = false

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { endPress(); return }
            // Form delays UIKit touchDown while deciding whether to scroll.
            // Deliver game controls immediately; retain normal cancellation
            // when a drag actually turns into scrolling.
            var ancestor = superview
            while let view = ancestor {
                if let scroll = view as? UIScrollView { scroll.delaysContentTouches = false }
                ancestor = view.superview
            }
        }

        @objc func press() {
            guard isEnabled, !down else { return }
            down = true
            changed?(true)
        }
        @objc func endPress() {
            guard down else { return }
            down = false
            changed?(false)
        }
        override func accessibilityActivate() -> Bool {
            guard isEnabled else { return false }
            activate?()
            return true
        }
    }
}
