import SwiftUI

struct MeetingPopoverView: View {
    @StateObject private var store = MeetingStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if store.isRestoringSession {
                loadingCard
            } else if !store.isAuthenticated {
                loginCard
            } else {
                copilotCard
                if store.meetingNotesEnabled {
                    upcomingCard
                }
                permissionsCard
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
            featureToggle("Voice actions", isOn: $store.speechCaptureEnabled, detail: "⌥Space")
            featureToggle("Dictation", isOn: $store.cursorBuddyEnabled, detail: "⌥⇧Space")
            featureToggle("Gaze tracking", isOn: $store.gazeTrackingEnabled, detail: "Soon", disabled: true)
        }
    }

    private var permissionsCard: some View {
        card {
            sectionLabel("Permissions")
            ForEach(store.permissionStatuses) { permission in
                HStack(spacing: 8) {
                    Text(permission.name)
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textPrimary)
                    Spacer()
                    Text(permission.state)
                        .font(.custom("Figtree", size: 10).weight(.semibold))
                        .foregroundStyle(BrandTheme.labelLight)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(BrandTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
            HStack(spacing: 8) {
                Button("Voice") {
                    store.requestVoicePermissions()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
                Button("Dictation") {
                    store.openAccessibilitySettings()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
                Spacer()
                Button("Refresh") {
                    store.refreshPermissionStatuses()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
            }
        }
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
            if isMeetingRefreshStatusVisible {
                Text(store.statusMessage)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(2)
            }
        }
    }

    private var isMeetingRefreshStatusVisible: Bool {
        guard store.meetingNotesEnabled else { return false }
        let normalized = store.statusMessage.lowercased()
        return normalized.contains("refresh") && !normalized.contains("not connected")
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
