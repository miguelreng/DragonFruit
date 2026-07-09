import AppKit
import Combine
import SwiftUI

/// The notch cutout of a screen, in points. `notchWidth == 0` means the screen
/// has no notch and the island falls back to a floating capsule.
struct NotchGeometry: Equatable {
    let notchWidth: CGFloat
    /// Height of the island band — the notch/menu-bar height on notched
    /// screens, the capsule height otherwise.
    let height: CGFloat

    var hasNotch: Bool { notchWidth > 0 }

    @MainActor
    static func detect(on screen: NSScreen?) -> NotchGeometry {
        guard let screen else {
            return NotchGeometry(notchWidth: 0, height: AtlasIslandView.pillHeight)
        }
        let topInset = screen.safeAreaInsets.top
        if topInset > 0,
           let left = screen.auxiliaryTopLeftArea,
           let right = screen.auxiliaryTopRightArea {
            let width = screen.frame.width - left.width - right.width
            if width > 0 {
                return NotchGeometry(notchWidth: width, height: topInset)
            }
        }
        return NotchGeometry(notchWidth: 0, height: AtlasIslandView.pillHeight)
    }
}

/// Live island frame in SwiftUI global (top-left origin) coordinates, written
/// by the view on layout and read by the hosting view's hit-testing — so the
/// oversized panel only intercepts clicks on the visible island itself.
final class IslandHitRegion {
    var rect: CGRect = .zero
}

/// Whether the mouse is currently over the island, decided by the controller's
/// mouse poll (not SwiftUI `onHover`): the panel is click-through whenever the
/// mouse is elsewhere, and a click-through window stops delivering tracking
/// events — so hover driven from inside the window could never un-stick.
final class IslandInteractionState: ObservableObject {
    @Published var isMouseInside = false
}

/// Transparent host that passes every event through except those landing on
/// the island's current frame, so the shadow margin and the unexpanded wing
/// area never swallow menu-bar clicks behind the panel.
private final class IslandHostingView<Content: View>: NSHostingView<Content> {
    var hitRegion: IslandHitRegion?

    override var isOpaque: Bool { false }

    required init(rootView: Content) {
        super.init(rootView: rootView)
        makeTransparent()
    }

    @MainActor @preconcurrency required dynamic init?(coder: NSCoder) {
        super.init(coder: coder)
        makeTransparent()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        makeTransparent()
        window?.backgroundColor = .clear
        window?.isOpaque = false
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard let region = hitRegion?.rect, region != .zero else { return nil }
        let local = convert(point, from: superview)
        // The region is captured in SwiftUI's top-left-origin space; flip if
        // this AppKit view is bottom-left-origin.
        let probe = isFlipped ? local : NSPoint(x: local.x, y: bounds.height - local.y)
        guard region.contains(probe) else { return nil }
        return super.hitTest(point)
    }

    private func makeTransparent() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        layer?.isOpaque = false
    }
}

/// Persistent Dynamic Island for Atlas. On notched screens the island fuses
/// with the notch: a black band matching the notch's exact height, extended by
/// symmetric wings past its sides (Atlas mark left, live status right), so
/// hardware cutout + pill read as one shape. On other screens it falls back to
/// a floating capsule at the top centre. A click toggles the ⌥A floating chat.
/// Meeting recording lives here too: bars in the right wing plus a hover stop
/// control (this replaced the old standalone recording pill).
@MainActor
final class AtlasIslandOverlayController: ObservableObject {
    private var panel: NSPanel?
    private var timer: Timer?
    private var cancellables: Set<AnyCancellable> = []
    private weak var store: MeetingStore?
    private var currentNotch: NotchGeometry?
    private var mouseTimer: Timer?
    private let hitRegion = IslandHitRegion()
    private let interaction = IslandInteractionState()

    func bind(to store: MeetingStore) {
        guard self.store !== store else { return }
        self.store = store
        cancellables.removeAll()

        store.$isAuthenticated
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        guard store.isAuthenticated else {
            hideOverlay()
            return
        }
        showOverlay(for: store)
    }

    private func showOverlay(for store: MeetingStore) {
        refreshPanel(for: store)
        if let panel, !panel.isVisible {
            panel.orderFrontRegardless()
        }
        startTracking()
    }

    private func hideOverlay() {
        timer?.invalidate()
        timer = nil
        mouseTimer?.invalidate()
        mouseTimer = nil
        panel?.orderOut(nil)
    }

