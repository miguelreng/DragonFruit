import AppKit
import Combine
import QuartzCore
import Sparkle
import SwiftUI

@main
struct DragonFruitMiniApp: App {
    @StateObject private var store = MeetingStore()
    @StateObject private var pomodoro = PomodoroTimerModel()
    @StateObject private var toastController = VoiceToastController()
    @StateObject private var cursorBuddyController = CursorBuddyOverlayController()
    @StateObject private var meetingNotesOverlayController = MeetingNotesOverlayController()
    @StateObject private var atlasChatController = AtlasChatOverlayController()
    @StateObject private var agentInbox = AgentInboxStore()

    // Drives Sparkle auto-updates in release builds. Debug builds skip Sparkle
    // so an unavailable appcast cannot show native updater error dialogs.
    private let updaterController: SPUStandardUpdaterController?

    init() {
        BrandTheme.registerFontsIfNeeded()
        ProcessInfo.processInfo.disableAutomaticTermination("Atlas runs from the menu bar.")
        ProcessInfo.processInfo.disableSuddenTermination()
        #if DEBUG
            updaterController = nil
        #else
            updaterController = SPUStandardUpdaterController(
                startingUpdater: true,
                updaterDelegate: nil,
                userDriverDelegate: nil
            )
        #endif
    }

    var body: some Scene {
        MenuBarExtra {
            MeetingPopoverView(
                store: store,
                pomodoro: pomodoro,
                agentInbox: agentInbox,
                updater: updaterController?.updater
            )
            .frame(width: 360)
            .onAppear {
                toastController.bind(to: store)
                cursorBuddyController.bind(to: store)
                meetingNotesOverlayController.bind(to: store)
                atlasChatController.bind(to: store)
                agentInbox.startPolling(
                    makeClient: { try store.makeClientPublic() },
                    workspaceSlug: { store.selectedWorkspaceSlug }
                )
            }
        } label: {
            Label {
                Text(pomodoro.menuBarLabel ?? "Atlas")
            } icon: {
                if let icon = BrandTheme.menuBarIcon {
                    Image(nsImage: icon)
                        .renderingMode(.template)
                } else {
                    AtlasIcon(.bubbleChat)
                        .frame(width: 16, height: 16)
                }
            }
            .onAppear {
                toastController.bind(to: store)
                cursorBuddyController.bind(to: store)
                meetingNotesOverlayController.bind(to: store)
                atlasChatController.bind(to: store)
            }
        }
        .menuBarExtraStyle(.window)
    }
}

private final class TransparentHostingView<Content: View>: NSHostingView<Content> {
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

    private func makeTransparent() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        layer?.isOpaque = false
    }
}

@MainActor
final class VoiceToastController: ObservableObject {
    private enum ToastKind: Equatable {
        case none
        case listening
        case processing
        case agentResponse
        case permissions(String, Int)
        case meetingPrompt(String)
        case error
        case result(UUID)
    }

    private var panel: NSPanel?
    private var hideTask: Task<Void, Never>?
    private var closeTask: Task<Void, Never>?
    private var hiddenResultId: UUID?
    private var currentKind: ToastKind = .none
    private var dismissedKind: ToastKind?
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

