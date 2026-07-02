import AppKit
import SwiftUI

struct Mic01Icon: View {
    var strokeWidth: CGFloat = 1.5

    var body: some View {
        AtlasIcon(.mic01)
    }
}

enum AtlasIconName {
    case mic01
    case warning
    case alertCircle
    case info
    case arrowUpRight
    case download
    case reloadHorizontal
    case check
    case checkCircle
    case cancel
    case cursor
    case volumeHigh
    case voice
    case file
    case stickyNote
    case bookmark
    case message
    case bubbleChat
    case record
    case arrowDown
    case arrowUp
    case paperclip
    case layoutGrid
    case undo
}

struct AtlasIcon: View {
    let name: AtlasIconName

    init(_ name: AtlasIconName) {
        self.name = name
    }

    var body: some View {
        if let image = name.templateImage {
            Image(nsImage: image)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
        } else {
            Color.clear
        }
    }
}

private extension AtlasIconName {
    var templateImage: NSImage? {
        guard let image = NSImage(data: Data(svg.utf8)) else { return nil }
        image.isTemplate = true
        return image
    }

    var svg: String {
        switch self {
        case .mic01:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 7v4a5 5 0 0 1-10 0V7a5 5 0 0 1 10 0Z"/><path stroke-linecap="round" d="M17 7h-3m3 4h-3m6 0a8 8 0 0 1-8 8m0 0a8 8 0 0 1-8-8m8 8v3m0 0h3m-3 0H9"/></g></svg>"#
        case .warning:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M13.925 21h-3.85c-4.63 0-6.945 0-7.799-1.506c-.853-1.506.331-3.503 2.7-7.495L6.9 8.753C9.176 4.918 10.313 3 12 3s2.824 1.918 5.1 5.753L19.023 12c2.369 3.992 3.553 5.989 2.7 7.495C20.87 21 18.555 21 13.924 21M12 9v4"/><path d="M12.125 16.75H12m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0"/></g></svg>"#
        case .alertCircle:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></g></svg>"#
        case .info:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m.125-3.75H12m.25 0a.25.25 0 1 0-.5 0a.25.25 0 0 0 .5 0"/></g></svg>"#
        case .arrowUpRight:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 6.65s6.938-.542 7.915.435S17.35 15 17.35 15m-.85-7.5l-10 10"/></svg>"#
        case .download:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 17c0 .93 0 1.395.102 1.777a3 3 0 0 0 2.121 2.121C5.605 21 6.07 21 7 21h10c.93 0 1.395 0 1.776-.102a3 3 0 0 0 2.122-2.121C21 18.395 21 17.93 21 17m-4.5-5.5S13.186 16 12 16s-4.5-4.5-4.5-4.5M12 15V3"/></svg>"#
        case .reloadHorizontal:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M20.5 5.5h-11C5.787 5.5 3 8.185 3 12m.5 6.5h11c3.713 0 6.5-2.685 6.5-6.5"/><path d="M18.5 3S21 4.841 21 5.5S18.5 8 18.5 8m-13 8S3 17.841 3 18.5S5.5 21 5.5 21"/></g></svg>"#
        case .check:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m5 14l3.5 3.5L19 6.5"/></svg>"#
        case .checkCircle:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12s4.477 10 10 10s10-4.477 10-10Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 12.75s1.6.912 2.4 2.25c0 0 2.4-5.25 5.6-7"/></g></svg>"#
        case .cancel:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 6L6 18m12 0L6 6"/></svg>"#
        case .cursor:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5" d="m5.108 14.386l.478-6.473q.048-.666.086-1.251c.178-2.678.273-4.103 1.376-4.552c1.103-.45 2.154.51 4.13 2.312q.43.393.924.839l4.808 4.322c1.353 1.215 2.029 1.823 2.083 2.406c.038.4-.086.797-.344 1.103c-.376.447-1.276.555-3.075.773c-.758.091-1.137.137-1.367.339a1 1 0 0 0-.315.536c-.064.3.079.656.365 1.37l1.482 3.696c.172.427.257.64.256.837a1 1 0 0 1-.296.703c-.14.138-.352.224-.776.396s-.636.26-.83.258a.98.98 0 0 1-.7-.299c-.136-.14-.221-.354-.393-.78l-1.482-3.697c-.286-.713-.43-1.07-.683-1.24a1 1 0 0 0-.596-.165c-.304.015-.608.247-1.217.712c-1.444 1.103-2.167 1.654-2.745 1.596c-.396-.04-.76-.24-1.009-.553c-.362-.457-.295-1.368-.16-3.188Z"/></svg>"#
        case .volumeHigh:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14 14.814V9.186c0-3.145 0-4.717-.925-5.109c-.926-.391-2.015.72-4.193 2.945c-1.128 1.152-1.771 1.407-3.376 1.407c-1.403 0-2.105 0-2.61.344C1.85 9.487 2.01 10.882 2.01 12s-.159 2.513.888 3.227c.504.344 1.206.344 2.609.344c1.605 0 2.248.255 3.376 1.407c2.178 2.224 3.267 3.336 4.193 2.945c.925-.392.925-1.964.925-5.11M17 9c.625.82 1 1.863 1 3s-.375 2.18-1 3m3-8c1.25 1.366 2 3.106 2 5s-.75 3.634-2 5"/></svg>"#
        case .voice:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 12c0-4.478 0-6.718 1.391-8.109S7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391S21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v8m-3-6v4m-3-3v2m9-3v4m3-3v2"/></g></svg>"#
        case .file:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 17h8m-8-4h4m1-10.5V3c0 2.828 0 4.243.879 5.121C14.757 9 16.172 9 19 9h.5m.5 1.657V14c0 3.771 0 5.657-1.172 6.828S15.771 22 12 22s-5.657 0-6.828-1.172S4 17.771 4 14V9.456c0-3.245 0-4.868.886-5.967a4 4 0 0 1 .603-.603C6.59 2 8.211 2 11.456 2c.705 0 1.058 0 1.381.114q.1.036.197.082c.31.148.559.397 1.058.896l4.736 4.736c.579.578.867.868 1.02 1.235c.152.368.152.776.152 1.594"/></svg>"#
        case .stickyNote:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12.5 5h-1C7.729 5 5.843 5 4.672 6.172S3.5 9.229 3.5 13v1c0 3.771 0 5.657 1.172 6.828S7.729 22 11.5 22h1c3.771 0 5.657 0 6.828-1.172S20.5 17.771 20.5 14v-1c0-3.771 0-5.657-1.172-6.828S16.271 5 12.5 5"/><path d="M11 7.5a1.5 1.5 0 0 0 3 0V4a2 2 0 1 0-4 0v1M7.5 17.5h5m-5-4h9"/></g></svg>"#
        case .bookmark:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 17.98V9.709c0-3.634 0-5.45 1.172-6.58S8.229 2 12 2s5.657 0 6.828 1.129C20 4.257 20 6.074 20 9.708v8.273c0 2.306 0 3.459-.773 3.871c-1.497.8-4.304-1.867-5.637-2.67c-.773-.465-1.16-.698-1.59-.698s-.817.233-1.59.698c-1.333.803-4.14 3.47-5.637 2.67C4 21.44 4 20.287 4 17.981"/><path d="M4 7h16"/></g></svg>"#
        case .message:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="round" d="M8.5 14.5h7m-7-5H12"/><path d="M14.17 20.89c4.184-.277 7.516-3.657 7.79-7.9c.053-.83.053-1.69 0-2.52c-.274-4.242-3.606-7.62-7.79-7.899a33 33 0 0 0-4.34 0c-4.184.278-7.516 3.657-7.79 7.9a20 20 0 0 0 0 2.52c.1 1.545.783 2.976 1.588 4.184c.467.845.159 1.9-.328 2.823c-.35.665-.526.997-.385 1.237c.14.24.455.248 1.084.263c1.245.03 2.084-.322 2.75-.813c.377-.279.566-.418.696-.434s.387.09.899.3c.46.19.995.307 1.485.34c1.425.094 2.914.094 4.342 0Z"/></g></svg>"#
        case .bubbleChat:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M21.5 12a9.5 9.5 0 0 1-9.5 9.5c-1.628 0-3.16-.41-4.5-1.131c-1.868-1.007-3.125-.071-4.234.097a.53.53 0 0 1-.456-.156a.64.64 0 0 1-.117-.703c.436-1.025.835-2.969.29-4.607a9.5 9.5 0 0 1-.483-3a9.5 9.5 0 1 1 19 0"/><path d="M12.126 12H12m-3.876 0H8m8.125 0H16m-3.75 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m-4 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m8 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0"/></g></svg>"#
        case .record:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"/></svg>"#
        case .arrowDown:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9s-4.419 6-6 6s-6-6-6-6"/></svg>"#
        case .arrowUp:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 15s-4.42-6-6-6s-6 6-6 6"/></svg>"#
        case .paperclip:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>"#
        case .layoutGrid:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></g></svg>"#
        case .undo:
            return #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></g></svg>"#
        }
    }
}