    private func startTracking() {
        if timer == nil {
            timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, let store = self.store, let panel = self.panel, panel.isVisible else { return }
                    self.refreshPanel(for: store)
                }
            }
            RunLoop.main.add(timer!, forMode: .common)
        }
        if mouseTimer == nil {
            mouseTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.updateMouseInteraction()
                }
            }
            RunLoop.main.add(mouseTimer!, forMode: .common)
        }
    }

    /// The panel covers a wide top-of-screen band (shadow room + wing room),
    /// which the window server treats as one opaque click target — transparent
    /// pixels do not pass clicks through. So the panel stays
    /// `ignoresMouseEvents` (fully click-through, menu bar and browser tabs
    /// stay clickable) except while the mouse is over the island itself; the
    /// same poll drives the hover-expansion state.
    private func updateMouseInteraction() {
        guard let panel, panel.isVisible else { return }
        let region = hitRegion.rect
        guard region != .zero else { return }
        // hitRegion is top-left-origin within the panel; screen coords are
        // bottom-left-origin.
        let screenRect = CGRect(
            x: panel.frame.minX + region.minX,
            y: panel.frame.maxY - region.maxY,
            width: region.width,
            height: region.height
        ).insetBy(dx: -2, dy: -2)
        let inside = screenRect.contains(NSEvent.mouseLocation)
        if panel.ignoresMouseEvents == inside {
            panel.ignoresMouseEvents = !inside
        }
        if interaction.isMouseInside != inside {
            interaction.isMouseInside = inside
        }
    }

    /// Follows the screen the mouse is on, re-detecting the notch cutout and
    /// rebuilding the content view only when the geometry actually changes.
    private func refreshPanel(for store: MeetingStore) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        let notch = NotchGeometry.detect(on: screen)
        let size = AtlasIslandView.panelSize(for: notch)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel

        if currentNotch != notch || panel.contentView == nil {
            currentNotch = notch
            let host = IslandHostingView(
                rootView: AtlasIslandView(store: store, notch: notch, hitRegion: hitRegion, interaction: interaction)
            )
            host.hitRegion = hitRegion
            panel.contentView = host
        }

        // Flush to the very top of the screen (full frame, not visibleFrame)
        // and centred on the notch.
        let frame = screen?.frame ?? .zero
        let origin = NSPoint(
            x: frame.midX - (size.width / 2),
            y: frame.maxY - size.height
        )
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
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
        // Click-through by default; `updateMouseInteraction()` flips this on
        // only while the mouse is over the island so hover/click work there.
        panel.ignoresMouseEvents = true
        panel.isMovable = false
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        return panel
    }
}

struct AtlasIslandView: View {
    @ObservedObject var store: MeetingStore
    let notch: NotchGeometry
    let hitRegion: IslandHitRegion
    @ObservedObject var interaction: IslandInteractionState
    @State private var isHovered = false

    static let pillHeight: CGFloat = 34
    static let maxPillWidth: CGFloat = 200
    /// Wing width at full hover expansion; wings stay symmetric so the black
    /// band never drifts off the physical notch.
    static let expandedWingWidth: CGFloat = 118
    static let compactWingWidth: CGFloat = 44
    static let shadowMargin: CGFloat = 40

    static func panelSize(for notch: NotchGeometry) -> NSSize {
        if notch.hasNotch {
            return NSSize(
                width: notch.notchWidth + (expandedWingWidth + shadowMargin) * 2,
                height: notch.height + shadowMargin
            )
        }
        return NSSize(
            width: maxPillWidth + shadowMargin * 2,
            height: pillHeight + shadowMargin + 2
        )
    }

    private let pillFill = Color(red: 0.09, green: 0.09, blue: 0.10)

    private enum IslandState: Equatable {
        case idle
        case listening
        case thinking
        case recording
    }

    private var state: IslandState {
        if store.isMeetingRecording { return .recording }
        if store.isListening { return .listening }
        if store.isVoiceActionProcessing || store.isAgentResponding || store.isSavingMeetingNotes {
            return .thinking
        }
        return .idle
    }

    private var hoverLabel: String {
        switch state {
        case .idle: return "Ask Atlas"
        case .listening: return "Listening"
        case .thinking: return "Thinking"
        case .recording: return "Recording"
        }
    }

