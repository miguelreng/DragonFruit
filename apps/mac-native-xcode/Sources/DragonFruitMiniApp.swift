import AppKit
import Combine
import SwiftUI

@main
struct DragonFruitMiniApp: App {
    @StateObject private var store = MeetingStore()
    @StateObject private var toastController = VoiceToastController()
    @StateObject private var cursorBuddyController = CursorBuddyOverlayController()

    init() {
        BrandTheme.registerFontsIfNeeded()
    }

    var body: some Scene {
        MenuBarExtra {
            MeetingPopoverView(store: store)
                .frame(width: 360)
                .onAppear {
                    toastController.bind(to: store)
                }
        } label: {
            if let icon = BrandTheme.menuBarIcon {
                Image(nsImage: icon)
                    .onAppear {
                        toastController.bind(to: store)
                        cursorBuddyController.bind(to: store)
                    }
            } else {
                Image(systemName: "text.bubble")
                    .onAppear {
                        toastController.bind(to: store)
                        cursorBuddyController.bind(to: store)
                    }
            }
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class VoiceToastController: ObservableObject {
    private var panel: NSPanel?
    private var hideTask: Task<Void, Never>?
    private var hiddenResultId: UUID?
    private var cancellables: Set<AnyCancellable> = []
    private weak var store: MeetingStore?

    func bind(to store: MeetingStore) {
        guard self.store !== store else { return }
        self.store = store
        cancellables.removeAll()

        store.$isListening
            .combineLatest(store.$lastTranscript, store.$statusMessage)
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _, _, _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$lastVoiceActionResult
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in
                guard let self, let result else { return }
                self.hiddenResultId = nil
                self.showResultToast(result)
            }
            .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        if store.isListening {
            showToast(for: store)
        } else if let result = store.lastVoiceActionResult, result.id != hiddenResultId {
            showResultToast(result)
        } else {
            hideToast()
        }
    }

    private func showToast(for store: MeetingStore) {
        let size = NSSize(width: 278, height: 74)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        panel.ignoresMouseEvents = true
        panel.contentView = NSHostingView(rootView: VoiceRecordingToast(store: store))
        position(panel: panel, size: size)
        if !panel.isVisible {
            panel.orderFrontRegardless()
        }
    }

    private func showResultToast(_ result: VoiceActionResult) {
        let size = NSSize(width: 306, height: 84)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        panel.ignoresMouseEvents = false
        panel.contentView = NSHostingView(rootView: VoiceCreatedToast(result: result))
        position(panel: panel, size: size)
        if !panel.isVisible {
            panel.orderFrontRegardless()
        }

        hideTask?.cancel()
        hideTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard let self else { return }
            self.hiddenResultId = result.id
            self.hideToast()
        }
    }

    private func hideToast() {
        hideTask?.cancel()
        hideTask = nil
        panel?.orderOut(nil)
    }

    private func makePanel(size: NSSize) -> NSPanel {
        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        return panel
    }

    private func position(panel: NSPanel, size: NSSize) {
        let screenFrame = NSScreen.main?.visibleFrame ?? .zero
        let origin = NSPoint(
            x: screenFrame.maxX - size.width - 18,
            y: screenFrame.maxY - size.height - 8
        )
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
    }
}

struct VoiceRecordingToast: View {
    @ObservedObject var store: MeetingStore

    private var transcriptPreview: String {
        let text = store.lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "Listening..." : text
    }

    var body: some View {
        HStack(spacing: 12) {
            SoundWaveView(level: store.audioLevel)
                .frame(width: 46, height: 30)
            VStack(alignment: .leading, spacing: 3) {
                Text("Recording")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(BrandTheme.accent)
                Text(transcriptPreview)
                    .font(.custom("Newsreader", size: 15).weight(.regular))
                    .foregroundStyle(Color.white.opacity(0.94))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .frame(width: 278, height: 74)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(red: 0.06, green: 0.05, blue: 0.075).opacity(0.96))
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .opacity(0.16)
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(BrandTheme.accent.opacity(0.58), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: BrandTheme.accent.opacity(0.22), radius: 18, y: 8)
    }
}

struct VoiceCreatedToast: View {
    let result: VoiceActionResult

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(BrandTheme.accent.opacity(0.18))
                Image(systemName: iconName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BrandTheme.accent)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(result.type.rawValue) created")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(BrandTheme.accent)
                Text(result.title)
                    .font(.custom("Newsreader", size: 15).weight(.regular))
                    .foregroundStyle(Color.white.opacity(0.94))
                    .lineLimit(1)
                Text(result.detail)
                    .font(.custom("Figtree", size: 10))
                    .foregroundStyle(Color.white.opacity(0.55))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if let url = result.resourceURL {
                Button {
                    NSWorkspace.shared.open(url)
                } label: {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color.white)
                        .frame(width: 26, height: 26)
                        .background(BrandTheme.accent, in: Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(width: 306, height: 84)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(red: 0.06, green: 0.05, blue: 0.075).opacity(0.97))
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .opacity(0.14)
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(BrandTheme.accent.opacity(0.52), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: BrandTheme.accent.opacity(0.2), radius: 18, y: 8)
    }

    private var iconName: String {
        switch result.type {
        case .task:
            return "checklist"
        case .doc:
            return "doc.text"
        case .sticky:
            return "note.text"
        case .agent:
            return "sparkles"
        }
    }
}

@MainActor
final class CursorBuddyOverlayController: ObservableObject {
    private var panel: NSPanel?
    private var timer: Timer?
    private var cancellables: Set<AnyCancellable> = []
    private weak var store: MeetingStore?

