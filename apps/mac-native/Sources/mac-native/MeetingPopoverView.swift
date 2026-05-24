import SwiftUI

struct MeetingPopoverView: View {
    @ObservedObject var store: MeetingStore
    @State private var showDiagnostics = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if store.isRestoringSession {
                loadingCard
            } else if !store.isAuthenticated {
                loginCard
            } else {
                if store.meetingNotesEnabled {
                    upcomingCard
                }
                if store.lastVoiceActionResult != nil {
                    voiceActionResultCard
                }
                if store.isAgentResponding || !store.lastAgentTextResponse.isEmpty {
                    agentResponseCard
                }
                settingsCard
            }

            footer
        }
        .padding(12)
        .background(BrandTheme.surface)
        .preferredColorScheme(.light)
    }

    private var header: some View {
        HStack(spacing: 8) {
            if let logo = BrandTheme.logo {
                Image(nsImage: logo)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 16)
                    .opacity(0.62)
            }
            Spacer()
            Text("Copilot")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.labelLight)
        }
    }

    private var copilotCard: some View {
        card {
            HStack(alignment: .center, spacing: 8) {
                sectionLabel("Voice copilot")
                Spacer()
                HStack(spacing: 5) {
                    hotkeyPill("⌥Space")
                    hotkeyPill("⌥⇧Space")
                }
            }

            if store.availableAgents.count > 1 {
                Picker("", selection: $store.selectedAgentId) {
                    ForEach(store.availableAgents) { agent in
                        Text(agent.name).tag(agent.id)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .font(.custom("Figtree", size: 12).weight(.medium))
            } else if let agent = store.availableAgents.first {
                Text(agent.name)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textPrimary)
                    .lineLimit(1)
            } else {
                Text("No enabled agent")
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
            }

            Button(store.isListening ? "Stop and act" : "Talk to Copilot") {
                store.toggleCopilotVoiceCapture()
            }
            .buttonStyle(DragonFruitPrimaryButtonStyle())
            .disabled(store.availableAgents.isEmpty && !store.isListening)

            if store.isListening {
                Text(store.lastTranscript.isEmpty ? "Listening..." : store.lastTranscript)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(3)
            } else if store.isAgentResponding {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Copilot is acting...")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                }
            } else if !store.lastAgentTextResponse.isEmpty {
                Text(store.lastAgentTextResponse)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(5)
            } else if !store.statusMessage.isEmpty && !isMeetingRefreshStatusVisible {
                Text(store.statusMessage)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(2)
            }
        }
    }

    private var loginCard: some View {
        card {
            Text("Login to DragonFruit")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.labelLight)
            Button("Continue with DragonFruit") {
                Task { await store.beginDragonFruitLogin() }
            }
            .buttonStyle(DragonFruitPrimaryButtonStyle())
            Text("Sign in on the web to sync meetings and cowork with your agent. You’ll return here automatically.")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
        }
    }

    private var voiceActionResultCard: some View {
        card {
            if let result = store.lastVoiceActionResult {
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: voiceActionIcon(for: result.type))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BrandTheme.accent)
                        .frame(width: 18)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(result.type.rawValue) created")
                            .font(.custom("Figtree", size: 10).weight(.semibold))
                            .foregroundStyle(BrandTheme.labelLight)
                        Text(result.title)
                            .font(.custom("Newsreader", size: 16).weight(.regular))
                            .foregroundStyle(BrandTheme.textPrimary)
                            .lineLimit(2)
                        Text(result.detail)
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(BrandTheme.textSecondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if result.resourceURL != nil {
                        Button {
                            store.openLastVoiceActionResult()
                        } label: {
                            Image(systemName: "arrow.up.forward")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(BrandTheme.accent)
                                .frame(width: 24, height: 24)
                                .background(BrandTheme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var agentResponseCard: some View {
        card {
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: "sparkles")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(BrandTheme.accent)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Copilot answer")
                        .font(.custom("Figtree", size: 10).weight(.semibold))
                        .foregroundStyle(BrandTheme.labelLight)
                    if store.isAgentResponding && store.lastAgentTextResponse.isEmpty {
                        HStack(spacing: 7) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Thinking with cursor context...")
                                .font(.custom("Figtree", size: 11).weight(.medium))
                                .foregroundStyle(BrandTheme.textSecondary)
                        }
                    } else {
                        Text(store.lastAgentTextResponse)
                            .font(.custom("Newsreader", size: 15).weight(.regular))
                            .foregroundStyle(BrandTheme.textPrimary)
                            .lineLimit(5)
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
                        .foregroundStyle(BrandTheme.textPrimary)
                    Text("One moment while Copilot verifies this Mac.")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                }
                Spacer()
            }
        }
    }

    private var settingsCard: some View {
        card {
            sectionLabel("Settings")
            featureToggle("Meeting notes", isOn: $store.meetingNotesEnabled)
            featureToggle("Cursor Buddy", isOn: $store.speechCaptureEnabled, detail: "⌥Space")
            if store.speechCaptureEnabled {
                cursorBuddyAgentPicker
            }
            featureToggle("Dictation", isOn: $store.cursorBuddyEnabled, detail: "Hold ⌥")
            if store.cursorBuddyEnabled {
                languagePicker
            }
            featureToggle("Gaze tracking", isOn: $store.gazeTrackingEnabled, detail: "Soon", disabled: true)

            Divider()
                .overlay(BrandTheme.border)
                .padding(.vertical, 1)

            Button {
                withAnimation(.easeInOut(duration: 0.16)) {
                    showDiagnostics.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    sectionLabel("Setup & diagnostics")
                    Spacer()
                    if permissionsNeedAttention {
                        Text("Needs attention")
                            .font(.custom("Figtree", size: 10).weight(.semibold))
                            .foregroundStyle(BrandTheme.accent)
                    }
                    Text(showDiagnostics || permissionsNeedAttention ? "Hide" : "Show")
                        .font(.custom("Figtree", size: 10).weight(.semibold))
                        .foregroundStyle(BrandTheme.labelLight)
                }
            }
            .buttonStyle(.plain)

            if showDiagnostics || permissionsNeedAttention {
                ForEach(store.permissionStatuses) { permission in
                    Button {
                        store.handlePermissionAction(permission)
                    } label: {
                        permissionRow(permission)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 8) {
                    Button("Refresh") {
                        store.refreshPermissionStatuses()
                    }
                    .buttonStyle(.plain)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                }
            }
        }
    }

    private var cursorBuddyAgentPicker: some View {
        HStack(spacing: 10) {
            Text("Agent")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textPrimary)
            Spacer(minLength: 12)
            if store.availableAgents.count > 1 {
                Menu {
                    ForEach(store.availableAgents) { agent in
                        Button {
                            store.selectedAgentId = agent.id
                        } label: {
                            if store.selectedAgentId == agent.id {
                                Label(agent.name, systemImage: "checkmark")
                            } else {
                                Text(agent.name)
                            }
                        }
                    }
                } label: {
                    pickerPill(selectedAgentName)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
            } else {
                pickerPill(selectedAgentName)
            }
        }
    }

    private var selectedAgentName: String {
        store.availableAgents.first(where: { $0.id == store.selectedAgentId })?.name
            ?? store.availableAgents.first?.name
            ?? "No enabled agent"
    }

    private var languagePicker: some View {
        HStack(spacing: 10) {
            Text("Language")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textPrimary)
            Spacer(minLength: 12)
            Picker("", selection: $store.speechLanguage) {
                ForEach(SpeechLanguage.availableCases) { language in
                    Text(language.displayLabel).tag(language)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .controlSize(.small)
            .font(.custom("Figtree", size: 12).weight(.medium))
            .fixedSize()
        }
    }

    private func pickerPill(_ label: String) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.custom("Figtree", size: 12).weight(.semibold))
                .foregroundStyle(BrandTheme.textPrimary)
                .lineLimit(1)
            Image(systemName: "chevron.down")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(BrandTheme.labelLight)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(BrandTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func permissionRow(_ permission: PermissionStatus) -> some View {
        HStack(spacing: 8) {
            Text(permission.name)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textPrimary)
            Spacer()
            Text(permission.state)
                .font(.custom("Figtree", size: 10).weight(.semibold))
                .foregroundStyle(permissionStateColor(permission.state))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(BrandTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .contentShape(Rectangle())
    }

    private var upcomingCard: some View {
        card {
            sectionLabel("Upcoming meeting")
            if store.needsCalendarReconnect {
                Text("Reconnect to load next meeting.")
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(2)
            } else if store.googleConnected {
                if !store.hasMeetingsToday && store.meeting.id != "empty" {
                    Text("No meetings today")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                } else if store.meeting.id == "empty" {
                    Text("No upcoming meetings")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                } else {
                    Text(store.meeting.title)
                        .font(.custom("Newsreader", size: 16).weight(.regular))
                        .foregroundStyle(BrandTheme.textPrimary)
                        .lineLimit(2)
                        .lineSpacing(0)
                    HStack(spacing: 8) {
                        Text(store.nextUpCountdownLabel)
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(BrandTheme.textSecondary)
                        Spacer()
                    }
                    HStack(spacing: 8) {
                        if store.meeting.joinURL != nil {
                            Button("Join meeting") {
                                store.openJoinLink()
                            }
                            .buttonStyle(DragonFruitPrimaryButtonStyle())
                        }
                        if !store.meeting.calendarDisplayName.isEmpty {
                            Text(store.meeting.calendarDisplayName)
                                .font(.custom("Figtree", size: 10).weight(.medium))
                                .foregroundStyle(BrandTheme.labelLight)
                                .lineLimit(1)
                        }
                        Spacer()
                    }
                }
            } else {
                Button("Connect Google Calendar") {
                    Task { await store.connectGoogle() }
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
            }
        }
    }

    private var footer: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if store.isAuthenticated {
                Button("Log out") {
                    store.logout()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
            }
            Spacer(minLength: 8)
            if isFooterStatusVisible {
                Text(footerStatusText)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
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
        if store.isListening {
            return store.lastTranscript.isEmpty ? store.statusMessage : store.lastTranscript
        }
        return store.statusMessage
    }

    private var permissionsNeedAttention: Bool {
        store.permissionStatuses.contains { permission in
            !["Allowed", "Connected"].contains(permission.state)
        }
    }

    private func permissionStateColor(_ state: String) -> Color {
        ["Allowed", "Connected"].contains(state) ? BrandTheme.labelLight : BrandTheme.accent
    }

    private func voiceActionIcon(for type: VoiceCaptureType) -> String {
        switch type {
        case .task:
            return "checkmark.circle.fill"
        case .doc:
            return "doc.text.fill"
        case .sticky:
            return "note.text"
        case .agent:
            return "sparkles"
        }
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(BrandTheme.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func sectionLabel(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.custom("Figtree", size: 10).weight(.medium))
            .foregroundStyle(BrandTheme.labelLight)
    }

    private func hotkeyPill(_ label: String) -> some View {
        Text(label)
            .font(.custom("Figtree", size: 10).weight(.semibold))
            .foregroundStyle(BrandTheme.labelLight)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(BrandTheme.surface)
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
                    .foregroundStyle(disabled ? BrandTheme.labelLight : BrandTheme.textPrimary)
                if let detail {
                    Text(detail)
                        .font(.custom("Figtree", size: 10).weight(.medium))
                        .foregroundStyle(BrandTheme.labelLight)
                }
            }
            Spacer(minLength: 12)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(BrandTheme.accent)
                .disabled(disabled)
        }
        .frame(maxWidth: .infinity)
    }
}