        store.$isSavingMeetingNotes
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$lastVoiceActionResult
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] result in
                guard let self, let store, let result else { return }
                self.hiddenResultId = nil
                self.showResultToast(result, theme: store.copilotTheme.tokens)
            }
            .store(in: &cancellables)

        store.$lastAgentTextResponse
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$meetingStartPrompt
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$permissionsRefreshCounter
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$isPopoverOpen
            .combineLatest(store.$permissionsOnboardingDismissed, store.$isAuthenticated)
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _, _, _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                store.refreshPermissionStatuses()
                self.update(for: store)
            }
            .store(in: &cancellables)

        store.$copilotTheme
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        let nextKind: ToastKind
        if isErrorStatus(store.statusMessage) {
            nextKind = .error
        } else if store.isVoiceActionProcessing || store.isAgentResponding || store.isSavingMeetingNotes {
            nextKind = .processing
        } else if let permission = store.currentMissingCopilotPermission, store.needsPermissionOnboarding,
                  store.isAuthenticated, !store.isPopoverOpen, !store.permissionsOnboardingDismissed {
            // Only nudge from the menu bar after sign-in, when the popover isn't
            // already showing the onboarding, and only until the user skips it.
            nextKind = .permissions(permission.id, store.completedCopilotPermissionCount)
        } else if let prompt = store.meetingStartPrompt, !store.isMeetingRecording {
            nextKind = .meetingPrompt(prompt.id)
        } else if store.isListening {
            nextKind = .listening
        } else if !store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            nextKind = .agentResponse
        } else if let result = store.lastVoiceActionResult, result.id != hiddenResultId {
            nextKind = .result(result.id)
        } else {
            dismissedKind = nil
            hideToast()
            return
        }

        if dismissedKind == nextKind {
            hideToast()
            return
        }

        dismissedKind = nil

        switch nextKind {
        case .error:
            showStatusToast(for: store)
        case .listening:
            showToast(for: store)
        case .processing:
            showProcessingToast(for: store)
        case .agentResponse:
            showAgentResponseToast(for: store)
        case let .permissions(permissionId, _):
            guard store.currentMissingCopilotPermission?.id == permissionId else {
                hideToast()
                return
            }
            showPermissionsToast(for: store)
        case let .meetingPrompt(meetingId):
            guard store.meetingStartPrompt?.id == meetingId else {
                hideToast()
                return
            }
            showMeetingPromptToast(for: store)
        case let .result(resultId):
            guard let result = store.lastVoiceActionResult, result.id == resultId else {
                hideToast()
                return
            }
            showResultToast(result, theme: store.copilotTheme.tokens)
        case .none:
            hideToast()
        }
    }

    private func showPermissionsToast(for store: MeetingStore) {
        guard let permission = store.currentMissingCopilotPermission else {
            hideToast()
            return
        }
        let kind = ToastKind.permissions(permission.id, store.completedCopilotPermissionCount)
        let size = NSSize(width: 340, height: 152)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: false) {
                PermissionOnboardingToast(store: store)
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showMeetingPromptToast(for store: MeetingStore) {
        let kind = ToastKind.meetingPrompt(store.meetingStartPrompt?.id ?? "")
        let size = NSSize(width: AtlasToastMetrics.width, height: AtlasToastMetrics.standardHeight)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: false) {
                MeetingStartToast(store: store) { [weak self] in
                    self?.dismissCurrentToast()
                }
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showProcessingToast(for store: MeetingStore) {
        let kind = ToastKind.processing
        let size = NSSize(width: AtlasToastMetrics.width, height: AtlasToastMetrics.loadingHeight)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: false) {
                VoiceProcessingToast(store: store) { [weak self] in
                    self?.dismissCurrentToast()
                }
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showToast(for store: MeetingStore) {
        let kind = ToastKind.listening
        let size = NSSize(width: AtlasToastMetrics.width, height: AtlasToastMetrics.standardHeight)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: false) {
                VoiceRecordingToast(store: store) { [weak self] in
                    self?.dismissCurrentToast()
                }
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showAgentResponseToast(for store: MeetingStore) {
        let kind = ToastKind.agentResponse
        let size = NSSize(width: AtlasToastMetrics.width, height: VoiceAgentResponseToast.preferredHeight(for: store))
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: false) {
                VoiceAgentResponseToast(store: store) { [weak self] in
                    self?.dismissCurrentToast()
                }
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showStatusToast(for store: MeetingStore) {
        let kind = ToastKind.error
        let size = NSSize(width: AtlasToastMetrics.width, height: AtlasToastMetrics.standardHeight)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: true) {
                VoiceStatusToast(store: store) { [weak self] in
                    self?.dismissCurrentToast()
                }
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showResultToast(_ result: VoiceActionResult, theme: CopilotThemeTokens) {
        let kind = ToastKind.result(result.id)
        let size = NSSize(width: AtlasToastMetrics.width, height: AtlasToastMetrics.standardHeight)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = TransparentHostingView(rootView: ToastMotionContainer(isError: false) {
                VoiceCreatedToast(result: result, theme: theme) { [weak self] in
                    self?.dismissCurrentToast()
                }
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }

        hideTask?.cancel()
        hideTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard let self else { return }
            self.hiddenResultId = result.id
            self.hideToast()
        }
    }

    private func dismissCurrentToast() {
        let kind = currentKind
        dismissedKind = kind
        if case let .result(resultId) = kind {
            hiddenResultId = resultId
        }
        hideToast()
    }

    private func hideToast() {
        hideTask?.cancel()
        hideTask = nil
        guard let panel else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = AtlasMotion.toastExitDuration
            context.timingFunction = AtlasMotion.standardTimingFunction
            panel.animator().alphaValue = 0
        }
        closeTask?.cancel()
        closeTask = Task { @MainActor [weak self, weak panel] in
            try? await Task.sleep(nanoseconds: AtlasMotion.toastExitDelayNanoseconds)
            panel?.orderOut(nil)
            self?.currentKind = .none
            self?.closeTask = nil
        }
    }

    private func prepare(panel: NSPanel, for kind: ToastKind) -> Bool {
        currentKind != kind || !panel.isVisible || panel.alphaValue < 1
    }

    private func reveal(panel: NSPanel) {
        if !panel.isVisible {
            panel.alphaValue = 0
            panel.orderFrontRegardless()
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = AtlasMotion.toastEnterDuration
            context.timingFunction = AtlasMotion.standardTimingFunction
            panel.animator().alphaValue = 1
        }
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
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        return panel
    }

    private func position(panel: NSPanel, size: NSSize) {
        let screenFrame = NSScreen.main?.visibleFrame ?? .zero
        let origin = NSPoint(
            x: screenFrame.maxX - size.width - 12,
            y: screenFrame.maxY - size.height - 12
        )
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
    }
}

private enum AtlasToastMetrics {
    static let width: CGFloat = 360
    static let cornerRadius: CGFloat = 16
    static let leadingPadding: CGFloat = 14
    static let trailingPadding: CGFloat = 14
    static let trailingPaddingWithClose: CGFloat = 36
    static let verticalPadding: CGFloat = 14
    static let closePadding: CGFloat = 10
    static let standardHeight: CGFloat = 68
    static let loadingHeight: CGFloat = 50
    static let agentResponseMinHeight: CGFloat = 68
    static let agentResponseMaxHeight: CGFloat = 124
    static let titleTracking: CGFloat = 0.14
    static let bodyTracking: CGFloat = 0.13
    static let actionTracking: CGFloat = 0.13
    static let onboardingActionTracking: CGFloat = 0.14
}

private enum AtlasToastTypography {
    static let title = Font.custom("Figtree", size: 14).weight(.semibold)
    static let body = Font.custom("Figtree", size: 13).weight(.regular)
    static let action = Font.custom("Figtree", size: 13).weight(.medium)
}

private enum AtlasToastStatusIconKind {
    case success
    case error
    case warning
    case info
    case loading
}

private struct AtlasToastCard<Content: View>: View {
    let theme: CopilotThemeTokens
    let height: CGFloat?
    let verticalPadding: CGFloat
    let alignment: Alignment
    let onClose: (() -> Void)?
    let content: Content
    @State private var isHovered = false

    init(
        theme: CopilotThemeTokens,
        height: CGFloat? = nil,
        verticalPadding: CGFloat = AtlasToastMetrics.verticalPadding,
        alignment: Alignment = .center,
        onClose: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.theme = theme
        self.height = height
        self.verticalPadding = verticalPadding
        self.alignment = alignment
        self.onClose = onClose
        self.content = content()
    }

    var body: some View {
        content
            .padding(.leading, AtlasToastMetrics.leadingPadding)
            .padding(.trailing, onClose == nil ? AtlasToastMetrics.trailingPadding : AtlasToastMetrics.trailingPaddingWithClose)
            .padding(.vertical, verticalPadding)
            .frame(width: AtlasToastMetrics.width, height: height, alignment: alignment)
            .background(toastBackground(theme: theme))
            .overlay(alignment: .topTrailing) {
                if let onClose {
                    ToastCloseButton(theme: theme, isVisible: isHovered, action: onClose)
                        .padding(AtlasToastMetrics.closePadding)
                }
            }
            .overlay(toastBorder(theme: theme))
            .clipShape(RoundedRectangle(cornerRadius: AtlasToastMetrics.cornerRadius, style: .continuous))
            .compositingGroup()
            .shadow(color: theme.toastShadowSoft, radius: 5, y: 10)
            .shadow(color: theme.toastShadowLift, radius: 30, y: 30)
            .onHover { isHovered = $0 }
    }
}

private struct AtlasToastStatusIcon: View {
    let kind: AtlasToastStatusIconKind
    let theme: CopilotThemeTokens

    var body: some View {
        Group {
            switch kind {
            case .loading:
                AtlasToastLoadingIcon(theme: theme)
            case .success:
                AtlasToastSemanticIcon(kind: .success, fillHex: theme.toastSuccessIconFill)
            case .error:
                AtlasToastSemanticIcon(kind: .error, fillHex: theme.toastDangerIconFill)
            case .warning:
                AtlasToastSemanticIcon(kind: .warning, fillHex: theme.toastWarningIconFill)
            case .info:
                AtlasToastSemanticIcon(kind: .info, fillHex: theme.toastInfoIconFill)
            }
        }
        .frame(width: 22, height: 22)
        .flexibilityShrinkDisabled()
    }
}

private struct AtlasToastSemanticIcon: View {
    let kind: AtlasToastStatusIconKind
    let fillHex: String

    var body: some View {
        if let image = NSImage(data: Data(svg.utf8)) {
            Image(nsImage: image)
                .resizable()
                .scaledToFit()
        } else {
            Color.clear
        }
    }

    private var svg: String {
        switch kind {
        case .success:
            return """
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="\(fillHex)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            """
        case .error:
            return """
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="\(fillHex)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
            """
        case .warning:
            return """
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="\(fillHex)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
              <path d="M12 9v4"/>
              <path d="M12 17h.01"/>
            </svg>
            """
        case .info:
            return """
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="\(fillHex)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            """
        case .loading:
            return ""
        }
    }
}

private struct AtlasToastLoadingIcon: View {
    let theme: CopilotThemeTokens

    var body: some View {
        TimelineView(.animation) { timeline in
            let activeIndex = Int((timeline.date.timeIntervalSinceReferenceDate * 13.33).rounded(.down)) % 12
            ZStack {
                ForEach(0..<12, id: \.self) { index in
                    let distance = (index - activeIndex + 12) % 12
                    let opacity = max(0.14, 1 - (Double(distance) * 0.075))
                    Capsule()
                        .fill(theme.textTertiary.opacity(opacity))
                        .frame(width: 2, height: 5)
                        .offset(y: -8)
                        .rotationEffect(.degrees(Double(index) * 30))
                }
            }
        }
        .frame(width: 22, height: 22)
    }
}

private struct AtlasToastCursorBuddyIcon: View {
    let state: CursorBuddyOverlayView.BuddyVisualState
    let theme: CopilotThemeTokens

    var body: some View {
        CursorBuddyDot(state: state, theme: theme)
            .frame(width: 18, height: 18)
            .frame(width: 22, height: 22)
            .flexibilityShrinkDisabled()
    }
}

private struct AtlasToastActionButtonStyle: ButtonStyle {
    let theme: CopilotThemeTokens

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AtlasToastTypography.action)
            .foregroundStyle(configuration.isPressed ? theme.textPrimary : theme.textSecondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(theme.surface2.opacity(configuration.isPressed ? 0.72 : 1), in: Capsule())
            .overlay(
                Capsule()
                    .stroke(configuration.isPressed ? theme.borderStrong : theme.border, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

private extension View {
    func flexibilityShrinkDisabled() -> some View {
        fixedSize()
    }
}

struct MeetingStartToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var meetingTitle: String {
        store.meetingStartPrompt?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? store.meetingStartPrompt?.title ?? "Meeting"
            : "Meeting"
    }

    var body: some View {
        AtlasToastCard(theme: theme, height: AtlasToastMetrics.standardHeight, onClose: {
            store.dismissMeetingStartPrompt()
            onClose()
        }) {
            HStack(alignment: .center, spacing: 12) {
                AtlasToastStatusIcon(kind: .info, theme: theme)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Meeting starting")
                        .font(AtlasToastTypography.title)
                        .tracking(AtlasToastMetrics.titleTracking)
                        .foregroundStyle(theme.textPrimary)
                    Text(meetingTitle)
                        .font(AtlasToastTypography.body)
                        .tracking(AtlasToastMetrics.bodyTracking)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                Button {
                    store.startPromptedMeetingNotes()
                    onClose()
                } label: {
                    Text("Start notes")
                        .tracking(AtlasToastMetrics.actionTracking)
                }
                .buttonStyle(AtlasToastActionButtonStyle(theme: theme))
            }
        }
    }
}

struct PermissionOnboardingToast: View {
    @ObservedObject var store: MeetingStore

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var permission: PermissionStatus? {
        store.currentMissingRequiredPermission
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                permissionIcon
                    .foregroundStyle(theme.textTertiary)
                    .frame(width: 22, height: 22)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(AtlasToastTypography.title)
                        .tracking(AtlasToastMetrics.titleTracking)
                        .foregroundStyle(theme.textPrimary)
                    Text(detail)
                        .font(AtlasToastTypography.body)
                        .tracking(AtlasToastMetrics.bodyTracking)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 6) {
                let progress = store.requiredPermissionProgress
                ForEach(0..<max(progress.total, 1), id: \.self) { index in
                    Capsule()
                        .fill(index < progress.granted ? theme.accent : theme.borderStrong)
                        .frame(width: 18, height: 4)
                }
                Spacer(minLength: 0)
            }

            HStack(spacing: 8) {
                Button {
                    if let permission {
                        store.handlePermissionAction(permission)
                    }
                } label: {
                    Text(buttonTitle)
                        .tracking(AtlasToastMetrics.onboardingActionTracking)
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))

                if needsRestart {
                    // Re-enabled macOS permissions can apply only after a relaunch.
                    Button {
                        store.restartApp()
                    } label: {
                        Text("Restart")
                            .tracking(AtlasToastMetrics.onboardingActionTracking)
                    }
                    .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
                }

                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(width: 340)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(theme.surface.opacity(0.97))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(theme.borderStrong, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
    }

    @ViewBuilder
    private var permissionIcon: some View {
        AtlasIcon(iconName)
            .frame(width: 22, height: 22)
    }

    private var iconName: AtlasIconName {
        switch permission?.id {
        case "mic":
            return .mic01
        case "system-audio":
            return .volumeHigh
        case "speech":
            return .voice
        case "accessibility":
            return .cursor
        default:
            return .checkCircle
        }
    }

    private var title: String {
        switch permission?.id {
        case "mic":
            return "Allow microphone"
        case "system-audio":
            return "Allow system audio"
        case "speech":
            return "Allow speech recognition"
        case "accessibility":
            return "Allow Accessibility"
        default:
            return "Finish setup"
        }
    }

    private var detail: String {
        switch permission?.id {
        case "mic":
            return "Keep this open while macOS asks for microphone access."
        case "system-audio":
            return "Required to hear people speaking in Meet, Zoom, and Teams."
        case "speech":
            return "Used for live voice preview and dictation commands."
        case "accessibility":
            return "System Settings will open. Turn on DragonFruit Atlas, then come back."
        default:
            return "Atlas will continue once permissions are ready."
        }
    }

    private var buttonTitle: String {
        switch permission?.id {
        case "accessibility":
            return "Open Settings"
        case "mic", "speech":
            return permission?.state == "Blocked" ? "Open Settings" : "Allow"
        default:
            return "Allow"
        }
    }

    private var needsRestart: Bool {
        permission?.requiresRestart ?? false
    }
}

struct VoiceProcessingToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var statusMessage: String {
        store.statusMessage
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "Asking Bot", with: "Asking Atlas")
    }

    private var usesCursorBuddyIcon: Bool {
        statusMessage.hasPrefix("Asking ") || store.isAgentResponding
    }

    private var subtitle: String {
        // While a stopped meeting is being saved, keep a single steady label
        // regardless of the internal transcribe/upload status churn.
        if store.isSavingMeetingNotes {
            return "Creating meeting notes…"
        }
        let status = statusMessage
        let normalized = status.lowercased()
        if status.hasPrefix("Asking ") || status.hasPrefix("Creating ") || status.hasPrefix("Atlas is creating") {
            return status
        }
        if normalized.contains("thinking") || normalized.contains("saving") {
            return "Working on it"
        }
        return "Working on it"
    }

    var body: some View {
        AtlasToastCard(theme: theme, height: AtlasToastMetrics.loadingHeight, onClose: onClose) {
            HStack(spacing: 12) {
                if usesCursorBuddyIcon {
                    AtlasToastCursorBuddyIcon(state: .thinking, theme: theme)
                } else {
                    AtlasToastStatusIcon(kind: .loading, theme: theme)
                }

                Text(subtitle == "Working on it" ? "Thinking" : subtitle)
                    .font(AtlasToastTypography.title)
                    .tracking(AtlasToastMetrics.titleTracking)
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)

                Spacer(minLength: 0)
            }
        }
    }
}

struct VoiceAgentResponseToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private struct ResponsePresentation {
        let message: String
        let actionURL: URL?
    }

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var responsePresentation: ResponsePresentation {
        Self.makeResponsePresentation(from: store.lastAgentTextResponse, appURL: store.appURL)
    }

    private var toastHeight: CGFloat {
        Self.preferredHeight(for: store)
    }

    var body: some View {
        AtlasToastCard(theme: theme, height: toastHeight, verticalPadding: 14, alignment: .topLeading, onClose: onClose) {
            let presentation = responsePresentation
            HStack(alignment: .top, spacing: 12) {
                AtlasToastCursorBuddyIcon(state: .complete, theme: theme)

                Text(presentation.message)
                    .font(AtlasToastTypography.title)
                    .tracking(AtlasToastMetrics.titleTracking)
                    .foregroundStyle(theme.toastResponseText)
                    .lineSpacing(2)
                    .lineLimit(presentation.actionURL == nil ? 5 : 4)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, 20)

                Spacer(minLength: 8)

                if let url = presentation.actionURL {
                    Button {
                        NSWorkspace.shared.open(url)
                    } label: {
                        Text("View")
                            .tracking(AtlasToastMetrics.actionTracking)
                    }
                    .buttonStyle(AtlasToastActionButtonStyle(theme: theme))
                }
            }
        }
    }

    static func preferredHeight(for store: MeetingStore) -> CGFloat {
        let presentation = makeResponsePresentation(from: store.lastAgentTextResponse, appURL: store.appURL)
        let textWidth = textWidthForResponse(hasAction: presentation.actionURL != nil)
        let textHeight = measuredTextHeight(presentation.message, width: textWidth)
        let contentHeight = max(textHeight, 22)
        let rawHeight = ceil((14 * 2) + contentHeight)
        return min(max(rawHeight, AtlasToastMetrics.agentResponseMinHeight), AtlasToastMetrics.agentResponseMaxHeight)
    }

    private static func makeResponsePresentation(from text: String, appURL: String) -> ResponsePresentation {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = #"(?i)(?:\s*(?:Puedes verlo aquí|Puedes verlo aqui|Puedes abrirlo aquí|Puedes abrirlo aqui|View it here|You can view it here)\s*:\s*)?\[([^\]]+)\]\(([^)]+)\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(
                in: trimmedText,
                range: NSRange(trimmedText.startIndex..<trimmedText.endIndex, in: trimmedText)
              ),
              let labelRange = Range(match.range(at: 1), in: trimmedText),
              let urlRange = Range(match.range(at: 2), in: trimmedText),
              let fullRange = Range(match.range, in: trimmedText)
        else {
            return ResponsePresentation(message: cleanedResponseText(trimmedText), actionURL: nil)
        }

        let label = String(trimmedText[labelRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        let rawURL = String(trimmedText[urlRange])
        var message = trimmedText
        message.removeSubrange(fullRange)
        let cleanedMessage = cleanedResponseText(message)

        return ResponsePresentation(
            message: linkedResponseMessage(cleanedMessage, fallbackLabel: label),
            actionURL: resolvedResponseURL(from: rawURL, appURL: appURL)
        )
    }

    private static func linkedResponseMessage(_ message: String, fallbackLabel: String) -> String {
        let normalized = message
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let lowercased = normalized.lowercased()
        if normalized.isEmpty || lowercased.range(of: #"^(created|creado|creada|done|listo|lista)\s*[\.:!¡]*$"#, options: .regularExpression) != nil {
            return "Documento creado: \(fallbackLabel)"
        }
        return normalized
    }

    private static func cleanedResponseText(_ text: String) -> String {
        var cleaned = text
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        while cleaned.last == ":" || cleaned.last == "-" {
            cleaned = String(cleaned.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return cleaned.isEmpty ? "Atlas finished." : cleaned
    }

    private static func textWidthForResponse(hasAction: Bool) -> CGFloat {
        let horizontalPadding = AtlasToastMetrics.leadingPadding + AtlasToastMetrics.trailingPaddingWithClose
        let iconAndSpacing: CGFloat = 22 + 12
        let actionWidth: CGFloat = hasAction ? 74 : 0
        return max(180, AtlasToastMetrics.width - horizontalPadding - iconAndSpacing - actionWidth - 20)
    }

    private static func measuredTextHeight(_ text: String, width: CGFloat) -> CGFloat {
        let font = NSFont(name: "Figtree", size: 14) ?? NSFont.systemFont(ofSize: 14, weight: .semibold)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 2
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .paragraphStyle: paragraph,
        ]
        let rect = (text as NSString).boundingRect(
            with: NSSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attributes
        )
        return ceil(rect.height)
    }

    private static func resolvedResponseURL(from rawURL: String, appURL: String) -> URL? {
        let trimmedURL = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmedURL), url.scheme != nil {
            return url
        }

        let trimmedAppURL = appURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let baseURL = URL(string: "\(trimmedAppURL)/") else { return URL(string: trimmedURL) }
        let relativePath = trimmedURL.hasPrefix("/") ? String(trimmedURL.dropFirst()) : trimmedURL
        return URL(string: relativePath, relativeTo: baseURL)?.absoluteURL
    }
}

struct AgentDragonMark: View {
    let theme: CopilotThemeTokens
    let isThinking: Bool
    @State private var isSpinning = false

    var body: some View {
        ZStack {
            Circle()
                .fill(theme.accentSubtle)
                .overlay(Circle().stroke(theme.accent.opacity(0.22), lineWidth: 1))

            if let dragon = BrandTheme.dragonLogo {
                Image(nsImage: dragon)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 22)
                    .opacity(0.92)
            } else {
                ThinkingDot(index: 0, theme: theme)
            }
        }
        .frame(width: 30, height: 30)
        .rotationEffect(isSpinning ? .degrees(360) : .degrees(0))
        .onAppear {
            guard isThinking else { return }
            withAnimation(.linear(duration: AtlasMotion.spinnerDuration).repeatForever(autoreverses: false)) {
                isSpinning = true
            }
        }
        .onChange(of: isThinking) { thinking in
            if thinking {
                withAnimation(.linear(duration: AtlasMotion.spinnerDuration).repeatForever(autoreverses: false)) {
                    isSpinning = true
                }
            } else {
                withAnimation(.easeOut(duration: AtlasMotion.fastDuration)) {
                    isSpinning = false
                }
            }
        }
    }
}

struct VoiceRecordingToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var transcriptPreview: String {
        let text = store.lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "Speak now" : text
    }

    var body: some View {
        AtlasToastCard(theme: theme, height: AtlasToastMetrics.standardHeight, onClose: onClose) {
            HStack(spacing: 12) {
                AtlasToastStatusIcon(kind: .loading, theme: theme)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Listening")
                        .font(AtlasToastTypography.title)
                        .tracking(AtlasToastMetrics.titleTracking)
                        .foregroundStyle(theme.textPrimary)
                    Text(transcriptPreview)
                        .font(AtlasToastTypography.body)
                        .tracking(AtlasToastMetrics.bodyTracking)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
        }
    }
}

struct VoiceStatusToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var message: String {
        let status = store.statusMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let separator = status.firstIndex(of: ":") else { return status }
        let detailStart = status.index(after: separator)
        let detail = status[detailStart...].trimmingCharacters(in: .whitespacesAndNewlines)
        return detail.isEmpty ? status : detail
    }

    var body: some View {
        AtlasToastCard(theme: theme, height: AtlasToastMetrics.standardHeight, onClose: onClose) {
            HStack(spacing: 12) {
                AtlasToastStatusIcon(kind: .error, theme: theme)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Error!")
                        .font(AtlasToastTypography.title)
                        .tracking(AtlasToastMetrics.titleTracking)
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                    Text(message)
                        .font(AtlasToastTypography.body)
                        .tracking(AtlasToastMetrics.bodyTracking)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
        }
    }
}

struct VoiceCreatedToast: View {
    let result: VoiceActionResult
    let theme: CopilotThemeTokens
    let onClose: () -> Void

    var body: some View {
        AtlasToastCard(theme: theme, height: AtlasToastMetrics.standardHeight, onClose: onClose) {
            HStack(spacing: 12) {
                AtlasToastStatusIcon(kind: .success, theme: theme)

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(result.type.rawValue) created")
                        .font(AtlasToastTypography.title)
                        .tracking(AtlasToastMetrics.titleTracking)
                        .foregroundStyle(theme.textPrimary)
                    Text(result.title)
                        .font(AtlasToastTypography.body)
                        .tracking(AtlasToastMetrics.bodyTracking)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                if let url = result.resourceURL {
                    Button {
                        NSWorkspace.shared.open(url)
                    } label: {
                        Text("View")
                            .tracking(AtlasToastMetrics.actionTracking)
                    }
                    .buttonStyle(AtlasToastActionButtonStyle(theme: theme))
                }
            }
        }
    }

}

struct ToastCloseButton: View {
    let theme: CopilotThemeTokens
    var isVisible = true
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            AtlasIcon(.cancel)
                .frame(width: 14, height: 14)
                .foregroundStyle(isHovered ? theme.textSecondary : theme.textTertiary)
                .frame(width: 18, height: 18)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close toast")
        .opacity(isVisible || isHovered ? 1 : 0)
        .onHover { isHovered = $0 }
    }
}

