import AppKit
import Combine
import QuartzCore
import Sparkle
import SwiftUI

@main
struct DragonFruitMiniApp: App {
    @StateObject private var store = MeetingStore()
    @StateObject private var toastController = VoiceToastController()
    @StateObject private var cursorBuddyController = CursorBuddyOverlayController()

    // Drives Sparkle auto-updates. Created once at launch; starts the updater so
    // scheduled background checks run per the SUFeedURL / interval in Info.plist.
    private let updaterController: SPUStandardUpdaterController

    init() {
        BrandTheme.registerFontsIfNeeded()
        ProcessInfo.processInfo.disableAutomaticTermination("Atlas runs from the menu bar.")
        ProcessInfo.processInfo.disableSuddenTermination()
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    var body: some Scene {
        MenuBarExtra {
            MeetingPopoverView(store: store, updater: updaterController.updater)
                .frame(width: 360)
                .onAppear {
                    toastController.bind(to: store)
                    cursorBuddyController.bind(to: store)
                }
        } label: {
            Label {
                Text("Atlas")
            } icon: {
                if let icon = BrandTheme.menuBarIcon {
                    Image(nsImage: icon)
                        .renderingMode(.template)
                } else {
                    Image(systemName: "text.bubble")
                }
            }
            .onAppear {
                toastController.bind(to: store)
                cursorBuddyController.bind(to: store)
            }
        }
        .menuBarExtraStyle(.window)
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
        } else if store.isListening {
            nextKind = .listening
        } else if let permission = store.currentMissingCopilotPermission, store.needsPermissionOnboarding,
                  store.isAuthenticated, !store.isPopoverOpen, !store.permissionsOnboardingDismissed {
            // Only nudge from the menu bar after sign-in, when the popover isn't
            // already showing the onboarding, and only until the user skips it.
            nextKind = .permissions(permission.id, store.completedCopilotPermissionCount)
        } else if let prompt = store.meetingStartPrompt, !store.isMeetingRecording {
            nextKind = .meetingPrompt(prompt.id)
        } else if store.isVoiceActionProcessing || store.isAgentResponding {
            nextKind = .processing
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
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: false) {
                PermissionOnboardingToast(store: store)
            })
            currentKind = kind
        }
        position(panel: panel, size: size)
        if shouldReveal { reveal(panel: panel) }
    }

    private func showMeetingPromptToast(for store: MeetingStore) {
        let kind = ToastKind.meetingPrompt(store.meetingStartPrompt?.id ?? "")
        let size = NSSize(width: 340, height: 118)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: false) {
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
        let size = NSSize(width: 300, height: 64)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: false) {
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
        let size = NSSize(width: 300, height: 78)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: false) {
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
        let size = NSSize(width: 320, height: 132)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: false) {
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
        let size = NSSize(width: 320, height: 76)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        hideTask?.cancel()
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: true) {
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
        let size = NSSize(width: 320, height: 104)
        let panel = panel ?? makePanel(size: size)
        self.panel = panel
        closeTask?.cancel()
        panel.ignoresMouseEvents = false
        let shouldReveal = prepare(panel: panel, for: kind)
        if currentKind != kind {
            panel.contentView = NSHostingView(rootView: ToastMotionContainer(isError: false) {
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
            context.duration = 0.15
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.22, 1, 0.36, 1)
            panel.animator().alphaValue = 0
        }
        closeTask?.cancel()
        closeTask = Task { @MainActor [weak self, weak panel] in
            try? await Task.sleep(nanoseconds: 160_000_000)
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
            context.duration = 0.25
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.22, 1, 0.36, 1)
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
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "waveform.badge.mic")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(theme.accent)
                .frame(width: 32, height: 32)
                .background(theme.accentSubtle, in: Circle())

            VStack(alignment: .leading, spacing: 6) {
                Text("Meeting starting")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(theme.accent)
                Text(meetingTitle)
                    .font(.custom("Figtree", size: 13).weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    store.startPromptedMeetingNotes()
                    onClose()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "record.circle")
                            .font(.system(size: 11, weight: .bold))
                        Text("Start notes")
                            .font(.custom("Figtree", size: 11).weight(.semibold))
                    }
                    .foregroundStyle(theme.textOnAccent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(theme.accent, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(width: 340, height: 118)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(alignment: .topTrailing) {
            ToastCloseButton(theme: theme) {
                store.dismissMeetingStartPrompt()
                onClose()
            }
            .padding(7)
        }
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
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
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: iconName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(theme.accent)
                    .frame(width: 30, height: 30)
                    .background(theme.accentSubtle, in: Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text("Set up Atlas")
                        .font(.custom("Figtree", size: 11).weight(.semibold))
                        .foregroundStyle(theme.accent)
                    Text(title)
                        .font(.custom("Figtree", size: 13).weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(detail)
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
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
                Button(buttonTitle) {
                    if let permission {
                        store.handlePermissionAction(permission)
                    }
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))

                if needsRestart {
                    // Screen Recording / re-enabled mic only apply after a relaunch.
                    Button("Restart") {
                        store.restartApp()
                    }
                    .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
                }

                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(width: 340)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
    }

    private var iconName: String {
        switch permission?.id {
        case "mic":
            return "mic.fill"
        case "system-audio":
            return "speaker.wave.2.fill"
        case "speech":
            return "waveform"
        case "accessibility":
            return "cursorarrow.motionlines"
        default:
            return "checkmark.circle.fill"
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

    private var subtitle: String {
        let status = store.statusMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = status.lowercased()
        if status.hasPrefix("Asking ") || status.hasPrefix("Creating ") || status.hasPrefix("Buddy is creating") {
            return status
        }
        if normalized.contains("thinking") || normalized.contains("saving") {
            return "Working on it"
        }
        return "Working on it"
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Thinking")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(subtitle)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(1)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.trailing, 54)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 320, height: 64)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(alignment: .trailing) {
            DragonThinkingWatermark(size: 68)
                .padding(.trailing, -6)
        }
        .overlay(alignment: .topTrailing) {
            ToastCloseButton(theme: theme, action: onClose)
                .padding(7)
        }
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
    }
}

struct VoiceAgentResponseToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    private var responseText: String {
        store.lastAgentTextResponse.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var userText: String {
        store.lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                if !userText.isEmpty {
                    Text(userText)
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(responseText)
                    .font(.custom("Newsreader", size: 15).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .lineSpacing(2)
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.trailing, 48)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .frame(width: 320, height: 124, alignment: .topLeading)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(alignment: .trailing) {
            DragonToastWatermark(theme: theme, size: 86)
                .padding(.trailing, -8)
        }
        .overlay(alignment: .topTrailing) {
            ToastCloseButton(theme: theme, action: onClose)
                .padding(7)
        }
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
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
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                isSpinning = true
            }
        }
        .onChange(of: isThinking) { thinking in
            if thinking {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    isSpinning = true
                }
            } else {
                withAnimation(.easeOut(duration: 0.18)) {
                    isSpinning = false
                }
            }
        }
    }
}

struct DragonToastWatermark: View {
    let theme: CopilotThemeTokens
    let size: CGFloat

    var body: some View {
        if let dragon = BrandTheme.dragonLogo {
            Image(nsImage: dragon)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .foregroundStyle(theme.accent)
                .opacity(0.10)
                .allowsHitTesting(false)
        }
    }
}

struct DragonThinkingWatermark: View {
    let size: CGFloat

    var body: some View {
        TimelineView(.animation) { timeline in
            let pulse = (sin(timeline.date.timeIntervalSinceReferenceDate * 2.8) + 1) / 2
            ZStack {
                dragonImage
                    .foregroundStyle(Color(red: 0.62, green: 0.62, blue: 0.64))
                    .opacity(0.16 - (0.06 * pulse))
                dragonImage
                    .foregroundStyle(Color(red: 0.26, green: 0.26, blue: 0.28))
                    .opacity(0.06 + (0.10 * pulse))
            }
            .allowsHitTesting(false)
        }
    }

    private var dragonImage: some View {
        Group {
            if let dragon = BrandTheme.dragonLogo {
                Image(nsImage: dragon)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
            }
        }
        .frame(width: size, height: size)
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
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(theme.accent)
                        .frame(width: 6, height: 6)
                    Text("Listening")
                        .font(.custom("Figtree", size: 11).weight(.semibold))
                        .foregroundStyle(theme.accent)
                }
                Text(transcriptPreview)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 12)
            SoundWaveView(level: store.audioLevel, theme: theme)
                .frame(width: 48, height: 28)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .frame(width: 300, height: 78)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(alignment: .topTrailing) {
            ToastCloseButton(theme: theme, action: onClose)
                .padding(7)
        }
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
    }
}

