// swift-tools-version: 6.3
import PackageDescription

let package = Package(
    name: "JoypadCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "JoypadCore", targets: ["JoypadCore"]),
        .executable(name: "ProbeWireFixture", targets: ["ProbeWireFixture"])
    ],
    targets: [
        .target(name: "JoypadCore"),
        .executableTarget(name: "ProbeWireFixture", dependencies: ["JoypadCore"]),
        .testTarget(name: "JoypadCoreTests", dependencies: ["JoypadCore"])
    ]
)
