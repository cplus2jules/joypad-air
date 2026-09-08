import CoreHaptics
import UIKit

@MainActor
final class ControllerFeedback {
    static let preferenceKey = "controller.haptics.enabled"
    enum Event { case press, selection, success, warning }

    private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private let impact = UIImpactFeedbackGenerator(style: .light)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()
    private var lastPress = -Double.infinity

    func play(_ event: Event) {
        guard supported, UserDefaults.standard.object(forKey: Self.preferenceKey) as? Bool ?? true else { return }
        switch event {
        case .press:
            let now = ProcessInfo.processInfo.systemUptime
            guard now - lastPress >= 0.05 else { return }
            lastPress = now
            impact.impactOccurred(intensity: 0.65)
            impact.prepare()
        case .selection:
            selection.selectionChanged()
            selection.prepare()
        case .success: notification.notificationOccurred(.success)
        case .warning: notification.notificationOccurred(.warning)
        }
    }
}