struct ToastMotionContainer<Content: View>: View {
    let isError: Bool
    @ViewBuilder var content: () -> Content
    @State private var isOpen = false
    @State private var shakeTrigger: CGFloat = 0

    var body: some View {
        content()
            .offset(y: isOpen ? 0 : -80)
            .opacity(isOpen ? 1 : 0)
            .modifier(ShakeEffect(animatableData: shakeTrigger))
            .onAppear {
                isOpen = false
                withAnimation(AtlasMotion.toastEnter) {
                    isOpen = true
                }
                replayErrorShakeIfNeeded()
            }
            .onChange(of: isError) { _ in
                replayErrorShakeIfNeeded()
            }
    }

    private func replayErrorShakeIfNeeded() {
        guard isError else { return }
        shakeTrigger = 0
        withAnimation(AtlasMotion.errorShake) {
            shakeTrigger += 1
        }
    }
}

struct SuccessCheckIcon: View {
    let theme: CopilotThemeTokens
    var size: CGFloat = 15
    var color: Color?
    @State private var isVisible = false

    var body: some View {
        AtlasIcon(.check)
            .frame(width: size, height: size)
            .foregroundStyle(color ?? theme.accent)
            .rotationEffect(.degrees(isVisible ? 0 : 80))
            .offset(y: isVisible ? 0 : 10)
            .blur(radius: isVisible ? 0 : 6)
            .opacity(isVisible ? 1 : 0)
            .onAppear {
                isVisible = false
                withAnimation(AtlasMotion.successCheck) {
                    isVisible = true
                }
            }
    }
}

