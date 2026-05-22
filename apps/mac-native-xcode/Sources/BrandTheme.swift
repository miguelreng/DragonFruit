import AppKit
import CoreText
import SwiftUI

enum BrandTheme {
    static let accent = Color(red: 0.91, green: 0.30, blue: 0.66)
    static let surface = Color(red: 0.97, green: 0.97, blue: 0.98)
    static let card = Color.white
    static let border = Color.black.opacity(0.09)
    static let textPrimary = Color(red: 0.15, green: 0.15, blue: 0.20)
    static let textSecondary = Color(red: 0.38, green: 0.38, blue: 0.45)

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

    private static func registerFont(named: String, ext: String) {
        guard let path = Bundle.main.path(forResource: named, ofType: ext) else { return }
        let url = URL(fileURLWithPath: path)
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}