struct VoiceStatusToast: View {
    @ObservedObject var store: MeetingStore
    let onClose: () -> Void

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color(red: 0.95, green: 0.30, blue: 0.38))
                .frame(width: 22, height: 22)
                .background(Color(red: 0.95, green: 0.30, blue: 0.38).opacity(0.14), in: Circle())

            Text(store.statusMessage)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.trailing, 46)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 320, height: 76)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(alignment: .trailing) {
            DragonToastWatermark(theme: theme, size: 68)
                .padding(.trailing, -6)
        }
        .overlay(alignment: .topTrailing) {
            ToastCloseButton(theme: theme, action: onClose)
                .padding(7)
        }
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
    }
}

struct VoiceCreatedToast: View {
    let result: VoiceActionResult
    let theme: CopilotThemeTokens
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(theme.accentSubtle)
                SuccessCheckIcon(theme: theme)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(result.type.rawValue) created")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(theme.accent)
                Text(result.title)
                    .font(.custom("Figtree", size: 13).weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(result.detail)
                    .font(.custom("Figtree", size: 10))
                    .foregroundStyle(theme.textTertiary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if let url = result.resourceURL {
                Button {
                    NSWorkspace.shared.open(url)
                } label: {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(width: 26, height: 26)
                        .background(theme.accent, in: Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(width: 320, height: 104)
        .background(toastBackground(theme: theme, cornerRadius: 14))
        .overlay(alignment: .topTrailing) {
            ToastCloseButton(theme: theme, action: onClose)
                .padding(7)
        }
        .overlay(toastBorder(theme: theme, cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow, radius: 12, y: 6)
    }

    private var iconName: String {
        switch result.type {
        case .task:
            return "checklist"
        case .doc:
            return "doc.text"
        case .sticky:
            return "note.text"
        case .bookmark:
            return "bookmark.fill"
        case .agent:
            return "message.fill"
        }
    }
}

struct ToastCloseButton: View {
    let theme: CopilotThemeTokens
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(isHovered ? theme.textPrimary : theme.textTertiary)
                .frame(width: 20, height: 20)
                .background(isHovered ? theme.layer2 : theme.layer1.opacity(0.86), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close toast")
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
            .scaleEffect(isOpen ? 1 : 0.96)
            .opacity(isOpen ? 1 : 0)
            .modifier(ShakeEffect(animatableData: shakeTrigger))
            .onAppear {
                isOpen = false
                withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.25)) {
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
        withAnimation(.linear(duration: 0.28)) {
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
        Image(systemName: "checkmark")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(color ?? theme.accent)
            .rotationEffect(.degrees(isVisible ? 0 : 80))
            .offset(y: isVisible ? 0 : 10)
            .blur(radius: isVisible ? 0 : 6)
            .opacity(isVisible ? 1 : 0)
            .onAppear {
                isVisible = false
                withAnimation(.timingCurve(0.34, 1.35, 0.64, 1, duration: 0.55)) {
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

private func toastBackground(theme: CopilotThemeTokens, cornerRadius: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(theme.surface.opacity(0.97))
}

private func toastBorder(theme: CopilotThemeTokens, cornerRadius: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .stroke(theme.borderStrong, lineWidth: 1)
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
        .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.82), value: buddyVisualState)
        .onChange(of: buddyVisualState) { state in
            guard state == .error else { return }
            errorShakeTrigger = 0
            withAnimation(.linear(duration: 0.28)) {
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
                    Image(systemName: "exclamationmark")
                        .font(.system(size: 8, weight: .bold))
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
                        .animation(.interactiveSpring(response: 0.16, dampingFraction: 0.72), value: clampedLevel)
                }
            }
            .frame(maxHeight: .infinity)
        }
    }
}
