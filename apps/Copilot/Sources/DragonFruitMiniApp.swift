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
            .combineLatest(store.$lastTranscript, store.$statusMessage, store.$isVoiceActionProcessing)
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _, _, _, _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$isAgentResponding
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
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

        store.$lastAgentTextResponse
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        if store.isListening {
            showToast(for: store)
        } else if store.isVoiceActionProcessing || store.isAgentResponding {
            showProcessingToast(for: store)
        } else if !store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            showAgentResponseToast(for: store)
        } else if let result = store.lastVoiceActionResult, result.id != hiddenResultId {
            showResultToast(result)
        } else {
            hideToast()
        }
    }

    private func showProcessingToast(for store: MeetingStore) {
        let size = NSSize(width: 320, height: 78)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        panel.ignoresMouseEvents = true
        panel.contentView = NSHostingView(rootView: VoiceProcessingToast(store: store))
        position(panel: panel, size: size)
        if !panel.isVisible {
            panel.orderFrontRegardless()
        }
    }

    private func showToast(for store: MeetingStore) {
        let size = NSSize(width: 320, height: 96)
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

    private func showAgentResponseToast(for store: MeetingStore) {
        let size = NSSize(width: 340, height: 156)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        panel.ignoresMouseEvents = true
        panel.contentView = NSHostingView(rootView: VoiceAgentResponseToast(store: store))
        position(panel: panel, size: size)
        if !panel.isVisible {
            panel.orderFrontRegardless()
        }
    }

    private func showResultToast(_ result: VoiceActionResult) {
        let size = NSSize(width: 340, height: 132)
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

struct VoiceProcessingToast: View {
    @ObservedObject var store: MeetingStore

    private var subtitle: String {
        let status = store.statusMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        if status.isEmpty || status.lowercased().contains("listening") {
            return "Working on it"
        }
        return status
    }

    var body: some View {
        HStack(spacing: 10) {
            ThinkingDot(index: 0)
            VStack(alignment: .leading, spacing: 3) {
                Text("Thinking")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(BrandTheme.accent)
                Text(subtitle)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(Color.white.opacity(0.88))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 320, height: 78)
        .background(toastBackground(cornerRadius: 18))
        .overlay(toastBorder(cornerRadius: 18))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .compositingGroup()
        .shadow(color: Color.black.opacity(0.22), radius: 10, y: 5)
    }
}

struct VoiceAgentResponseToast: View {
    @ObservedObject var store: MeetingStore

    private var responseText: String {
        store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var userText: String {
        store.lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !userText.isEmpty {
                Text(userText)
                    .font(.custom("Newsreader", size: 13).weight(.regular))
                    .foregroundStyle(Color.white.opacity(0.94))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(responseText)
                .font(.custom("Newsreader", size: 14).weight(.regular))
                .foregroundStyle(BrandTheme.accent)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .frame(width: 340, height: 156, alignment: .topLeading)
        .background(toastBackground(cornerRadius: 18))
        .overlay(toastBorder(cornerRadius: 18))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .compositingGroup()
        .shadow(color: Color.black.opacity(0.22), radius: 10, y: 5)
    }
}

struct VoiceRecordingToast: View {
    @ObservedObject var store: MeetingStore

    private var transcriptPreview: String {
        let text = store.lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "Speak now" : text
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(BrandTheme.accent)
                        .frame(width: 6, height: 6)
                    Text("Listening")
                        .font(.custom("Figtree", size: 11).weight(.semibold))
                        .foregroundStyle(BrandTheme.accent)
                }
                Text(transcriptPreview)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(Color.white.opacity(0.9))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 12)
            SoundWaveView(level: store.audioLevel)
                .frame(width: 48, height: 28)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(width: 320, height: 96)
        .background(toastBackground(cornerRadius: 18))
        .overlay(toastBorder(cornerRadius: 18))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .compositingGroup()
        .shadow(color: Color.black.opacity(0.22), radius: 10, y: 5)
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
                    .font(.custom("Figtree", size: 13).weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.94))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                Text(result.detail)
                    .font(.custom("Figtree", size: 10))
                    .foregroundStyle(Color.white.opacity(0.55))
                    .lineLimit(2)
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
        .frame(width: 340, height: 132)
        .background(toastBackground(cornerRadius: 18))
        .overlay(toastBorder(cornerRadius: 18))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .compositingGroup()
        .shadow(color: Color.black.opacity(0.22), radius: 10, y: 5)
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
            return "message.fill"
        }
    }
}

private func toastBackground(cornerRadius: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(Color(red: 0.035, green: 0.034, blue: 0.045).opacity(0.96))
}

private func toastBorder(cornerRadius: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .stroke(Color.white.opacity(0.16), lineWidth: 1)
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
            store.$showCursorBuddyEnabled,
            store.$isAgentResponding,
            store.$isVoiceActionProcessing,
            store.$lastVoiceActionResult
        )
        .combineLatest(store.$lastAgentTextResponse)
        .receive(on: DispatchQueue.main)
        .sink { [weak self, weak store] _, _ in
            guard let self, let store else { return }
            self.update(for: store)
        }
        .store(in: &cancellables)

        store.$isListening
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        guard store.showCursorBuddyEnabled else {
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
                guard let self, let panel = self.panel, let store = self.store, store.showCursorBuddyEnabled else { return }
                self.position(panel: panel, size: self.overlaySize(for: store))
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func overlaySize(for store: MeetingStore) -> NSSize {
        NSSize(width: 22, height: 22)
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

    private enum BuddyVisualState {
        case idle
        case thinking
        case complete

        var assetName: String {
            switch self {
            case .idle:
                return "buddy-idle"
            case .thinking:
                return "buddy-thinking"
            case .complete:
                return "buddy-completed"
            }
        }
    }

    private var didCompleteDictation: Bool {
        store.statusMessage.lowercased().contains("typed dictation")
    }

    private var buddyVisualState: BuddyVisualState {
        if store.isListening || store.isVoiceActionProcessing || store.isAgentResponding {
            return .thinking
        }
        if didCompleteDictation || store.lastVoiceActionResult != nil || !store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .complete
        }
        return .idle
    }

    var body: some View {
        CursorBuddyDot(
            isActive: store.isListening || store.isVoiceActionProcessing || store.isAgentResponding,
            assetName: buddyVisualState.assetName
        )
        .frame(width: 18, height: 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.82), value: buddyVisualState.assetName)
    }
}

