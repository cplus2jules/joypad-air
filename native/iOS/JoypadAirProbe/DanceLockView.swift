import SwiftUI

struct DanceLockView: View {
    let session: ProbeSession
    @State private var holding = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 28) {
                    Spacer(minLength: 24)
                    Image(systemName: "lock.fill")
                        .font(.system(size: 48, weight: .medium))
                        .foregroundStyle(.white.opacity(0.85))
                        .accessibilityHidden(true)
                    VStack(spacing: 12) {
                        Text("Controls locked").font(.largeTitle.bold())
                            .accessibilityAddTraits(.isHeader)
                        Text("Keep the app open and enjoy the dance.\nYour buttons and stick are protected.")
                            .font(.body).foregroundStyle(.white.opacity(0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    TimelineView(.periodic(from: .now, by: 0.5)) { _ in
                        Label(session.motionIsFresh ? "Motion streaming" : "Waiting for motion",
                              systemImage: session.motionIsFresh ? "waveform" : "exclamationmark.circle")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(session.motionIsFresh ? Color.green : Color.orange)
                    }
                    Spacer(minLength: 32)
                    VStack(spacing: 12) {
                        Text(holding ? "Keep holding…" : "Hold to unlock controls")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 64)
                            .background {
                                Capsule().fill(.white.opacity(0.10))
                                GeometryReader { size in
                                    Capsule().fill(.white.opacity(0.15))
                                        .frame(width: size.size.width * (holding ? 1 : 0))
                                }.clipShape(Capsule())
                            }
                            .contentShape(Capsule())
                            .onLongPressGesture(minimumDuration: 1.5, maximumDistance: 32) {
                                session.unlockControls()
                            } onPressingChanged: { pressing in
                                withAnimation(pressing && !reduceMotion ? .linear(duration: 1.5) : nil) {
                                    holding = pressing
                                }
                            }
                            .accessibilityAddTraits(.isButton)
                            .accessibilityLabel("Unlock controls")
                            .accessibilityHint("Double-tap to return to the controller. Motion stays on.")
                            .accessibilityAction { session.unlockControls() }
                            .accessibilityIdentifier("danceUnlock")
                        Text("Hold for 1.5 seconds. Motion stays on.")
                            .font(.footnote).foregroundStyle(.white.opacity(0.65))
                    }
                    Text("Song progress and scores are on your Mac.")
                        .font(.footnote).foregroundStyle(.white.opacity(0.65))
                }
                .multilineTextAlignment(.center)
                .padding(28)
                .frame(maxWidth: 480)
                .frame(minHeight: geometry.size.height)
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(.white)
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled()
        .persistentSystemOverlays(.hidden)
        .onDisappear { holding = false }
    }
}
