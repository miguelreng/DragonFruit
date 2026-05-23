// swift-tools-version: 6.3
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "mac-native",
    platforms: [
        .macOS(.v13),
    ],
    targets: [
        .executableTarget(
            name: "mac-native",
            resources: [
                .process("Resources"),
            ]
        ),
    ],
    swiftLanguageModes: [.v6]
)