struct ShakeEffect: GeometryEffect {
    var animatableData: CGFloat
    var distance: CGFloat = 6
    var overshoot: CGFloat = 4

    func effectValue(size: CGSize) -> ProjectionTransform {
        let progress = animatableData.truncatingRemainder(dividingBy: 1)
        let x: CGFloat
        switch progress {
        case 0..<0.2857:
            x = distance * ease(progress / 0.2857)
        case 0.2857..<0.5714:
            x = distance + (-2 * distance * ease((progress - 0.2857) / 0.2857))
        case 0.5714..<0.7857:
            x = -distance + ((distance + overshoot) * ease((progress - 0.5714) / 0.2143))
        default:
            x = overshoot * (1 - ease((progress - 0.7857) / 0.2143))
        }
        return ProjectionTransform(CGAffineTransform(translationX: x, y: 0))
    }

    private func ease(_ value: CGFloat) -> CGFloat {
        min(max(value, 0), 1)
    }
}

private func toastBackground(theme: CopilotThemeTokens, cornerRadius: CGFloat = AtlasToastMetrics.cornerRadius) -> some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(theme.surface)
}

private func toastBorder(theme: CopilotThemeTokens, cornerRadius: CGFloat = AtlasToastMetrics.cornerRadius) -> some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .stroke(theme.border, lineWidth: 1)
}

