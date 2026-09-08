import SwiftUI
import JoypadCore

struct ContentView: View {
    @Bindable var session: ProbeSession
    @Bindable var pairing: PairingStore
    @State private var showingPairing = false
    @State private var removingMac: SavedMac?
    @AppStorage("probe.macHost") private var host = ""
    @AppStorage("probe.macPort") private var port = "3001"
    @AppStorage(ControllerFeedback.preferenceKey) private var hapticsEnabled = true
    @FocusState private var addressFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if session.connected || session.connecting {
                        HStack(spacing: 12) {
                            Label { VStack(alignment: .leading, spacing: 3) {
                                Text(session.connectedMacName ?? "Direct connection").font(.headline).lineLimit(1)
                                Text(session.connecting ? "Connecting…" : "Connected · Player 1").font(.caption).foregroundStyle(.secondary)
                            } } icon: { Image(systemName: session.connectedMacName == nil ? "desktopcomputer" : "lock.shield").foregroundStyle(.tint) }
                            Spacer(minLength: 0)
                            Button("Disconnect") { pairing.cancel(); session.disconnect() }
                                .font(.subheadline).buttonStyle(.borderless)
                                .frame(minHeight: 44).accessibilityIdentifier("connectionButton")
                        }
                    } else {
                        ForEach(pairing.macs) { mac in
                            HStack {
                                Button { pairing.connect(mac, session: session) } label: {
                                    Label { VStack(alignment: .leading, spacing: 3) {
                                        Text(mac.name).foregroundStyle(.primary)
                                        Text("Tap to connect").font(.caption).foregroundStyle(.secondary)
                                    } } icon: { Image(systemName: "desktopcomputer") }
                                }.disabled(pairing.busy).frame(minHeight: 44)
                                Spacer()
                                Button { removingMac = mac } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }
                                    .buttonStyle(.borderless).accessibilityLabel("Manage \(mac.name)")
                            }
                        }
                        if pairing.busy { ProgressView(pairing.message) }
                        else if !pairing.message.isEmpty { Text(pairing.message).font(.callout).foregroundStyle(.secondary) }
                    }
                    if !session.connected && !session.connecting {
                        Button { showingPairing = true } label: { Label("Pair a Mac", systemImage: "qrcode.viewfinder") }
                            .frame(minHeight: 44).disabled(pairing.busy)
                    }
                } header: { Text("Your Mac") } footer: {
                    if !session.connected {
                        Text("Player 1 · Connecting replaces any controller already using this slot.")
                    }
                }
                if !session.connected {
                    Section { Text(session.notice).font(.callout).foregroundStyle(.secondary).accessibilityIdentifier("sessionNotice") }
                }
                Section {
                    Toggle("Enable Motion", isOn: Binding(
                        get: { session.motionEnabled }, set: { session.setMotion($0) }
                    ))
                    .disabled(!session.connected || !session.compatible || session.motionPending || !session.sensorAvailable)
                    .accessibilityIdentifier("motionToggle")
                    if session.motionPending { ProgressView("Checking dance profile…") }
                    if session.motionEnabled {
                        Button { addressFocused = false; session.lockForDance() } label: {
                            Label("Dance Lock", systemImage: "lock.shield")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!session.connected || session.motionPending)
                        .accessibilityHint("Protect buttons and stick from accidental touches while motion continues.")
                        .accessibilityIdentifier("danceLock")
                    }
                    NavigationControls(session: session)
                } header: { Text("Controller") } footer: {
                    Text(session.sensorAvailable
                        ? "Keep this app active. Locking the phone or switching apps disconnects and stops motion."
                        : "Simulator has no real motion sensors. Use an iPhone for the movement test.")
                }
                Section {
                  DisclosureGroup("Connection & diagnostics") {
                    LabeledContent("Connection", value: session.status)
                    Text(session.notice).font(.callout).foregroundStyle(.secondary).accessibilityIdentifier("sessionNotice")
                    LabeledContent("Keyboard", value: session.keyboardReady)
                    LabeledContent("Sensor delivery", value: String(format: "%.1f Hz", session.sampleRate))
                    LabeledContent("Largest sample gap", value: String(format: "%.1f ms", session.maximumGapMilliseconds))
                    LabeledContent("Round trip", value: session.roundTripMilliseconds.map { String(format: "%.1f ms", $0) } ?? "—")
                    LabeledContent("Motion frames sent", value: "\(session.samplesSent)")
                    LabeledContent("Unsent frames discarded", value: "\(session.droppedMotion)")
                    LabeledContent("Samples above bridge range", value: "\(session.rangeExceededCount)")
                    if let sample = session.sample {
                        vectorRow("Acceleration · g", vector: sample.accelerationG)
                        vectorRow("Angular velocity · °/s", vector: sample.rotationDegreesPerSecond)
                        LabeledContent("Acceleration magnitude", value: String(format: "%.3f g", sample.accelerationG.magnitude))
                    }
                  }
                }
                Section {
                    Toggle("Haptic feedback", isOn: $hapticsEnabled)
                        .accessibilityIdentifier("hapticsToggle")
                        .onChange(of: hapticsEnabled) { _, enabled in
                            if enabled { session.previewHaptics() }
                        }
                } footer: {
                    Text("Feel button presses, stick engagement, and connection or lock changes.")
                }
                Section {
                    DisclosureGroup("Direct connection · advanced") {
                        TextField("Mac IPv4 address or name.local", text: $host)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($addressFocused).accessibilityLabel("Mac address")
                        TextField("Port", text: $port).keyboardType(.numberPad).accessibilityLabel("Mac port")
                        Button("Connect directly") { addressFocused = false; session.connect(host: host, port: port) }
                            .disabled(session.connected || session.connecting || pairing.busy).frame(minHeight: 44)
                        Text("For a trusted development network only. Direct connections are unencrypted. Use pairing for everyday play.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Text("Song starts and scores appear in Just Dance on your Mac. Dance Lock is controlled here.")
                        .foregroundStyle(.secondary)
                }
            }
            .disabled(session.danceLocked)
            .allowsHitTesting(!session.danceLocked)
            .accessibilityHidden(session.danceLocked)
            .navigationTitle("Joypad Air").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingPairing) { PairingSheet(store: pairing, session: session) }
            .fullScreenCover(isPresented: Binding(
                get: { session.danceLocked },
                set: { if !$0 { session.unlockControls() } }
            )) { DanceLockView(session: session) }
            .confirmationDialog("Remove this Mac?", isPresented: Binding(get: { removingMac != nil }, set: { if !$0 { removingMac = nil } }), titleVisibility: .visible) {
                if let mac = removingMac { Button("Forget Mac", role: .destructive) { pairing.forget(mac, session: session); removingMac = nil } }
            } message: { Text("You can pair again by scanning the Mac’s QR code.") }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { addressFocused = false; UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                }
            }
        }
    }

    private func vectorRow(_ title: String, vector: Vector3) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline)
            Text(String(format: "x % .3f  y % .3f  z % .3f", vector.x, vector.y, vector.z))
                .font(.caption.monospaced()).foregroundStyle(.secondary)
                .textSelection(.enabled)
        }.padding(.vertical, 4)
    }
}
