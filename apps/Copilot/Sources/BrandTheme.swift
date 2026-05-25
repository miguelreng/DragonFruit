import AppKit
import CoreText
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
    let shadow: Color

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
        shadow: Color.black.opacity(0.16)
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
        shadow: Color.black.opacity(0.34)
    )
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
        guard let path = Bundle.main.path(forResource: "icon-white", ofType: "svg") else { return nil }
        let url = URL(fileURLWithPath: path)
        guard let image = NSImage(contentsOf: url) else { return nil }
        image.size = NSSize(width: 16, height: 16)
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