private func isErrorStatus(_ message: String) -> Bool {
    let text = message.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !text.isEmpty else { return false }
    return text.contains("failed")
        || text.contains("error")
        || text.contains("denied")
        || text.contains("unavailable")
        || text.contains("could not")
        || text.contains("missing")
        || text.contains("not allowed")
        || text.contains("try again")
}

@MainActor
final class MeetingNotesOverlayController: ObservableObject {
    private var panel: NSPanel?
    private var timer: Timer?
    private var cancellables: Set<AnyCancellable> = []
    private weak var store: MeetingStore?

    func bind(to store: MeetingStore) {
        guard self.store !== store else { return }
        self.store = store
        cancellables.removeAll()

        store.$isMeetingRecording
            .combineLatest(store.$copilotTheme)
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] _, _ in
                guard let self, let store else { return }
                self.update(for: store)
            }
            .store(in: &cancellables)

        update(for: store)
    }

    private func update(for store: MeetingStore) {
        guard store.isMeetingRecording else {
            hideOverlay()
            return
        }
        showOverlay(for: store)
    }

    private func showOverlay(for store: MeetingStore) {
        let size = MeetingNotesRecordingOverlayView.panelSize
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        panel.contentView = TransparentHostingView(rootView: MeetingNotesRecordingOverlayView(store: store))
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
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let panel = self.panel else { return }
                self.position(panel: panel, size: panel.frame.size)
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
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
        // Interactive so the stop button is clickable; .nonactivatingPanel keeps
        // clicks from stealing focus from the meeting app the user is in.
        panel.ignoresMouseEvents = false
        panel.isMovable = false
        // Above the menu bar so the pill can overlap the notch band.
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        return panel
    }

    private func position(panel: NSPanel, size: NSSize) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        // Full frame (not visibleFrame) so the pill hugs the very top of the
        // screen — the notch / menu-bar band, Dynamic Island style.
        let frame = screen?.frame ?? .zero
        let margin = MeetingNotesRecordingOverlayView.shadowMargin
        let origin = NSPoint(
            x: frame.midX - (size.width / 2),
            // Capsule top sits ~2pt below the screen top; it is inset from the
            // panel top by `margin`, so lift the panel by that much.
            y: frame.maxY - size.height + margin - 2
        )
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
    }
}

