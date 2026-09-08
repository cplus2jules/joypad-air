import Foundation
import Security
import CryptoKit
import JoypadCore

/// Only the exact leaf certificate scanned from the Mac can authenticate this connection.
nonisolated final class PinnedTLSDelegate: NSObject, URLSessionTaskDelegate {
    let fingerprint: String
    init(fingerprint: String) { self.fingerprint = fingerprint.lowercased() }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        evaluate(challenge, completionHandler)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        evaluate(challenge, completionHandler)
    }
    private func evaluate(_ challenge: URLAuthenticationChallenge,
                          _ completion: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            completion(.performDefaultHandling, nil); return
        }
        guard let trust = challenge.protectionSpace.serverTrust,
              let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let certificate = certificates.first else {
            completion(.cancelAuthenticationChallenge, nil); return
        }
        let digest = SHA256.hash(data: SecCertificateCopyData(certificate) as Data).map { String(format: "%02x", $0) }.joined()
        guard digest == fingerprint else { completion(.cancelAuthenticationChallenge, nil); return }
        completion(.useCredential, URLCredential(trust: trust))
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil) // Pairing credentials must never follow an unexpected redirect.
    }
}

@MainActor
enum PairingTransport {
    static func session(fingerprint: String) -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 4
        configuration.timeoutIntervalForResource = 8
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration, delegate: PinnedTLSDelegate(fingerprint: fingerprint), delegateQueue: nil)
    }

    static func pair(_ invitation: PairingInvitation, phoneName: String) async throws -> SavedMac {
        let session = session(fingerprint: invitation.fingerprint)
        defer { session.invalidateAndCancel() }
        for host in invitation.hosts {
            try Task.checkCancellation()
            guard let base = BridgeEndpoint.url(host: host, port: String(invitation.port)),
                  var parts = URLComponents(url: base, resolvingAgainstBaseURL: false) else { continue }
            parts.scheme = "https"; parts.path = "/api/pairing/claim"; parts.query = nil
            guard let url = parts.url else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(Claim(code: invitation.code, name: phoneName))
            do {
                let (data, response) = try await session.data(for: request)
                guard let response = response as? HTTPURLResponse else { continue }
                guard response.statusCode == 200 else {
                    let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Pairing was declined. Generate a new QR code on the Mac."
                    throw PairingError.unavailable(message)
                }
                return try SavedMac(invitation: invitation, reply: JSONDecoder().decode(PairingReply.self, from: data), connectedHost: host)
            } catch let error as PairingError { throw error }
            catch is CancellationError { throw CancellationError() }
            catch { continue }
        }
        throw PairingError.unavailable("Could not reach or verify this Mac. Keep both devices on the same network and scan its current QR code.")
    }

    static func reachableHost(for mac: SavedMac) async throws -> String {
        let session = session(fingerprint: mac.fingerprint)
        defer { session.invalidateAndCancel() }
        for host in mac.hosts {
            try Task.checkCancellation()
            guard let url = mac.url(host: host, path: "/") else { continue }
            do {
                let (_, response) = try await session.data(from: url)
                if response is HTTPURLResponse { return host } // A pinned 404 also proves this known Mac is reachable.
            } catch is CancellationError { throw CancellationError() }
            catch { continue }
        }
        throw PairingError.unavailable("Your Mac is unavailable or its identity changed. Open the paired bridge on the Mac. If you replaced its identity, pair again.")
    }

    private struct Claim: Encodable { let code: String; let name: String }
    private struct ServerError: Decodable { let error: String }
}