    func bind(to store: MeetingStore) {
        guard self.store !== store else { return }
        self.store = store
        cancellables.removeAll()

        Publishers.CombineLatest4(
            store.$speechCaptureEnabled,
            store.$isAgentResponding,
            store.$lastAgentTextResponse,
            store.$isListening
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self, weak store] _, _, _, _ in
            guard let self, let store else { return }
            self.update(for: store)
        }
        .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        guard store.speechCaptureEnabled else {
            hideOverlay()
            return
        }
        showOverlay(for: store)
    }

    private func showOverlay(for store: MeetingStore) {
        let size = overlaySize(for: store)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        panel.contentView = NSHostingView(rootView: CursorBuddyOverlayView(store: store))
        position(panel: panel, size: size)

        if !panel.isVisible {
            panel.orderFrontRegardless()
        }
        startTracking()
    }

    private func hideOverlay() {
        timer?.invalidate()
        timer = nil
        panel?.orderOut(nil)
    }

    private func startTracking() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 45.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let panel = self.panel, let store = self.store, store.speechCaptureEnabled else { return }
                self.position(panel: panel, size: self.overlaySize(for: store))
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func overlaySize(for store: MeetingStore) -> NSSize {
        let hasBubble = store.isAgentResponding || !store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return hasBubble ? NSSize(width: 328, height: 176) : NSSize(width: 34, height: 34)
    }

    private func makePanel(size: NSSize) -> NSPanel {
        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        return panel
    }

    private func position(panel: NSPanel, size: NSSize) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        let frame = screen?.visibleFrame ?? .zero
        let origin = NSPoint(
            x: min(max(mouse.x + 18, frame.minX + 6), frame.maxX - size.width - 6),
            y: min(max(mouse.y - 32, frame.minY + 6), frame.maxY - size.height - 6)
        )
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
    }
}

struct CursorBuddyOverlayView: View {
    @ObservedObject var store: MeetingStore

    private var responseText: String {
        store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasBubble: Bool {
        store.isAgentResponding || !responseText.isEmpty
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if hasBubble {
                CursorBuddyBubble(
                    isThinking: store.isAgentResponding && responseText.isEmpty,
                    text: responseText
                )
                .offset(x: 22, y: 24)
                .transition(.scale(scale: 0.94, anchor: .bottomLeading).combined(with: .opacity))
            }

            CursorBuddyDot(isActive: store.isListening || store.isAgentResponding)
                .frame(width: 30, height: 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.82), value: hasBubble)
    }
}

struct CursorBuddyDot: View {
    let isActive: Bool

    var body: some View {
        TimelineView(.animation) { timeline in
            let pulse = (sin(timeline.date.timeIntervalSinceReferenceDate * 4.4) + 1) / 2
            ZStack {
                Circle()
                    .fill(BrandTheme.accent.opacity(isActive ? 0.22 + 0.18 * pulse : 0.16))
                    .frame(width: isActive ? 26 + CGFloat(pulse) * 8 : 26, height: isActive ? 26 + CGFloat(pulse) * 8 : 26)
                if let icon = BrandTheme.cursorBuddyIcon {
                    Image(nsImage: icon)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 22, height: 22)
                        .clipShape(Circle())
                } else {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 1.0, green: 0.22, blue: 0.58), Color(red: 1.0, green: 0.66, blue: 0.84)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 16, height: 16)
                }
                Circle()
                    .stroke(Color.white.opacity(0.92), lineWidth: 1.2)
                    .frame(width: 23, height: 23)
            }
        }
    }
}

struct CursorBuddyBubble: View {
    let isThinking: Bool
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11, weight: .semibold))
                Text("Cursor Buddy")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
            }
            .foregroundStyle(BrandTheme.accent)

            if isThinking {
                HStack(spacing: 5) {
                    ForEach(0..<3, id: \.self) { index in
                        ThinkingDot(index: index)
                    }
                }
                .frame(height: 22, alignment: .leading)
            } else {
                Text(text)
                    .font(.custom("Newsreader", size: 14))
                    .foregroundStyle(Color.white.opacity(0.94))
                    .lineLimit(5)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(width: 292, alignment: .leading)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(red: 0.06, green: 0.05, blue: 0.075).opacity(0.97))
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .opacity(0.15)
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(BrandTheme.accent.opacity(0.48), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: BrandTheme.accent.opacity(0.22), radius: 18, y: 8)
    }
}

struct ThinkingDot: View {
    let index: Int

    var body: some View {
        TimelineView(.animation) { timeline in
            let phase = timeline.date.timeIntervalSinceReferenceDate * 4.8 + Double(index) * 0.65
            let opacity = 0.35 + 0.55 * ((sin(phase) + 1) / 2)
            Circle()
                .fill(BrandTheme.accent.opacity(opacity))
                .frame(width: 6, height: 6)
        }
    }
}

struct SoundWaveView: View {
    let level: CGFloat
    private let bars: [CGFloat] = [0.38, 0.78, 0.52, 1.0, 0.64]

    var body: some View {
        TimelineView(.animation) { timeline in
            let tick = timeline.date.timeIntervalSinceReferenceDate
            let clampedLevel = max(0, min(1, level))
            HStack(alignment: .center, spacing: 4) {
                ForEach(Array(bars.enumerated()), id: \.offset) { index, base in
                    let idle = (sin(tick * 5 + Double(index) * 0.9) + 1) / 2
                    let reactive = pow(clampedLevel, 0.72)
                    let height = 7 + CGFloat(idle) * 4 + reactive * 22 * base
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [BrandTheme.accent, Color(red: 1.0, green: 0.62, blue: 0.84)],
                                startPoint: .bottom,
                                endPoint: .top
                            )
                        )
                        .frame(width: 5, height: height)
                        .animation(.interactiveSpring(response: 0.16, dampingFraction: 0.72), value: clampedLevel)
                }
            }
            .frame(maxHeight: .infinity)
        }
    }
}
