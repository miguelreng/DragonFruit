import AppKit
import CoreText
import Foundation
import SwiftUI

enum BrandTheme {
    static let accent = Color(red: 0.91, green: 0.30, blue: 0.66)
    static let surface = Color(red: 0.97, green: 0.97, blue: 0.98)
    static let card = Color.white
    static let border = Color.black.opacity(0.09)
    static let textPrimary = Color(red: 0.15, green: 0.15, blue: 0.20)
    static let textSecondary = Color(red: 0.38, green: 0.38, blue: 0.45)
    static let labelLight = Color(red: 0.38, green: 0.38, blue: 0.45).opacity(0.7)

    static var menuBarIcon: NSImage? {
        guard let url = Bundle.module.url(forResource: "icon-white", withExtension: "svg") else {
            return nil
        }
        guard let image = NSImage(contentsOf: url) else {
            return nil
        }
        image.size = NSSize(width: 16, height: 16)
        image.isTemplate = true
        return image
    }

    static func registerFontsIfNeeded() {
        registerFont(name: "Figtree-Variable", ext: "ttf")
        registerFont(name: "Figtree-Italic-Variable", ext: "ttf")
        registerFont(name: "Newsreader-Variable", ext: "ttf")
        registerFont(name: "Newsreader-Italic-Variable", ext: "ttf")
    }

    static var logo: NSImage? {
        guard let url = Bundle.module.url(forResource: "logo", withExtension: "svg") else {
            return nil
        }
        return NSImage(contentsOf: url)
    }

    static var cursorBuddyIcon: NSImage? {
        guard let url = Bundle.module.url(forResource: "AppIcon", withExtension: "icns") else {
            return nil
        }
        guard let image = NSImage(contentsOf: url) else {
            return nil
        }
        image.size = NSSize(width: 24, height: 24)
        image.isTemplate = false
        return image
    }

    private static func registerFont(name: String, ext: String) {
        guard let url = Bundle.module.url(forResource: name, withExtension: ext) else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}

struct DragonFruitPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("Figtree", size: 14).weight(.medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(BrandTheme.accent.opacity(configuration.isPressed ? 0.85 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}
