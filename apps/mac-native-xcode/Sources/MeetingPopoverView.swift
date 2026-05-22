import SwiftUI

struct MeetingPopoverView: View {
    @StateObject private var store = MeetingStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if let logo = BrandTheme.logo {
                    Image(nsImage: logo)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 20, height: 20)
                }
                Text("DragonFruit")
                    .font(.custom("Figtree", size: 11).weight(.semibold))
                    .foregroundStyle(BrandTheme.accent)
            }

            Text("DragonFruit Orbit")
                .font(.custom("Newsreader", size: 30).weight(.semibold))
                .foregroundStyle(BrandTheme.textPrimary)
                .lineLimit(1)

            if !store.isAuthenticated {
                card {
                    Text("Login to DragonFruit")
                        .font(.custom("Figtree", size: 12).weight(.semibold))
                        .foregroundStyle(BrandTheme.textSecondary)
                    Button("Continue with DragonFruit") {
                        Task { await store.beginDragonFruitLogin() }
                    }
                    .buttonStyle(.borderedProminent)
                    Text("Use email/password or Google from the web screen, then return automatically.")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                }
            } else {
                card {
                    HStack {
                        labelRow("Google", value: store.googleConnected ? "Connected" : "Not connected")
                        Spacer()
                        Button(store.googleConnected ? "Refresh" : "Connect") {
                            Task {
                                if store.googleConnected {
                                    await store.refreshCalendarState()
                                } else {
                                    await store.connectGoogle()
                                }
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
            }

            card {
                labelRow("Upcoming meeting", value: store.countdownLabel)
                Text(store.meeting.title)
                    .font(.custom("Newsreader", size: 34).weight(.medium))
                    .lineSpacing(-2)
                    .lineLimit(2)
            }

            card {
                HStack {
                    labelRow("Recorder", value: store.meetingState)
                    Spacer()
                    Button(store.meetingState == "Recording" ? "Stop" : "Start") {
                        store.toggleRecording()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            }

            card {
                HStack(spacing: 10) {
                    Toggle("Auto-start", isOn: $store.autoStartEnabled)
                    Spacer()
                    Text("\(store.autoStartMinutesBefore) min")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                    Stepper("", value: $store.autoStartMinutesBefore, in: 0 ... 30)
                        .labelsHidden()
                }
            }

            card {
                labelRow("Voice Notes", value: store.isListening ? "Listening" : "Idle")
                Text("Press ⌥⌘Space to capture an idea and auto-sort to Task / Doc / Sticky.")
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                HStack {
                    Button(store.isListening ? "Stop listening" : "Start listening") {
                        store.toggleVoiceCapture()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)

                    Button("Spawn DragonFruit Agent") {
                        store.spawnAgentFromVoice()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                HStack(spacing: 8) {
                    Text("Agent")
                        .font(.custom("Figtree", size: 11).weight(.semibold))
                        .foregroundStyle(BrandTheme.textSecondary)
                    if store.availableAgents.isEmpty {
                        Text("No enabled agents")
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(BrandTheme.textSecondary)
                    } else {
                        Picker("Agent", selection: $store.selectedAgentId) {
                            ForEach(store.availableAgents) { agent in
                                Text(agent.name).tag(agent.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                    }
                    Spacer()
                    Button("Refresh") {
                        Task { await store.refreshAvailableAgents() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                }
                if let capture = store.lastCapture {
                    Text("\(capture.type.rawValue) → \(capture.projectHint)")
                        .font(.custom("Figtree", size: 11).weight(.semibold))
                        .foregroundStyle(BrandTheme.accent)
                    Text(capture.title)
                        .font(.custom("Newsreader", size: 18).weight(.medium))
                        .foregroundStyle(BrandTheme.textPrimary)
                        .lineLimit(2)
                }
                if !store.lastAgentTextResponse.isEmpty {
                    Text("Agent reply")
                        .font(.custom("Figtree", size: 11).weight(.semibold))
                        .foregroundStyle(BrandTheme.accent)
                    Text(store.lastAgentTextResponse)
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textPrimary)
                        .lineLimit(6)
                }
                if store.isAgentResponding {
                    Text("Agent is typing...")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                }
            }

            if !store.statusMessage.isEmpty {
                Text(store.statusMessage)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
            }
        }
        .padding(12)
        .background(BrandTheme.surface)
        .preferredColorScheme(.light)
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
    private func labelRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label.uppercased())
                .font(.custom("Figtree", size: 10).weight(.semibold))
                .foregroundStyle(BrandTheme.accent)
            Spacer()
            Text(value)
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
        }
    }
}