    var body: some View {
        Group {
            if notch.hasNotch {
                notchIsland
            } else {
                floatingPill.padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onChange(of: interaction.isMouseInside) { inside in
            withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                isHovered = inside
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Atlas island — click to open Atlas chat")
    }

    // MARK: Notched screens — wings fused to the hardware cutout

    private var wingWidth: CGFloat {
        isHovered ? Self.expandedWingWidth : Self.compactWingWidth
    }

    private var notchIsland: some View {
        HStack(spacing: 0) {
            // Left wing: Atlas mark, plus the state label on hover.
            HStack(spacing: 8) {
                islandLogo
                if isHovered {
                    Text(hoverLabel)
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(Color.white.opacity(0.82))
                        .fixedSize()
                        .transition(.opacity.combined(with: .move(edge: .trailing)))
                }
            }
            .frame(width: wingWidth)

            // Under-notch strip — pure black continuing through the cutout.
            Color.clear.frame(width: notch.notchWidth)

            // Right wing: live status (bars / loader), shortcut hint on hover.
            HStack(spacing: 8) {
                switch state {
                case .listening, .recording:
                    TimelineView(.animation) { timeline in
                        MeetingNotesRecordingBars(date: timeline.date, level: store.audioLevel)
                    }
                    .frame(width: 22, height: 16)
                    .transition(.opacity.combined(with: .scale(scale: 0.7)))
                    if state == .recording, isHovered {
                        IslandStopButton { store.toggleRecording() }
                            .transition(.opacity.combined(with: .scale(scale: 0.7)))
                    }
                case .thinking:
                    MorphingInfinityLoader(color: Color.white.opacity(0.85))
                        .frame(width: 17, height: 17)
                        .transition(.opacity.combined(with: .scale(scale: 0.7)))
                case .idle:
                    // No idle indicator — a resting dot reads like a live
                    // recording light. The wing stays black until hovered.
                    if isHovered {
                        shortcutBadge
                            .transition(.opacity.combined(with: .scale(scale: 0.7)))
                    }
                }
            }
            .frame(width: wingWidth)
        }
        .frame(height: notch.height)
        .background(notchShape.fill(Color.black))
        .clipShape(notchShape)
        .compositingGroup()
        .shadow(color: Color.black.opacity(0.30), radius: 6, y: 3)
        .contentShape(Rectangle())
        .modifier(IslandFrameReporter(region: hitRegion))
        .onTapGesture {
            store.toggleAtlasChat()
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: state)
    }

    /// Flush to the screen top, rounded only at the bottom outer corners —
    /// matching how the notch itself meets the menu bar.
    private var notchShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: 10,
            bottomTrailingRadius: 10,
            topTrailingRadius: 0,
            style: .continuous
        )
    }

    private var shortcutBadge: some View {
        Text("⌥A")
            .font(.custom("Figtree", size: 10).weight(.medium))
            .foregroundStyle(Color.white.opacity(0.55))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(Color.white.opacity(0.10))
            )
            .fixedSize()
    }

    // MARK: Non-notched screens — floating capsule fallback

    private var floatingPill: some View {
        HStack(spacing: 9) {
            islandLogo

            if state == .listening || state == .recording {
                TimelineView(.animation) { timeline in
                    MeetingNotesRecordingBars(date: timeline.date, level: store.audioLevel)
                }
                .frame(width: 22, height: 16)
                .transition(.opacity.combined(with: .scale(scale: 0.7)))
            } else if state == .thinking {
                MorphingInfinityLoader(color: Color.white.opacity(0.85))
                    .frame(width: 17, height: 17)
                    .transition(.opacity.combined(with: .scale(scale: 0.7)))
            }

            if isHovered {
                Text(hoverLabel)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(Color.white.opacity(0.82))
                    .fixedSize()
                    .transition(.opacity.combined(with: .move(edge: .trailing)))

                if state == .idle {
                    shortcutBadge
                        .transition(.opacity.combined(with: .scale(scale: 0.7)))
                } else if state == .recording {
                    IslandStopButton { store.toggleRecording() }
                        .transition(.opacity.combined(with: .scale(scale: 0.7)))
                }
            }
        }
        .padding(.horizontal, 11)
        .frame(height: Self.pillHeight)
        .background(
            Capsule(style: .continuous)
                .fill(pillFill.opacity(0.97))
                .shadow(color: Color.black.opacity(0.28), radius: 8, y: 5)
                .shadow(color: Color.black.opacity(0.22), radius: 22, y: 14)
        )
        .overlay(
            Capsule(style: .continuous)
                .stroke(Color.white.opacity(0.10), lineWidth: 1)
        )
        .fixedSize()
        .contentShape(Capsule(style: .continuous))
        .modifier(IslandFrameReporter(region: hitRegion))
        .onTapGesture {
            store.toggleAtlasChat()
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: state)
    }

    private var islandLogo: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.14))
            if let icon = BrandTheme.templateMark(pointSize: 16) {
                Image(nsImage: icon)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color.white.opacity(0.92))
                    .frame(width: 13, height: 13)
            } else {
                AtlasIcon(.bubbleChat)
                    .foregroundStyle(Color.white.opacity(0.92))
                    .frame(width: 13, height: 13)
            }
        }
        .frame(width: 22, height: 22)
    }
}

/// Stop + save the meeting notes. `toggleRecording()` ends the live session,
/// which also tears down audio capture and resets the level.
private struct IslandStopButton: View {
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(Color(red: 0.95, green: 0.30, blue: 0.34).opacity(isHovering ? 0.30 : 0.18))
                Circle()
                    .stroke(Color(red: 0.95, green: 0.30, blue: 0.34).opacity(0.6), lineWidth: 1)
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .fill(Color(red: 0.97, green: 0.43, blue: 0.46))
                    .frame(width: 8, height: 8)
            }
            .frame(width: 22, height: 22)
            .scaleEffect(isHovering ? 1.1 : 1.0)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isHovering)
        .help("Stop meeting notes")
        .accessibilityLabel("Stop meeting notes")
    }
}

/// Streams the island's laid-out frame into `IslandHitRegion` so hit-testing
/// tracks the current (hover-expanded or compact) size every frame.
private struct IslandFrameReporter: ViewModifier {
    let region: IslandHitRegion

    func body(content: Content) -> some View {
        content.background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear { region.rect = proxy.frame(in: .global) }
                    .onChange(of: proxy.frame(in: .global)) { region.rect = $0 }
            }
        )
    }
}
