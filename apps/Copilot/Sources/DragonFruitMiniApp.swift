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
    @StateObject private var atlasChatController = AtlasChatOverlayController()
    @StateObject private var atlasIslandController = AtlasIslandOverlayController()
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
                atlasChatController.bind(to: store)
                atlasIslandController.bind(to: store)
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
                atlasChatController.bind(to: store)
                atlasIslandController.bind(to: store)
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
        case permissions(String, Int)
    }

    private var panel: NSPanel?
    private var hideTask: Task<Void, Never>?
    private var closeTask: Task<Void, Never>?
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
        // Voice/meeting/agent notices render as bubbles under the notch
        // island now (AtlasIslandOverlayController). The corner toast only
        // handles the permissions onboarding nudge: after sign-in, when the
        // popover isn't already showing it, and only until the user skips it.
        guard let permission = store.currentMissingCopilotPermission, store.needsPermissionOnboarding,
              store.isAuthenticated, !store.isPopoverOpen, !store.permissionsOnboardingDismissed
        else {
            dismissedKind = nil
            hideToast()
            return
        }

        let kind = ToastKind.permissions(permission.id, store.completedCopilotPermissionCount)
        if dismissedKind == kind {
            hideToast()
            return
        }
        dismissedKind = nil
        showPermissionsToast(for: store)
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

    // `size` is the card size; the window gets a `halo` ring around it so the
    // corner-floating close button isn't clipped at the window edge. The card
    // itself stays 12pt from the screen corner.
    private func position(panel: NSPanel, size: NSSize) {
        let halo = AtlasToastMetrics.halo
        let panelSize = NSSize(width: size.width + halo * 2, height: size.height + halo * 2)
        let screenFrame = NSScreen.main?.visibleFrame ?? .zero
        let origin = NSPoint(
            x: screenFrame.maxX - size.width - 12 - halo,
            y: screenFrame.maxY - size.height - 12 - halo
        )
        panel.setFrame(NSRect(origin: origin, size: panelSize), display: true)
    }
}

private enum AtlasToastMetrics {
    static let width: CGFloat = 360
    static let cornerRadius: CGFloat = 16
    /// Window margin around the card so the corner-floating close button and
    /// part of the drop shadow can render outside the card bounds.
    static let halo: CGFloat = 14
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

enum AtlasToastStatusIconKind {
    case success
    case error
    case warning
    case info
    case loading
}

struct AtlasToastStatusIcon: View {
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
        .fixedSize()
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

/// Extracts the "[label](url)" action link Atlas appends to voice responses,
/// returning clean display text plus the resolved URL. Used by the island's
/// agent-response bubble (formerly part of the corner response toast).
enum AgentResponsePresenter {
    struct Presentation {
        let message: String
        let actionURL: URL?
    }

    static func make(from text: String, appURL: String) -> Presentation {
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
            return Presentation(message: cleanedResponseText(trimmedText), actionURL: nil)
        }

        let label = String(trimmedText[labelRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        let rawURL = String(trimmedText[urlRange])
        var message = trimmedText
        message.removeSubrange(fullRange)
        let cleanedMessage = cleanedResponseText(message)

        return Presentation(
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

struct ToastCloseButton: View {
    let theme: CopilotThemeTokens
    var isVisible = true
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(theme.surface)
                Circle()
                    .stroke(theme.borderStrong, lineWidth: 1)
                AtlasIcon(.cancel)
                    .frame(width: 9, height: 9)
                    .foregroundStyle(isHovered ? theme.textPrimary : theme.textSecondary)
            }
            .frame(width: 22, height: 22)
            .shadow(color: theme.shadow, radius: 4, y: 2)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close toast")
        .opacity(isVisible || isHovered ? 1 : 0)
        .scaleEffect(isVisible || isHovered ? 1 : 0.6)
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isVisible || isHovered)
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
            .padding(AtlasToastMetrics.halo)
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

func isErrorStatus(_ message: String) -> Bool {
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
