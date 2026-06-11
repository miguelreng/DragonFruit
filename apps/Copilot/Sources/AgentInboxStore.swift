// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import Foundation
import os
import UserNotifications

/// Drives the Atlas follow-ups strip in the menu-bar popover.
///
/// Polls GET /agent-runs/inbox/ every 90 seconds (slower than the
/// 60-second calendar/meeting cadence — inbox is less time-sensitive).
/// On each poll it diffs the returned run_ids against the previous set
/// and fires a macOS local notification for every NEW needs_input item.
///
/// The store does NOT own the APIClient. The owning object (MeetingStore)
/// calls `refresh(client:workspaceSlug:)` on each poll tick so the token
/// and base-URL always come from the single source of truth.
@MainActor
final class AgentInboxStore: ObservableObject {
    @Published private(set) var items: [AgentInboxItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var lastError: String?

    private var pollTask: Task<Void, Never>?
    private var seenRunIds: Set<String> = []
    private var notificationAuthRequested = false

    private static let logger = Logger(subsystem: "sh.dragonfruit.copilot", category: "agent-inbox")
    private static let pollInterval: TimeInterval = 90

    // MARK: - Lifecycle

    /// Start polling. Safe to call repeatedly — cancels any existing task first.
    func startPolling(makeClient: @escaping () throws -> APIClient, workspaceSlug: @escaping () -> String) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let slug = workspaceSlug()
                guard !slug.isEmpty else {
                    try? await Task.sleep(nanoseconds: UInt64(Self.pollInterval * 1_000_000_000))
                    continue
                }
                if let client = try? makeClient() {
                    await self.refresh(client: client, workspaceSlug: slug)
                }
                try? await Task.sleep(nanoseconds: UInt64(Self.pollInterval * 1_000_000_000))
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Refresh

    func refresh(client: APIClient, workspaceSlug: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await client.fetchAgentInbox(workspaceSlug: workspaceSlug)
            let newNeedsInput = fetched.filter { item in
                item.status == "needs_input" && !seenRunIds.contains(item.run_id)
            }
            items = fetched
            seenRunIds = Set(fetched.map(\.run_id))
            lastError = nil

            // Fire local notifications for newly-surfaced follow-ups.
            if !newNeedsInput.isEmpty {
                await requestNotificationAuthIfNeeded()
                for item in newNeedsInput {
                    await fireLocalNotification(for: item)
                }
            }
        } catch {
            Self.logger.error("Agent inbox refresh failed: \(error.localizedDescription, privacy: .public)")
            lastError = error.localizedDescription
        }
    }

    // MARK: - Respond

    func respond(client: APIClient, workspaceSlug: String, runId: String, response humanResponse: String) async {
        do {
            try await client.respondToAgentRun(
                workspaceSlug: workspaceSlug,
                runId: runId,
                response: humanResponse
            )
            // Optimistically remove the item so the strip collapses immediately.
            items.removeAll { $0.run_id == runId }
        } catch {
            Self.logger.error("Agent respond failed: \(error.localizedDescription, privacy: .public)")
            lastError = error.localizedDescription
        }
    }

    func approve(client: APIClient, workspaceSlug: String, runId: String, approved: Bool) async {
        do {
            try await client.respondToAgentRun(
                workspaceSlug: workspaceSlug,
                runId: runId,
                approved: approved
            )
            items.removeAll { $0.run_id == runId }
        } catch {
            Self.logger.error("Agent approve failed: \(error.localizedDescription, privacy: .public)")
            lastError = error.localizedDescription
        }
    }

    // MARK: - Notifications

    private func requestNotificationAuthIfNeeded() async {
        guard !notificationAuthRequested else { return }
        notificationAuthRequested = true
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound])
    }

    private func fireLocalNotification(for item: AgentInboxItem) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Atlas needs you"
        if let issue = item.issue {
            content.subtitle = "#\(issue.sequence_id) \(issue.name)"
        }
        content.body = item.message
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "agent-run-\(item.run_id)",
            content: content,
            trigger: nil  // deliver immediately
        )
        try? await center.add(request)
    }
}
