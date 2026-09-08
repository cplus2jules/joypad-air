import Foundation
import Network
import Observation

@MainActor @Observable
final class MacDiscovery {
    struct NearbyMac: Identifiable, Sendable { let id: String; let name: String }
    private(set) var macs: [NearbyMac] = []
    private(set) var message = "Start the paired bridge on your Mac. Nearby Macs will appear here; you can also scan its QR code directly."
    @ObservationIgnored private var browser: NWBrowser?
    @ObservationIgnored private var generation = UUID()

    func start() {
        guard browser == nil else { return }
        let id = UUID()
        generation = id
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_joypadair._tcp", domain: nil), using: .tcp)
        self.browser = browser
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let found = results.compactMap { result -> NearbyMac? in
                guard case .service(let name, _, _, _) = result.endpoint,
                      case .bonjour(let txt) = result.metadata,
                      txt["v"] == "1", txt["tls"] == "1", let id = txt["id"], UUID(uuidString: id) != nil else { return nil }
                return NearbyMac(id: id, name: name)
            }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Task { @MainActor in
                guard let self, self.generation == id else { return }
                self.macs = found
                self.message = found.isEmpty ? "No Mac found yet. Start the paired bridge on your Mac, then scan its QR code." : "Scan a Mac’s QR code to confirm its identity."
            }
        }
        browser.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                guard let self, self.generation == id else { return }
                switch state {
                case .waiting, .failed:
                    self.message = "Discovery is unavailable. Check Local Network access in Settings, or scan the Mac’s QR code directly."
                default: break
                }
            }
        }
        browser.start(queue: .main)
    }
    func stop() { generation = UUID(); browser?.cancel(); browser = nil; macs = [] }
}
