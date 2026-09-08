import Foundation
import Observation
import Security
import UIKit
import JoypadCore

@MainActor @Observable
final class PairingStore {
    private(set) var macs: [SavedMac] = []
    private(set) var busy = false
    private(set) var message = ""
    private(set) var selectedID: String?
    @ObservationIgnored private var operation: Task<Void, Never>?
    @ObservationIgnored private var operationID = UUID()
    @ObservationIgnored private let service = "com.juliansalas.joypadair.pairing"

    init() {
        do { macs = try load() }
        catch { message = error.localizedDescription }
    }

    func pair(_ invitation: PairingInvitation, session: ProbeSession, completed: @escaping () -> Void) {
        cancel()
        busy = true
        let id = operationID
        message = "Verifying \(invitation.name)…"
        operation = Task { [weak self] in
            guard let self else { return }
            defer { if self.operationID == id { self.busy = false; self.operation = nil } }
            do {
                let mac = try await PairingTransport.pair(invitation, phoneName: UIDevice.current.name)
                try Task.checkCancellation()
                guard self.operationID == id else { return }
                var updated = self.macs.filter { $0.id != mac.id }
                updated.insert(mac, at: 0)
                try self.save(updated)
                self.macs = updated
                self.selectedID = mac.id
                self.message = ""
                session.connect(to: mac, host: mac.hosts[0])
                completed()
            } catch is CancellationError { }
            catch { if self.operationID == id { self.message = error.localizedDescription } }
        }
    }

    func connect(_ mac: SavedMac, session: ProbeSession) {
        cancel()
        busy = true
        let id = operationID
        message = "Finding \(mac.name)…"
        operation = Task { [weak self] in
            guard let self else { return }
            defer { if self.operationID == id { self.busy = false; self.operation = nil } }
            do {
                let host = try await PairingTransport.reachableHost(for: mac)
                try Task.checkCancellation()
                guard self.operationID == id else { return }
                self.selectedID = mac.id
                self.message = ""
                session.connect(to: mac, host: host)
            } catch is CancellationError { }
            catch { if self.operationID == id { self.message = error.localizedDescription } }
        }
    }

    func forget(_ mac: SavedMac, session: ProbeSession) {
        cancel()
        do {
            let remaining = macs.filter { $0.id != mac.id }
            try save(remaining)
            macs = remaining
            if selectedID == mac.id { session.disconnect(); selectedID = nil }
            message = "Mac removed from this phone. Remove this phone on the Mac to revoke its token too."
        } catch { message = error.localizedDescription }
    }

    func cancel() { operationID = UUID(); operation?.cancel(); operation = nil; busy = false }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "saved-macs"]
    }
    private func load() throws -> [SavedMac] {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let data = result as? Data else { throw PairingError.keychain(status) }
        return try JSONDecoder().decode([SavedMac].self, from: data)
    }
    private func save(_ macs: [SavedMac]) throws {
        let data = try JSONEncoder().encode(macs)
        let attributes = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly] as [String: Any]
        let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if update == errSecItemNotFound {
            let create = SecItemAdd(query.merging(attributes, uniquingKeysWith: { _, new in new }) as CFDictionary, nil)
            guard create == errSecSuccess else { throw PairingError.keychain(create) }
        } else if update != errSecSuccess { throw PairingError.keychain(update) }
    }
}
