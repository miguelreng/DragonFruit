import AppKit
import Sparkle
import SwiftUI

struct MeetingPopoverView: View {
    @ObservedObject var store: MeetingStore
    @ObservedObject var pomodoro: PomodoroTimerModel
    @ObservedObject var agentInbox: AgentInboxStore
    var updater: SPUUpdater? = nil
    @State private var isSettingsExpanded = false
    @State private var isPanelRevealed = false
    private let shellCornerRadius: CGFloat = 12

    private var theme: CopilotThemeTokens {
        store.copilotTheme.tokens
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if store.isRestoringSession {
                loadingCard
            } else if !store.isAuthenticated {
                loginCard
            } else if store.needsPermissionOnboarding && !store.permissionsOnboardingDismissed {
                permissionsOnboardingCard
            } else {
                if store.meetingNotesEnabled {
                    upcomingCard
                }
                if store.lastVoiceActionResult != nil {
                    voiceActionResultCard
                }
                agentInboxCard
                myTasksCard
                pomodoroCard
                settingsCard
            }
        }
        .padding(12)
        .background {
            theme.canvas
            MenuWindowBorderCleaner(theme: theme, isDark: store.copilotTheme == .dark, cornerRadius: shellCornerRadius)
        }
        .clipShape(RoundedRectangle(cornerRadius: shellCornerRadius, style: .continuous))
        .preferredColorScheme(store.copilotTheme.colorScheme)
        .opacity(isPanelRevealed ? 1 : 0)
        .offset(y: isPanelRevealed ? 0 : 26)
        .blur(radius: isPanelRevealed ? 0 : 2)
        .onAppear {
            isPanelRevealed = false
            withAnimation(AtlasMotion.panelReveal) {
                isPanelRevealed = true
            }
            store.isPopoverOpen = true
            store.refreshPermissionStatuses()
            Task { await store.refreshMyTasks() }
            if store.needsPermissionOnboarding {
                store.startPermissionPolling()
            }
        }
        .onDisappear {
            store.isPopoverOpen = false
            store.stopPermissionPolling()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            store.refreshPermissionStatuses()
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("DragonFruit Atlas")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textPrimary.opacity(0.82))
            Spacer()
            if store.isAuthenticated {
                Button("Log out") {
                    store.logout()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textSecondary)
            }
        }
    }

    private var copilotCard: some View {
        card {
            HStack(alignment: .center, spacing: 8) {
                sectionLabel("Voice")
                Spacer()
                HStack(spacing: 5) {
                    hotkeyPill("⌥Space")
                    hotkeyPill("⌥⇧Space")
                }
            }

            Text("Atlas")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)

            Button(store.isListening ? "Stop listening" : "Talk to Atlas") {
                store.toggleCopilotVoiceCapture()
            }
            .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))

            if store.isListening {
                Text(store.lastTranscript.isEmpty ? "Listening..." : store.lastTranscript)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(3)
            } else if store.isAgentResponding {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Atlas is thinking...")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                }
            } else if !store.lastAgentTextResponse.isEmpty {
                Text(store.lastAgentTextResponse)
                    .font(.custom("Newsreader", size: 15).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .lineSpacing(2)
                    .lineLimit(5)
            } else if !store.statusMessage.isEmpty && !isMeetingRefreshStatusVisible {
                Text(store.statusMessage)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
            }
        }
    }

    private var loginCard: some View {
        card {
            Text("Login to DragonFruit")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(theme.textTertiary)
            Button("Continue with DragonFruit") {
                Task { await store.beginDragonFruitLogin() }
            }
            .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))
            Text("Sign in on the web to sync meetings, voice, and Atlas. You’ll return here automatically.")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textSecondary)
        }
    }

    private var permissionsOnboardingCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                if let warning = store.permissionsEnvironmentWarning {
                    environmentWarningBanner(warning)
                }
                if let currentPermission = store.currentMissingRequiredPermission {
                    HStack(alignment: .center, spacing: 12) {
                        onboardingIconView(for: currentPermission)
                            .foregroundStyle(theme.textTertiary)
                            .frame(width: 22, height: 22)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(onboardingTitle(for: currentPermission))
                                .font(.custom("Figtree", size: 14).weight(.semibold))
                                .tracking(PermissionOnboardingMetrics.titleTracking)
                                .foregroundStyle(theme.textPrimary)
                            Text(onboardingDetail(for: currentPermission))
                                .font(.custom("Figtree", size: 13).weight(.regular))
                                .tracking(PermissionOnboardingMetrics.bodyTracking)
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
                            store.handlePermissionAction(currentPermission)
                        } label: {
                            Text(onboardingButtonTitle(for: currentPermission))
                                .tracking(PermissionOnboardingMetrics.actionTracking)
                        }
                        .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))

                        if currentPermission.requiresRestart {
                            Button {
                                store.restartApp()
                            } label: {
                                Text("Restart")
                                    .tracking(PermissionOnboardingMetrics.actionTracking)
                            }
                            .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
                        }

                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func environmentWarningBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            AtlasIcon(.warning)
                .frame(width: 10, height: 10)
                .foregroundStyle(.orange)
            Text(message)
                .font(.custom("Figtree", size: 10).weight(.medium))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.layer1)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    @ViewBuilder
    private func onboardingIconView(for permission: PermissionStatus) -> some View {
        AtlasIcon(onboardingIcon(for: permission))
            .frame(width: 22, height: 22)
    }

    private func onboardingIcon(for permission: PermissionStatus) -> AtlasIconName {
        switch permission.id {
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

    private func onboardingTitle(for permission: PermissionStatus) -> String {
        switch permission.id {
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

    private func onboardingDetail(for permission: PermissionStatus) -> String {
        switch permission.id {
        case "mic":
            return permission.state == "Blocked"
                ? "Open System Settings to re-enable microphone access."
                : "Keep this open while macOS asks for microphone access."
        case "speech":
            return permission.state == "Blocked"
                ? "Open System Settings to re-enable speech recognition."
                : "Allow speech recognition so Atlas can transcribe you."
        case "system-audio":
            return "Allow System Audio Recording Only so Atlas can hear other people."
        case "accessibility":
            return "Open System Settings so Atlas can type into the active field."
        default:
            return "Atlas will continue once permissions are ready."
        }
    }

    private func onboardingButtonTitle(for permission: PermissionStatus) -> String {
        switch permission.id {
        case "accessibility":
            // Accessibility can only be toggled in System Settings.
            return "Open Settings"
        case "mic", "speech":
            // A blocked permission can't be re-prompted in-app; send to Settings.
            return permission.state == "Blocked" ? "Open Settings" : "Allow"
        default:
            return "Allow"
        }
    }

    private var voiceActionResultCard: some View {
        card {
            if let result = store.lastVoiceActionResult {
                HStack(alignment: .top, spacing: 9) {
                    AtlasIcon(voiceActionIcon(for: result.type))
                        .frame(width: 14, height: 14)
                        .foregroundStyle(theme.accent)
                        .frame(width: 18)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(result.type.rawValue) created")
                            .font(.custom("Figtree", size: 10).weight(.semibold))
                            .foregroundStyle(theme.textTertiary)
                        Text(result.title)
                            .font(.custom("Newsreader", size: 16).weight(.regular))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(2)
                        Text(result.detail)
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if result.resourceURL != nil {
                        Button {
                            store.openLastVoiceActionResult()
                        } label: {
                            AtlasIcon(.arrowUpRight)
                                .frame(width: 12, height: 12)
                                .foregroundStyle(theme.accent)
                                .frame(width: 24, height: 24)
                                .background(theme.layer1)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var loadingCard: some View {
        card {
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Checking your DragonFruit session")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(theme.textPrimary)
                    Text("One moment while Atlas verifies this Mac.")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                }
                Spacer()
            }
        }
    }

    // MARK: - Agent inbox card

    @ViewBuilder
    private var agentInboxCard: some View {
        let hasItems = agentInbox.items.contains { $0.status == "needs_input" || $0.status == "completed" || $0.status == "failed" }
        if hasItems {
            card {
                HStack(spacing: 6) {
                    sectionLabel("Atlas follow-ups")
                    Spacer()
                    if agentInbox.isLoading {
                        ProgressView()
                            .controlSize(.mini)
                    }
                }
                AgentInboxView(
                    inboxStore: agentInbox,
                    theme: theme,
                    makeClient: { try store.makeClientPublic() },
                    workspaceSlug: store.selectedWorkspaceSlug,
                    appURL: store.appURL
                )
            }
        }
    }

    private var myTasksCard: some View {
        card {
            HStack(spacing: 8) {
                sectionLabel("My tasks")
                Spacer()
                if store.isLoadingMyTasks {
                    ProgressView()
                        .controlSize(.mini)
                }
            }

            if store.myTasks.isEmpty {
                Text(store.hasLoadedMyTasks ? "No open tasks assigned to you." : "Loading your tasks...")
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
            } else {
                ForEach(store.myTasks) { task in
                    myTaskRow(task)
                }
            }
        }
    }

    private func myTaskRow(_ task: MyTaskSummary) -> some View {
        HStack(alignment: .center, spacing: 9) {
            Button {
                store.markTaskDone(task)
            } label: {
                if store.isCompletingTask(task) {
                    ProgressView()
                        .controlSize(.mini)
                        .frame(width: 18, height: 18)
                } else {
                    AtlasIcon(.checkCircle)
                        .frame(width: 14, height: 14)
                        .foregroundStyle(theme.textTertiary)
                        .frame(width: 18, height: 18)
                }
            }
            .buttonStyle(.plain)
            .help("Mark as done")
            .disabled(store.isCompletingTask(task))

            Text(task.name)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 8)

            Button {
                store.openTaskInWeb(task)
            } label: {
                AtlasIcon(.arrowUpRight)
                    .frame(width: 11, height: 11)
                    .foregroundStyle(theme.accent)
                    .frame(width: 22, height: 22)
                    .background(theme.layer1)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)
            .help("Open in DragonFruit")
        }
    }

    private var pomodoroCard: some View {
        card {
            PomodoroCardContent(pomodoro: pomodoro, theme: theme)
        }
    }

    private var settingsCard: some View {
        card {
            Button {
                withAnimation(.easeInOut(duration: AtlasMotion.fastDuration)) {
                    isSettingsExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    sectionLabel("Settings")
                    Spacer()
                    AtlasIcon(isSettingsExpanded ? .arrowUp : .arrowDown)
                        .frame(width: 12, height: 12)
                        .foregroundStyle(theme.textTertiary)
                        .frame(width: 18, height: 18)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isSettingsExpanded {
                themePicker
                languagePicker
                featureToggle("Voice", isOn: $store.voiceActionsEnabled, detail: "⌥Space")
                featureToggle("Atlas cursor", isOn: $store.showCursorBuddyEnabled, detail: store.showCursorBuddyEnabled ? "Yes" : "No")
                if store.showCursorBuddyEnabled {
                    buddyCursorTransparencyControl
                }
                if store.voiceActionsEnabled {
                    workspacePicker
                }
                featureToggle("Dictation", isOn: $store.cursorBuddyEnabled, detail: "Hold ⌥")
                featureToggle("Meeting notes", isOn: $store.meetingNotesEnabled)
                if store.meetingNotesEnabled {
                    featureToggle("Open notes when done", isOn: $store.autoOpenMeetingNotesEnabled)
                }
                resetAccessibilityButton
                if updater != nil {
                    checkForUpdatesButton
                }
            }
        }
    }

    private var checkForUpdatesButton: some View {
        Button {
            updater?.checkForUpdates()
        } label: {
            HStack(spacing: 8) {
                AtlasIcon(.download)
                    .frame(width: 13, height: 13)
                Text("Check for Updates…")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                Spacer(minLength: 8)
            }
            .foregroundStyle(theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(theme.layer1)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var resetAccessibilityButton: some View {
        Button {
            store.resetAccessibilityAccess()
        } label: {
            HStack(spacing: 8) {
                AtlasIcon(.reloadHorizontal)
                    .frame(width: 13, height: 13)
                Text("Reset Accessibility access")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                Spacer(minLength: 8)
            }
            .foregroundStyle(theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(theme.layer1)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var buddyCursorTransparencyControl: some View {
        HStack(spacing: 10) {
            Text("Transparency")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(theme.textPrimary)
            Slider(value: $store.cursorBuddyOpacity, in: 0.35...1.0)
                .tint(theme.accent)
            Text("\(Int(round(store.cursorBuddyOpacity * 100)))%")
                .font(.custom("Figtree", size: 10).weight(.semibold))
                .foregroundStyle(theme.textTertiary)
                .monospacedDigit()
                .frame(width: 34, alignment: .trailing)
        }
        .frame(maxWidth: .infinity)
    }

    private var workspacePicker: some View {
        settingsPickerRow("Workspace", selectedValue: store.selectedWorkspaceName, isEnabled: store.availableWorkspaces.count > 1) {
            ForEach(store.availableWorkspaces) { workspace in
                Button {
                    store.selectedWorkspaceSlug = workspace.slug
                } label: {
                    if store.selectedWorkspaceSlug == workspace.slug {
                        selectedMenuLabel(workspace.name)
                    } else {
                        Text(workspace.name)
                    }
                }
            }
        }
    }

    private var languagePicker: some View {
        settingsPickerRow("Language", selectedValue: store.speechLanguage.displayLabel, isEnabled: SpeechLanguage.availableCases.count > 1) {
            ForEach(SpeechLanguage.availableCases) { language in
                Button {
                    store.speechLanguage = language
                } label: {
                    if store.speechLanguage == language {
                        selectedMenuLabel(language.displayLabel)
                    } else {
                        Text(language.displayLabel)
                    }
                }
            }
        }
    }

    private var themePicker: some View {
        settingsPickerRow("Theme", selectedValue: store.copilotTheme.label, isEnabled: true) {
            ForEach(CopilotThemeMode.allCases) { theme in
                Button {
                    store.copilotTheme = theme
                } label: {
                    if store.copilotTheme == theme {
                        selectedMenuLabel(theme.label)
                    } else {
                        Text(theme.label)
                    }
                }
            }
        }
    }

    private func settingsPickerRow<MenuContent: View>(
        _ label: String,
        selectedValue: String,
        isEnabled: Bool,
        @ViewBuilder menuContent: () -> MenuContent
    ) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
                .layoutPriority(1)
            Spacer(minLength: 12)
            if isEnabled {
                Menu {
                    menuContent()
                } label: {
                    pickerPill(selectedValue)
                }
                .buttonStyle(.plain)
            } else {
                pickerPill(selectedValue)
            }
        }
    }

    private func pickerPill(_ label: String) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.custom("Figtree", size: 12).weight(.semibold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: 180, alignment: .leading)
                .clipped()
            Spacer(minLength: 8)
            AtlasIcon(.arrowDown)
                .frame(width: 10, height: 10)
                .foregroundStyle(theme.textTertiary)
        }
        .fixedSize(horizontal: true, vertical: false)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(theme.layer1)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var upcomingCard: some View {
        card {
            sectionLabel("Upcoming meeting")
            if store.needsScreenRecordingForMeeting {
                systemAudioMeetingBanner
            }
            if store.needsCalendarReconnect {
                Text("Reconnect to load next meeting.")
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
            } else if store.googleConnected {
                if !store.hasMeetingsToday && store.meeting.id != "empty" {
                    Text("No meetings today")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                } else if store.meeting.id == "empty" {
                    Text("No upcoming meetings")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(store.meeting.title)
                                .font(.custom("Newsreader", size: 16).weight(.regular))
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(2)
                                .lineSpacing(0)

                            Text(store.nextUpCountdownLabel)
                                .font(.custom("Figtree", size: 11).weight(.medium))
                                .foregroundStyle(theme.textSecondary)
                        }
                        .layoutPriority(1)

                        Spacer(minLength: 8)

                        meetingNotesButton
                    }
                }
            } else {
                Button("Connect Google Calendar") {
                    Task { await store.connectGoogle() }
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))
            }
        }
    }

    @ViewBuilder
    private var meetingNotesButton: some View {
        if store.isMeetingRecording {
            Button("Stop notes") {
                store.toggleRecording()
            }
            .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
        } else {
            Button("Start notes") {
                store.toggleRecording()
            }
            .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))
        }
    }

    private var systemAudioMeetingBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 6) {
                AtlasIcon(.volumeHigh)
                    .frame(width: 10, height: 10)
                    .foregroundStyle(theme.accent)
                Text("Meeting notes need System Audio Recording Only to hear other people.")
                    .font(.custom("Figtree", size: 10).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Button("Allow System Audio") {
                    store.requestSystemAudioRecording()
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.layer1)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var isMeetingRefreshStatusVisible: Bool {
        guard store.meetingNotesEnabled else { return false }
        let normalized = store.statusMessage.lowercased()
        return normalized.contains("refresh") && !normalized.contains("not connected")
    }

    private func voiceActionIcon(for type: VoiceCaptureType) -> AtlasIconName {
        switch type {
        case .task:
            return .checkCircle
        case .doc:
            return .file
        case .sticky:
            return .stickyNote
        case .bookmark:
            return .bookmark
        case .agent:
            return .message
        }
    }

    private func selectedMenuLabel(_ label: String) -> some View {
        Label {
            Text(label)
        } icon: {
            AtlasIcon(.check)
                .frame(width: 12, height: 12)
        }
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: shellCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: shellCornerRadius, style: .continuous)
                .stroke(theme.border, lineWidth: 0.75)
        )
    }

    @ViewBuilder
    private func sectionLabel(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.custom("Figtree", size: 10).weight(.medium))
            .foregroundStyle(theme.textTertiary)
    }

    private func hotkeyPill(_ label: String) -> some View {
        Text(label)
            .font(.custom("Figtree", size: 10).weight(.semibold))
            .foregroundStyle(theme.textTertiary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(theme.layer1)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func featureToggle(
        _ label: String,
        isOn: Binding<Bool>,
        detail: String? = nil,
        disabled: Bool = false
    ) -> some View {
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(disabled ? theme.textTertiary : theme.textPrimary)
                if let detail {
                    Text(detail)
                        .font(.custom("Figtree", size: 10).weight(.medium))
                        .foregroundStyle(theme.textTertiary)
                }
            }
            Spacer(minLength: 12)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(theme.accent)
                .disabled(disabled)
        }
        .frame(maxWidth: .infinity)
    }
}

private enum PermissionOnboardingMetrics {
    static let titleTracking: CGFloat = 0.14
    static let bodyTracking: CGFloat = 0.13
    static let actionTracking: CGFloat = 0.14
}

private struct MenuWindowBorderCleaner: NSViewRepresentable {
    let theme: CopilotThemeTokens
    let isDark: Bool
    let cornerRadius: CGFloat

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async {
            configureWindow(from: view)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            configureWindow(from: nsView)
        }
    }

    private func configureWindow(from view: NSView) {
        guard let window = view.window else { return }
        let clearColor = NSColor.clear
        window.isOpaque = false
        window.backgroundColor = clearColor
        window.hasShadow = false
        window.appearance = NSAppearance(named: isDark ? .darkAqua : .aqua)
        window.contentView?.superview?.wantsLayer = true
        window.contentView?.superview?.layer?.backgroundColor = clearColor.cgColor
        window.contentView?.superview?.layer?.cornerRadius = cornerRadius
        window.contentView?.superview?.layer?.masksToBounds = true
        window.contentView?.superview?.layer?.borderWidth = 0
        window.contentView?.superview?.layer?.borderColor = clearColor.cgColor
        window.contentView?.superview?.layer?.shadowOpacity = 0
        window.contentView?.wantsLayer = true
        window.contentView?.layer?.cornerRadius = cornerRadius
        window.contentView?.layer?.masksToBounds = true
        window.contentView?.layer?.borderWidth = 0
        window.contentView?.layer?.borderColor = clearColor.cgColor
        window.contentView?.layer?.shadowOpacity = 0
        clearAncestorLayers(from: view)
        clearBorders(in: window.contentView)
    }

    private func clearAncestorLayers(from view: NSView) {
        var current: NSView? = view
        while let node = current {
            node.wantsLayer = true
            node.layer?.backgroundColor = NSColor.clear.cgColor
            node.layer?.borderWidth = 0
            node.layer?.borderColor = NSColor.clear.cgColor
            node.layer?.shadowOpacity = 0
            current = node.superview
        }
    }

    private func clearBorders(in view: NSView?) {
        guard let view else { return }
        view.wantsLayer = true
        view.layer?.borderWidth = 0
        view.layer?.borderColor = NSColor.clear.cgColor
        for subview in view.subviews {
            clearBorders(in: subview)
        }
    }
}
