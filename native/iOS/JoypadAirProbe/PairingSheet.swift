import SwiftUI
import AVFoundation
import VisionKit
import JoypadCore

struct PairingSheet: View {
    @Bindable var store: PairingStore
    let session: ProbeSession
    @Environment(\.dismiss) private var dismiss
    @State private var discovery = MacDiscovery()
    @State private var code = ""
    @State private var invitation: PairingInvitation?
    @State private var error: String?
    @State private var scanning = false
    @State private var cameraPending = false
    @State private var attemptedPairing = false
    @FocusState private var codeFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                if let invitation {
                    Section {
                        Label(invitation.name, systemImage: "desktopcomputer")
                            .font(.title2.weight(.semibold)).padding(.vertical, 8)
                        Text("Check that this is the Mac whose QR code you scanned.")
                        Button("Pair and connect") { attemptedPairing = true; store.pair(invitation, session: session) { dismiss() } }
                            .disabled(store.busy).frame(minHeight: 44)
                            .accessibilityIdentifier("confirmPairing")
                        Button("Scan a different code") { self.invitation = nil; code = ""; error = nil; attemptedPairing = false }
                            .disabled(store.busy)
                    } header: { Text("Confirm your Mac") } footer: {
                        Text("This Mac will be remembered securely. You can remove a paired phone from the Mac at any time.")
                    }
                    Section {
                        LabeledContent("Connection", value: "Encrypted · local network")
                        LabeledContent("Address", value: invitation.hosts.first ?? "")
                    }
                } else {
                    Section {
                        Label("Connect your iPhone to your Mac", systemImage: "iphone.and.arrow.forward")
                            .font(.headline).padding(.vertical, 4)
                        Text("Open Joypad Air’s pairing page on your Mac. Keep both devices on the same Wi-Fi or Personal Hotspot.")
                            .foregroundStyle(.secondary)
                        Button { requestCamera() } label: { Label("Scan Mac QR code", systemImage: "qrcode.viewfinder") }
                            .frame(minHeight: 44).disabled(cameraPending)
                    }
                    Section {
                        TextField("Paste pairing code", text: $code, axis: .vertical)
                            .lineLimit(2...4).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($codeFocused).accessibilityIdentifier("pairingCode")
                        Button("Review code") { review(code) }.disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .frame(minHeight: 44)
                    } header: { Text("Or paste from your Mac") } footer: {
                        Text("Use “Copy pairing code” on the Mac’s pairing page. Codes expire after five minutes.")
                    }
                    Section("Nearby Macs") {
                        ForEach(discovery.macs) { mac in Label(mac.name, systemImage: "desktopcomputer") }
                        Text(discovery.message).font(.callout).foregroundStyle(.secondary)
                    }
                }
                if store.busy { Section { ProgressView(store.message) } }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                if attemptedPairing && invitation != nil && !store.busy { Section { Text(store.message).font(.callout).foregroundStyle(.secondary) } }
            }
            .navigationTitle("Pair a Mac").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { store.cancel(); dismiss() } } }
            .task { discovery.start() }
            .onDisappear { discovery.stop() }
            .sheet(isPresented: $scanning) {
                NavigationStack {
                    PairingScanner(found: { scanning = false; review($0) }, failed: { scanning = false; error = $0 })
                        .ignoresSafeArea(edges: .bottom)
                        .navigationTitle("Scan your Mac’s QR code").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { scanning = false } } }
                }
            }
            .interactiveDismissDisabled(store.busy)
        }
    }

    private func review(_ text: String) {
        codeFocused = false
        do { invitation = try PairingInvitation.parse(text); error = nil }
        catch { self.error = error.localizedDescription }
    }
    private func requestCamera() {
        guard DataScannerViewController.isSupported else { error = "QR scanning is unavailable on this device. Paste the pairing code instead."; return }
        cameraPending = true
        Task {
            let allowed: Bool
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized: allowed = true
            case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
            default: allowed = false
            }
            cameraPending = false
            guard allowed else { error = "Camera access is off. Enable it in Settings, or paste the pairing code."; return }
            guard DataScannerViewController.isAvailable else { error = "Camera scanning is unavailable. Paste the pairing code instead."; return }
            error = nil; scanning = true
        }
    }
}
