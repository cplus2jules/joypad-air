import SwiftUI

@main
struct JoypadAirProbeApp: App {
    @State private var session = ProbeSession()
    @State private var pairing = PairingStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(session: session, pairing: pairing)
                .onChange(of: scenePhase) { _, phase in
                    if phase != .active { pairing.cancel() }
                    if phase != .active, session.connected || session.connecting {
                        session.disconnect(reason: "Session stopped while the app was inactive. Connect again to continue.")
                    }
                }
        }
    }
}
