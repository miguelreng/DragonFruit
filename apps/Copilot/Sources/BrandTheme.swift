import AppKit
import CoreText
import QuartzCore
import SwiftUI

enum CopilotThemeMode: String, CaseIterable, Identifiable {
    case light
    case dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        }
    }

    var colorScheme: ColorScheme {
        switch self {
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }

    var tokens: CopilotThemeTokens {
        switch self {
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

struct CopilotThemeTokens {
    let canvas: Color
    let surface: Color
    let surface2: Color
    let layer1: Color
    let layer2: Color
    let border: Color
    let borderStrong: Color
    let textPrimary: Color
    let textSecondary: Color
    let textTertiary: Color
    let textOnAccent: Color
    let accent: Color
    let accentSubtle: Color
    let success: Color
    let warning: Color
    let danger: Color
    let toastSuccessIconFill: String
    let toastWarningIconFill: String
    let toastDangerIconFill: String
    let toastInfoIconFill: String
    let toastResponseText: Color
    let shadow: Color
    let toastShadowSoft: Color
    let toastShadowLift: Color

    static let light = CopilotThemeTokens(
        canvas: Color(red: 0.954, green: 0.955, blue: 0.956),
        surface: .white,
        surface2: Color(red: 0.985, green: 0.985, blue: 0.986),
        layer1: Color(red: 0.970, green: 0.970, blue: 0.971),
        layer2: .white,
        border: Color.black.opacity(0.055),
        borderStrong: Color.black.opacity(0.10),
        textPrimary: Color(red: 0.15, green: 0.15, blue: 0.16),
        textSecondary: Color(red: 0.44, green: 0.44, blue: 0.48),
        textTertiary: Color(red: 0.55, green: 0.55, blue: 0.59),
        textOnAccent: Color(red: 0.985, green: 0.985, blue: 0.986),
        accent: Color(red: 0.91, green: 0.30, blue: 0.66),
        accentSubtle: Color(red: 0.995, green: 0.925, blue: 0.965),
        success: Color(red: 0.18, green: 0.55, blue: 0.44),
        warning: Color(red: 0.91, green: 0.57, blue: 0.14),
        danger: Color(red: 0.95, green: 0.30, blue: 0.38),
        toastSuccessIconFill: "#00A63E",
        toastWarningIconFill: "#FE9A00",
        toastDangerIconFill: "#E7000B",
        toastInfoIconFill: "#AA0276",
        toastResponseText: Color(red: 1.0, green: 0.18, blue: 0.56),
        shadow: Color.black.opacity(0.16),
        toastShadowSoft: Color(red: 0.16, green: 0.18, blue: 0.24).opacity(0.04),
        toastShadowLift: Color(red: 0.16, green: 0.18, blue: 0.24).opacity(0.10)
    )

    static let dark = CopilotThemeTokens(
        canvas: Color(red: 0.145, green: 0.141, blue: 0.139),
        surface: Color(red: 0.175, green: 0.171, blue: 0.168),
        surface2: Color(red: 0.205, green: 0.200, blue: 0.197),
        layer1: Color(red: 0.205, green: 0.200, blue: 0.197),
        layer2: Color(red: 0.235, green: 0.230, blue: 0.226),
        border: Color.white.opacity(0.045),
        borderStrong: Color.white.opacity(0.08),
        textPrimary: Color(red: 0.925, green: 0.923, blue: 0.920),
        textSecondary: Color(red: 0.845, green: 0.841, blue: 0.837),
        textTertiary: Color(red: 0.765, green: 0.760, blue: 0.754),
        textOnAccent: Color(red: 0.145, green: 0.141, blue: 0.139),
        accent: Color(red: 0.93, green: 0.37, blue: 0.70),
        accentSubtle: Color(red: 0.26, green: 0.10, blue: 0.20),
        success: Color(red: 0.39, green: 0.82, blue: 0.62),
        warning: Color(red: 0.93, green: 0.67, blue: 0.22),
        danger: Color(red: 0.96, green: 0.37, blue: 0.44),
        toastSuccessIconFill: "#05DF72",
        toastWarningIconFill: "#FE9A00",
        toastDangerIconFill: "#9F0712",
        toastInfoIconFill: "#FF6BC3",
        toastResponseText: Color(red: 1.0, green: 0.42, blue: 0.76),
        shadow: Color.black.opacity(0.34),
        toastShadowSoft: Color.black.opacity(0.18),
        toastShadowLift: Color.black.opacity(0.28)
    )
}

enum AtlasMotion {
    static let fastDuration: TimeInterval = 0.16
    static let controlDuration: TimeInterval = 0.20
    static let toastEnterDuration: TimeInterval = 0.25
    static let toastExitDuration: TimeInterval = 0.15
    static let panelRevealDuration: TimeInterval = 0.40
    static let successDuration: TimeInterval = 0.55
    static let shakeDuration: TimeInterval = 0.28
    static let spinnerDuration: TimeInterval = 1.20

    static let standardTimingFunction = CAMediaTimingFunction(controlPoints: 0.22, 1, 0.36, 1)

    static var toastExitDelayNanoseconds: UInt64 {
        UInt64((toastExitDuration + 0.01) * 1_000_000_000)
    }

    static var standard: Animation {
        .timingCurve(0.22, 1, 0.36, 1, duration: controlDuration)
    }

    static var toastEnter: Animation {
        .timingCurve(0.22, 1, 0.36, 1, duration: toastEnterDuration)
    }

    static var panelReveal: Animation {
        .timingCurve(0.22, 1, 0.36, 1, duration: panelRevealDuration)
    }

    static var successCheck: Animation {
        .timingCurve(0.34, 1.35, 0.64, 1, duration: successDuration)
    }

    static var errorShake: Animation {
        .linear(duration: shakeDuration)
    }

    static var cursorBuddy: Animation {
        .interactiveSpring(response: 0.22, dampingFraction: 0.82)
    }

    static var soundLevel: Animation {
        .interactiveSpring(response: 0.16, dampingFraction: 0.72)
    }
}

enum BrandTheme {
    static let accent = Color(red: 0.91, green: 0.30, blue: 0.66)
    static let surface = Color(red: 0.97, green: 0.97, blue: 0.98)
    static let card = Color.white
    static let border = Color.black.opacity(0.09)
    static let textPrimary = Color(red: 0.15, green: 0.15, blue: 0.20)
    static let textSecondary = Color(red: 0.38, green: 0.38, blue: 0.45)
    static let labelLight = Color(red: 0.38, green: 0.38, blue: 0.45).opacity(0.7)

    static var menuBarIcon: NSImage? {
        // White DragonFruit mark, rendered as a template image so macOS tints it
        // to match the menu bar — crisp white on dark menu bars, dark on light ones.
        templateMark(pointSize: 18)
    }

    /// The brand mark as a template NSImage with explicit 1x and 2x bitmap reps.
    /// Handing SwiftUI the SVG-backed NSImage directly rasterizes it at 1x and
    /// upscales for Retina, which is what made the menu bar icon look jagged.
    static func templateMark(pointSize: CGFloat) -> NSImage? {
        guard let path = Bundle.main.path(forResource: "icon-white", ofType: "svg")
            ?? Bundle.main.path(forResource: "app", ofType: "svg")
        else { return nil }
        guard let source = NSImage(contentsOf: URL(fileURLWithPath: path)) else { return nil }

        let size = NSSize(width: pointSize, height: pointSize)
        let image = NSImage(size: size)
        for scale in [CGFloat(1), 2] {
            let pixels = Int(pointSize * scale)
            guard let rep = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: pixels,
                pixelsHigh: pixels,
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
            ) else { continue }
            rep.size = size
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
            NSGraphicsContext.current?.imageInterpolation = .high
            source.draw(in: NSRect(origin: .zero, size: size))
            NSGraphicsContext.restoreGraphicsState()
            image.addRepresentation(rep)
        }
        image.isTemplate = true
        return image
    }

    static func registerFontsIfNeeded() {
        registerFont(named: "Figtree-Variable", ext: "ttf")
        registerFont(named: "Figtree-Italic-Variable", ext: "ttf")
        registerFont(named: "Newsreader-Variable", ext: "ttf")
        registerFont(named: "Newsreader-Italic-Variable", ext: "ttf")
    }

    static var logo: NSImage? {
        guard let path = Bundle.main.path(forResource: "logo", ofType: "svg") else { return nil }
        return NSImage(contentsOfFile: path)
    }

    static var dragonLogo: NSImage? {
        guard let path = Bundle.main.path(forResource: "dragon", ofType: "svg") else { return nil }
        guard let image = NSImage(contentsOfFile: path) else { return nil }
        image.size = NSSize(width: 22, height: 30)
        image.isTemplate = false
        return image
    }

    static var cursorBuddyIcon: NSImage? {
        guard let path = Bundle.main.path(forResource: "AppIcon", ofType: "icns") else { return nil }
        guard let image = NSImage(contentsOfFile: path) else { return nil }
        image.size = NSSize(width: 24, height: 24)
        image.isTemplate = false
        return image
    }

    static func cursorBuddyIcon(named name: String, size: CGFloat = 30) -> NSImage? {
        guard let path = Bundle.main.path(forResource: name, ofType: "svg") else { return nil }
        guard let image = NSImage(contentsOfFile: path) else { return nil }
        image.size = NSSize(width: size, height: size)
        image.isTemplate = false
        return image
    }

    private static func registerFont(named: String, ext: String) {
        guard let path = Bundle.main.path(forResource: named, ofType: ext) else { return }
        let url = URL(fileURLWithPath: path)
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}

struct DragonFruitPrimaryButtonStyle: ButtonStyle {
    var theme: CopilotThemeTokens = .light

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("Figtree", size: 14).weight(.medium))
            .foregroundStyle(theme.textOnAccent)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(theme.accent.opacity(configuration.isPressed ? 0.85 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

struct DragonFruitSecondaryButtonStyle: ButtonStyle {
    var theme: CopilotThemeTokens = .light

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("Figtree", size: 14).weight(.medium))
            .foregroundStyle(theme.textPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(theme.layer1.opacity(configuration.isPressed ? 0.72 : 1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(theme.borderStrong, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}