struct CursorBuddyDot: View {
    let isActive: Bool
    let assetName: String

    var body: some View {
        TimelineView(.animation) { timeline in
            let pulse = (sin(timeline.date.timeIntervalSinceReferenceDate * 4.4) + 1) / 2
            ZStack {
                Circle()
                    .fill(BrandTheme.accent.opacity(isActive ? 0.22 + 0.18 * pulse : 0.16))
                    .frame(width: isActive ? 17 + CGFloat(pulse) * 4 : 17, height: isActive ? 17 + CGFloat(pulse) * 4 : 17)
                if let icon = BrandTheme.cursorBuddyIcon(named: assetName) ?? BrandTheme.cursorBuddyIcon {
                    Image(nsImage: icon)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 18, height: 18)
                } else {
                    Circle()
                        .fill(BrandTheme.accent)
                        .frame(width: 10, height: 10)
                }
            }
        }
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
    private let bars: [CGFloat] = [0.34, 0.72, 0.48, 1.0, 0.6, 0.42]

    var body: some View {
        TimelineView(.animation) { timeline in
            let tick = timeline.date.timeIntervalSinceReferenceDate
            let clampedLevel = max(0, min(1, level))
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(bars.enumerated()), id: \.offset) { index, base in
                    let idle = (sin(tick * 5 + Double(index) * 0.9) + 1) / 2
                    let reactive = pow(clampedLevel, 0.72)
                    let height = 6 + CGFloat(idle) * 3 + reactive * 20 * base
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill(BrandTheme.accent.opacity(0.64 + 0.28 * base))
                        .frame(width: 4, height: height)
                        .animation(.interactiveSpring(response: 0.16, dampingFraction: 0.72), value: clampedLevel)
                }
            }
            .frame(maxHeight: .infinity)
        }
    }
}