struct MeetingNotesRecordingOverlayView: View {
    @ObservedObject var store: MeetingStore
    @State private var isHoveringStop = false
    @State private var isExpanded = false

    /// Dynamic Island-style horizontal pill docked at the top-center of the
    /// screen. The hosting panel is oversized by `shadowMargin` on every side so
    /// the drop shadow renders fully instead of clipping into a hard edge, and
    /// so the pill can grow on hover (to reveal the stop control) while staying
    /// centered within a fixed panel.
    static let pillHeight: CGFloat = 34
    static let maxPillWidth: CGFloat = 168
    static let shadowMargin: CGFloat = 40
    static var panelSize: NSSize {
        NSSize(
            width: maxPillWidth + shadowMargin * 2,
            height: pillHeight + shadowMargin * 2
        )
    }

    private let pillFill = Color(red: 0.09, green: 0.09, blue: 0.10)

    var body: some View {
        TimelineView(.animation) { timeline in
            HStack(spacing: 9) {
                recordingLogo

                MeetingNotesRecordingBars(date: timeline.date, level: store.audioLevel)
                    .frame(width: 22, height: 16)

                if isExpanded {
                    Text("Recording")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(Color.white.opacity(0.82))
                        .fixedSize()
                        .transition(.opacity.combined(with: .move(edge: .trailing)))

                    stopButton
                        .transition(.opacity.combined(with: .scale(scale: 0.7)))
                }
            }
            .padding(.leading, 11)
            .padding(.trailing, isExpanded ? 8 : 11)
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
            .onHover { hovering in
                withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                    isExpanded = hovering
                }
            }
            // Centre the pill within the oversized (shadow-margin) panel.
            .frame(width: Self.panelSize.width, height: Self.panelSize.height)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Atlas meeting notes active")
    }

