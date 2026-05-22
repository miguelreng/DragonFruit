import SwiftUI

@main
struct DragonFruitMiniApp: App {
    init() {
        BrandTheme.registerFontsIfNeeded()
    }

    var body: some Scene {
        MenuBarExtra {
            MeetingPopoverView()
                .frame(width: 360)
        } label: {
            if let icon = BrandTheme.menuBarIcon {
                Image(nsImage: icon)
            } else {
                Image(systemName: "text.bubble")
            }
        }
        .menuBarExtraStyle(.window)
    }
}
