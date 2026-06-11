// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import SwiftUI

/// Compact "Atlas needs you" strip shown in the menu-bar popover when
/// there are actionable agent runs.
///
/// - needs_input/question → text field + Send
/// - needs_input/approval → Approve / Decline buttons
/// - completed/failed     → dismissible status line
struct AgentInboxView: View {
    @ObservedObject var inboxStore: AgentInboxStore
    let theme: CopilotThemeTokens
    let makeClient: () throws -> APIClient
    let workspaceSlug: String
    let appURL: String

    /// Tracks the reply draft for each run_id that is a question.
    @State private var drafts: [String: String] = [:]
    /// Which completed/failed items the user has dismissed locally.
    @State private var dismissedRunIds: Set<String> = []

    private var actionableItems: [AgentInboxItem] {
        inboxStore.items.filter { $0.status == "needs_input" }
    }

    private var recentItems: [AgentInboxItem] {
        inboxStore.items.filter {
            ($0.status == "completed" || $0.status == "failed") &&
            !dismissedRunIds.contains($0.run_id)
        }
    }

    var body: some View {
        if actionableItems.isEmpty && recentItems.isEmpty { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 6) {
                if !actionableItems.isEmpty {
                    needsYouSection
                }
                if !recentItems.isEmpty {
                    recentSection
                }
            }
            .padding(.horizontal, 4)
        )
    }

    // MARK: - Needs you

    @ViewBuilder
    private var needsYouSection: some View {
        ForEach(actionableItems) { item in
            needsInputRow(item)
        }
    }

    @ViewBuilder
    private func needsInputRow(_ item: AgentInboxItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header row
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: "#e548a5") ?? .pink)
                    .frame(width: 14, height: 14)
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 2) {
                    if let issue = item.issue {
                        Text("#\(issue.sequence_id) \(issue.name)")
                            .font(.custom("Figtree", size: 11).weight(.semibold))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                    }
                    Text(item.message)
                        .font(.custom("Figtree", size: 11))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let issue = item.issue, !appURL.isEmpty {
                    Spacer(minLength: 4)
                    Button {
                        openIssue(issue)
                    } label: {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 10))
                            .foregroundStyle(theme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
            }

            // Action area
            if item.kind == "approval" {
                approvalButtons(for: item)
            } else {
                questionInput(for: item)
            }
        }
        .padding(8)
        .background(theme.surface2, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(theme.border, lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private func approvalButtons(for item: AgentInboxItem) -> some View {
        HStack(spacing: 6) {
            Button("Approve") {
                Task { @MainActor in
                    guard let client = try? makeClient() else { return }
                    await inboxStore.approve(client: client, workspaceSlug: workspaceSlug, runId: item.run_id, approved: true)
                }
            }
            .buttonStyle(InboxActionButtonStyle(theme: theme, isPrimary: true))

            Button("Decline") {
                Task { @MainActor in
                    guard let client = try? makeClient() else { return }
                    await inboxStore.approve(client: client, workspaceSlug: workspaceSlug, runId: item.run_id, approved: false)
                }
            }
            .buttonStyle(InboxActionButtonStyle(theme: theme, isPrimary: false))

            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func questionInput(for item: AgentInboxItem) -> some View {
        let draft = Binding(
            get: { drafts[item.run_id] ?? "" },
            set: { drafts[item.run_id] = $0 }
        )
        HStack(spacing: 6) {
            TextField("Reply…", text: draft)
                .font(.custom("Figtree", size: 11))
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(theme.canvas, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(theme.border, lineWidth: 0.5)
                )

            Button("Send") {
                let text = (drafts[item.run_id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                drafts.removeValue(forKey: item.run_id)
                Task { @MainActor in
                    guard let client = try? makeClient() else { return }
                    await inboxStore.respond(client: client, workspaceSlug: workspaceSlug, runId: item.run_id, response: text)
                }
            }
            .disabled((drafts[item.run_id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .buttonStyle(InboxActionButtonStyle(theme: theme, isPrimary: true))
        }
    }

    // MARK: - Recent completed / failed

    @ViewBuilder
    private var recentSection: some View {
        ForEach(recentItems) { item in
            HStack(spacing: 6) {
                Image(systemName: item.status == "completed" ? "checkmark.circle" : "exclamationmark.circle")
                    .font(.system(size: 10))
                    .foregroundStyle(item.status == "completed" ? theme.textSecondary : theme.textTertiary)

                if let issue = item.issue {
                    Text("#\(issue.sequence_id)")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                }
                Text(item.status == "completed" ? "Atlas finished" : "Atlas failed")
                    .font(.custom("Figtree", size: 11))
                    .foregroundStyle(theme.textTertiary)
                    .lineLimit(1)

                Spacer(minLength: 0)

                Button {
                    dismissedRunIds.insert(item.run_id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8))
                        .foregroundStyle(theme.textTertiary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(theme.surface2.opacity(0.6), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }

    // MARK: - Helpers

    private func openIssue(_ issue: AgentInboxIssue) {
        let trimmed = appURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let base = URL(string: "\(trimmed)/") else { return }
        // Plane's issue URL shape: /w/{slug}/issues/{id}
        let path = "w/\(workspaceSlug)/issues/\(issue.id)"
        if let url = URL(string: path, relativeTo: base)?.absoluteURL {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Button style

private struct InboxActionButtonStyle: ButtonStyle {
    let theme: CopilotThemeTokens
    let isPrimary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("Figtree", size: 11).weight(.medium))
            .foregroundStyle(isPrimary ? Color.white : theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(isPrimary
                          ? (Color(hex: "#e548a5") ?? .pink).opacity(configuration.isPressed ? 0.85 : 1)
                          : theme.surface2.opacity(configuration.isPressed ? 0.6 : 1)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .stroke(isPrimary ? Color.clear : theme.border, lineWidth: 0.5)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Color extension

private extension Color {
    init?(hex: String) {
        var hex = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