    // Stop + save the meeting notes. toggleRecording() ends the session while
    // one is live, which also tears down audio capture and resets the level.
    private var stopButton: some View {
        Button {
            store.toggleRecording()
        } label: {
            ZStack {
                Circle()
                    .fill(Color(red: 0.95, green: 0.30, blue: 0.34).opacity(isHoveringStop ? 0.30 : 0.18))
                Circle()
                    .stroke(Color(red: 0.95, green: 0.30, blue: 0.34).opacity(0.6), lineWidth: 1)
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .fill(Color(red: 0.97, green: 0.43, blue: 0.46))
                    .frame(width: 8, height: 8)
            }
            .frame(width: 22, height: 22)
            .scaleEffect(isHoveringStop ? 1.1 : 1.0)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { isHoveringStop = $0 }
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isHoveringStop)
        .help("Stop meeting notes")
        .accessibilityLabel("Stop meeting notes")
    }

    private var recordingLogo: some View {
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

struct MeetingNotesRecordingBars: View {
    let date: Date
    /// Live audio level (0...1) from MeetingStore's RMS metering.
    let level: CGFloat

    private let color = Color(red: 1.0, green: 0.32, blue: 0.71)

    var body: some View {
        HStack(alignment: .center, spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Capsule(style: .continuous)
                    .fill(color)
                    .frame(width: 4, height: barHeight(index: index))
                    .animation(AtlasMotion.soundLevel, value: level)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func barHeight(index: Int) -> CGFloat {
        // Centre bar swings hardest, edges follow — reads like a real meter.
        let weights: [CGFloat] = [0.72, 1.0, 0.62]
        let offsets: [Double] = [0, 1.35, 2.7]
        // Noise gate: ambient room/system hiss still reads as a small RMS level,
        // which made the bars twitch during silence. Drop everything below the
        // floor to zero and rescale the rest, so the wave only swings on real
        // speech and otherwise rests at a calm idle shimmer.
        let gateFloor: CGFloat = 0.18
        let clamped = max(0, min(1, level))
        let gated = clamped <= gateFloor ? 0 : (clamped - gateFloor) / (1 - gateFloor)
        let idle = (sin(date.timeIntervalSinceReferenceDate * 4.8 + offsets[index]) + 1) / 2
        let reactive = pow(gated, 0.72)
        return 5 + CGFloat(idle) * 1.5 + reactive * 14 * weights[index]
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
            store.$showCursorBuddyEnabled,
            store.$isAgentResponding,
            store.$isVoiceActionProcessing,
            store.$lastVoiceActionResult
        )
        .combineLatest(store.$lastAgentTextResponse, store.$statusMessage)
        .receive(on: DispatchQueue.main)
        .sink { [weak self, weak store] _, _, _ in
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
    @State private var errorShakeTrigger: CGFloat = 0

    enum BuddyVisualState {
        case idle
        case thinking
        case complete
        case error
    }

    private var didCompleteDictation: Bool {
        store.statusMessage.lowercased().contains("typed dictation")
    }

    private var buddyVisualState: BuddyVisualState {
        if isErrorStatus(store.statusMessage) {
            return .error
        }
        if store.isListening || store.isVoiceActionProcessing || store.isAgentResponding {
            return .thinking
        }
        if didCompleteDictation || store.lastVoiceActionResult != nil || !store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .complete
        }
        return .idle
    }

    var body: some View {
        CursorBuddyDot(state: buddyVisualState, theme: store.copilotTheme.tokens)
        .frame(width: 18, height: 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .opacity(store.cursorBuddyOpacity)
        .modifier(ShakeEffect(animatableData: errorShakeTrigger, distance: 3, overshoot: 2))
        .animation(AtlasMotion.cursorBuddy, value: buddyVisualState)
        .onChange(of: buddyVisualState) { state in
            guard state == .error else { return }
            errorShakeTrigger = 0
            withAnimation(AtlasMotion.errorShake) {
                errorShakeTrigger += 1
            }
        }
    }
}

struct CursorBuddyDot: View {
    let state: CursorBuddyOverlayView.BuddyVisualState
    let theme: CopilotThemeTokens

    private var isActive: Bool {
        state == .thinking
    }

    private var isComplete: Bool {
        state == .complete
    }

    private var isError: Bool {
        state == .error
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            let pulse = (sin(timeline.date.timeIntervalSinceReferenceDate * 4.4) + 1) / 2
            let rotation = isActive ? timeline.date.timeIntervalSinceReferenceDate * 260 : 0
            let feedbackColor = isError ? Color(red: 0.95, green: 0.30, blue: 0.38) : theme.accent
            ZStack {
                OctagonShape()
                    .fill(feedbackColor.opacity(isActive ? 0.18 + 0.16 * pulse : isComplete || isError ? 0.26 : 0.14))
                    .frame(width: isActive ? 17 + CGFloat(pulse) * 3 : 17, height: isActive ? 17 + CGFloat(pulse) * 3 : 17)
                    .shadow(color: feedbackColor.opacity(isActive || isError ? 0.22 : 0.08), radius: isActive ? 5 : 2)

                OctagonShape()
                    .stroke(
                        AngularGradient(
                            colors: [
                                theme.surface.opacity(isActive ? 0.92 : 0.58),
                                feedbackColor.opacity(isComplete || isError ? 0.95 : 0.72),
                                theme.surface.opacity(isActive ? 0.92 : 0.58),
                            ],
                            center: .center
                        ),
                        lineWidth: isActive ? 2.1 : 1.5
                    )
                    .frame(width: 16, height: 16)
                    .rotationEffect(.degrees(rotation))

                if isComplete {
                    SuccessCheckIcon(theme: theme, size: 8, color: theme.surface.opacity(0.95))
                } else if isError {
                    AtlasIcon(.warning)
                        .frame(width: 8, height: 8)
                        .foregroundStyle(theme.surface.opacity(0.95))
                }
            }
        }
    }
}

struct OctagonShape: Shape {
    func path(in rect: CGRect) -> Path {
        let inset = min(rect.width, rect.height) * 0.29
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.minY + inset))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.maxY - inset))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + inset, y: rect.maxY - inset))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX + inset, y: rect.minY + inset))
        path.closeSubpath()
        return path
    }
}

struct ThinkingDot: View {
    let index: Int
    let theme: CopilotThemeTokens

    var body: some View {
        TimelineView(.animation) { timeline in
            let phase = timeline.date.timeIntervalSinceReferenceDate * 4.8 + Double(index) * 0.65
            let opacity = 0.35 + 0.55 * ((sin(phase) + 1) / 2)
            Circle()
                .fill(theme.accent.opacity(opacity))
                .frame(width: 6, height: 6)
        }
    }
}

struct SoundWaveView: View {
    let level: CGFloat
    let theme: CopilotThemeTokens
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
                        .fill(theme.accent.opacity(0.64 + 0.28 * base))
                        .frame(width: 4, height: height)
                        .animation(AtlasMotion.soundLevel, value: clampedLevel)
                }
            }
            .frame(maxHeight: .infinity)
        }
    }
}
