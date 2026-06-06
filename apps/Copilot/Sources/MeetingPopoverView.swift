import AppKit
import Sparkle
import SwiftUI

struct MeetingPopoverView: View {
    @ObservedObject var store: MeetingStore
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
                settingsCard
            }

            footer
        }
        .padding(12)
        .background {
            theme.canvas
            MenuWindowBorderCleaner(theme: theme, isDark: store.copilotTheme == .dark, cornerRadius: shellCornerRadius)
        }
        .clipShape(RoundedRectangle(cornerRadius: shellCornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: shellCornerRadius, style: .continuous)
                .stroke(store.copilotTheme == .dark ? Color(red: 0.07, green: 0.07, blue: 0.07) : theme.canvas, lineWidth: 2)
        }
        .preferredColorScheme(store.copilotTheme.colorScheme)
        .opacity(isPanelRevealed ? 1 : 0)
        .offset(y: isPanelRevealed ? 0 : 26)
        .blur(radius: isPanelRevealed ? 0 : 2)
        .onAppear {
            isPanelRevealed = false
            withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.40)) {
                isPanelRevealed = true
            }
            store.isPopoverOpen = true
            store.refreshPermissionStatuses()
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
            if let logo = BrandTheme.logo {
                Image(nsImage: logo)
                    .renderingMode(store.copilotTheme == .dark ? .template : .original)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 16)
                    .foregroundStyle(Color.white.opacity(0.88))
                    .opacity(store.copilotTheme == .dark ? 0.88 : 0.78)
            }
            Spacer()
            Text("Atlas")
                .font(.custom("Figtree", size: 10).weight(.medium))
                .foregroundStyle(theme.textTertiary)
            if store.isAuthenticated, let profile = store.userProfile {
                AtlasProfileAvatar(profile: profile, theme: theme)
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
            if let warning = store.permissionsEnvironmentWarning {
                environmentWarningBanner(warning)
            }
            if let currentPermission = store.currentMissingRequiredPermission {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: onboardingIcon(for: currentPermission))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(theme.accent)
                        .frame(width: 24, height: 24)
                        .background(theme.accentSubtle)
                        .clipShape(Circle())

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Set up Atlas")
                            .font(.custom("Figtree", size: 15).weight(.semibold))
                            .foregroundStyle(theme.textPrimary)
                        Text(onboardingTitle(for: currentPermission))
                            .font(.custom("Figtree", size: 12).weight(.semibold))
                            .foregroundStyle(theme.textPrimary)
                        Text(onboardingDetail(for: currentPermission))
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(2)
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
                    Button(onboardingButtonTitle(for: currentPermission)) {
                        store.handlePermissionAction(currentPermission)
                    }
                    .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))

                    if currentPermission.requiresRestart {
                        Button("Restart") {
                            store.restartApp()
                        }
                        .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
                    }

                    Spacer(minLength: 0)
                }

                if currentPermission.requiresRestart {
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "info.circle")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(theme.textTertiary)
                        Text("Allowed it in System Settings? macOS needs Atlas to restart before it takes effect.")
                            .font(.custom("Figtree", size: 10).weight(.medium))
                            .foregroundStyle(theme.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func environmentWarningBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 10, weight: .semibold))
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

    private func onboardingIcon(for permission: PermissionStatus) -> String {
        switch permission.id {
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

    private func onboardingTitle(for permission: PermissionStatus) -> String {
        switch permission.id {
        case "mic":
            return "Microphone"
        case "system-audio":
            return "System audio"
        case "speech":
            return "Speech recognition"
        case "accessibility":
            return "Accessibility"
        default:
            return "Finish setup"
        }
    }

    private func onboardingDetail(for permission: PermissionStatus) -> String {
        switch permission.id {
        case "mic":
            return permission.state == "Blocked"
                ? "Re-enable Microphone in System Settings, then restart Atlas."
                : "Needed for Atlas voice and dictation. macOS will ask; keep this window open."
        case "speech":
            return permission.state == "Blocked"
                ? "Re-enable Speech Recognition in System Settings, then restart Atlas."
                : "Needed to turn what you say into text."
        case "system-audio":
            return "Lets meeting notes hear others on Zoom, Meet, and Teams. Needs a quick restart."
        case "accessibility":
            return "Lets dictation type into the active field. Opens System Settings."
        default:
            return "Atlas opens the menu when setup is complete."
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
                    Image(systemName: voiceActionIcon(for: result.type))
                        .font(.system(size: 13, weight: .semibold))
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
                            Image(systemName: "arrow.up.forward")
                                .font(.system(size: 11, weight: .semibold))
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

    private var settingsCard: some View {
        card {
            Button {
                withAnimation(.easeInOut(duration: 0.16)) {
                    isSettingsExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    sectionLabel("Settings")
                    Spacer()
                    Image(systemName: isSettingsExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
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
                featureToggle("Buddy cursor", isOn: $store.showCursorBuddyEnabled, detail: store.showCursorBuddyEnabled ? "Yes" : "No")
                if store.showCursorBuddyEnabled {
                    buddyCursorTransparencyControl
                }
                if store.voiceActionsEnabled {
                    workspacePicker
                }
                featureToggle("Dictation", isOn: $store.cursorBuddyEnabled, detail: "Hold ⌥")
                featureToggle("Meeting notes", isOn: $store.meetingNotesEnabled)
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
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 11, weight: .semibold))
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
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 11, weight: .semibold))
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
                        Label(workspace.name, systemImage: "checkmark")
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
                        Label(language.displayLabel, systemImage: "checkmark")
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
                        Label(theme.label, systemImage: "checkmark")
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
            Image(systemName: "chevron.down")
                .font(.system(size: 9, weight: .semibold))
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
                screenRecordingMeetingBanner
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
                    Text(store.meeting.title)
                        .font(.custom("Newsreader", size: 16).weight(.regular))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(2)
                        .lineSpacing(0)
                    HStack(spacing: 8) {
                        Text(store.nextUpCountdownLabel)
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(theme.textSecondary)
                        Spacer()
                    }
                    HStack(spacing: 8) {
                        if store.meeting.joinURL != nil {
                            Button("Join meeting") {
                                store.openJoinLink()
                            }
                            .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))
                        }
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
                        if !store.meeting.calendarDisplayName.isEmpty {
                            Text(store.meeting.calendarDisplayName)
                                .font(.custom("Figtree", size: 10).weight(.medium))
                                .foregroundStyle(theme.textTertiary)
                                .lineLimit(1)
                        }
                        Spacer()
                    }
                    if store.lastMeetingNotesURL != nil {
                        Button("Open notes") {
                            store.openMeetingNotes()
                        }
                        .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
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

    private var screenRecordingMeetingBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(theme.accent)
                Text("Meeting notes need Screen Recording to hear other people. Allow it, then restart Atlas.")
                    .font(.custom("Figtree", size: 10).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Button("Allow Screen Recording") {
                    store.requestScreenRecording()
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle(theme: theme))
                Button("Restart") {
                    store.restartApp()
                }
                .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.layer1)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var footer: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if store.isAuthenticated {
                Button("Log out") {
                    store.logout()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textSecondary)
            }
            Spacer(minLength: 8)
            if isFooterStatusVisible {
                Text(footerStatusText)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(3)
            }
        }
    }

    private var isMeetingRefreshStatusVisible: Bool {
        guard store.meetingNotesEnabled else { return false }
        let normalized = store.statusMessage.lowercased()
        return normalized.contains("refresh") && !normalized.contains("not connected")
    }

    private var isFooterStatusVisible: Bool {
        !footerStatusText.isEmpty && !store.isRestoringSession
    }

    private var footerStatusText: String {
        if store.needsPermissionOnboarding {
            return ""
        }
        if store.isListening {
            return store.lastTranscript.isEmpty ? store.statusMessage : store.lastTranscript
        }
        return store.statusMessage
    }

    private func voiceActionIcon(for type: VoiceCaptureType) -> String {
        switch type {
        case .task:
            return "checkmark.circle.fill"
        case .doc:
            return "doc.text.fill"
        case .sticky:
            return "note.text"
        case .bookmark:
            return "bookmark.fill"
        case .agent:
            return "message.fill"
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
        let backgroundColor = NSColor(theme.canvas)
        let edgeColor = isDark ? NSColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1) : backgroundColor
        window.isOpaque = false
        window.backgroundColor = backgroundColor
        window.hasShadow = false
        window.appearance = NSAppearance(named: isDark ? .darkAqua : .aqua)
        window.contentView?.superview?.wantsLayer = true
        window.contentView?.superview?.layer?.backgroundColor = backgroundColor.cgColor
        window.contentView?.superview?.layer?.cornerRadius = cornerRadius
        window.contentView?.superview?.layer?.masksToBounds = true
        window.contentView?.superview?.layer?.borderWidth = 0
        window.contentView?.superview?.layer?.borderColor = edgeColor.cgColor
        window.contentView?.superview?.layer?.shadowOpacity = 0
        window.contentView?.wantsLayer = true
        window.contentView?.layer?.cornerRadius = cornerRadius
        window.contentView?.layer?.masksToBounds = true
        window.contentView?.layer?.borderWidth = 0
        window.contentView?.layer?.borderColor = edgeColor.cgColor
        window.contentView?.layer?.shadowOpacity = 0
        darkenAncestorLayers(from: view, backgroundColor: backgroundColor, edgeColor: edgeColor)
        clearBorders(in: window.contentView)
    }

    private func darkenAncestorLayers(from view: NSView, backgroundColor: NSColor, edgeColor: NSColor) {
        var current: NSView? = view
        while let node = current {
            node.wantsLayer = true
            node.layer?.backgroundColor = backgroundColor.cgColor
            node.layer?.borderWidth = 0
            node.layer?.borderColor = edgeColor.cgColor
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

/// The signed-in user's profile picture, configured in the web app's settings.
/// Falls back to their initials while loading or when no avatar is set.
struct AtlasProfileAvatar: View {
    let profile: AtlasUserProfile
    let theme: CopilotThemeTokens
    var size: CGFloat = 18

    var body: some View {
        avatar
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(theme.borderStrong, lineWidth: 1))
            .help(profile.displayName.isEmpty ? profile.email : profile.displayName)
    }

    @ViewBuilder
    private var avatar: some View {
        if let url = profile.avatarURL {
            AsyncImage(url: url) { phase in
                if case let .success(image) = phase {
                    image.resizable().scaledToFill()
                } else {
                    initials
                }
            }
        } else {
            initials
        }
    }

    private var initials: some View {
        ZStack {
            theme.accentSubtle
            Text(profile.initials)
                .font(.custom("Figtree", size: size * 0.44).weight(.semibold))
                .foregroundStyle(theme.accent)
        }
    }
}
