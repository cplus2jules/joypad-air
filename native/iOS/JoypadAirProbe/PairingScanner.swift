import SwiftUI
import VisionKit

struct PairingScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    let failed: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(found: found, failed: failed) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                                isGuidanceEnabled: true, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        do { try scanner.startScanning() }
        catch { context.coordinator.failed("Camera scanning is unavailable. Paste the pairing code instead.") }
        return scanner
    }
    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) { }
    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) { scanner.stopScanning() }

    @MainActor final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        let failed: (String) -> Void
        private var delivered = false
        init(found: @escaping (String) -> Void, failed: @escaping (String) -> Void) { self.found = found; self.failed = failed }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !delivered else { return }
            for item in addedItems {
                guard case .barcode(let barcode) = item, let payload = barcode.payloadStringValue else { continue }
                delivered = true
                dataScanner.stopScanning()
                found(payload)
                return
            }
        }
        func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
            failed("Camera scanning stopped. Paste the pairing code or try scanning again.")
        }
    }
}
