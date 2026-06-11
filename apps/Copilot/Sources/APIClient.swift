import Foundation
import os

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}

struct CalendarAccount: Codable, Identifiable {
    let id: String
    let provider: String
    let account_email: String
    let primary_calendar_id: String
    let is_active: Bool
}

struct CalendarEvent: Codable, Identifiable {
    let id: String
    let title: String
    let description: String
    let location: String
    let start: String
    let end: String
    let all_day: Bool
    let html_link: String
    let hangout_link: String?
    let status: String
    let account_id: String?
    let account_email: String?
    let calendar_id: String?
    let calendar_name: String?
    let source: String?
    let attendee_count: Int?
    let has_other_attendees: Bool?
}

struct CalendarServiceError: LocalizedError {
    let statusCode: Int
    let message: String

    var errorDescription: String? { message }
}

struct WorkspaceSummary: Codable, Identifiable {
    let id: String
    let slug: String
    let name: String
}

struct ProjectSummary: Codable, Identifiable {
    let id: String
    let name: String
    let identifier: String?
}

struct CreatedEntity: Codable {
    let id: String
    let name: String?
}

struct CreatedBookmark: Codable {
    let id: String
    let title: String
}

struct MeetingNotesDraftResponse: Codable {
    let id: String
    let name: String?
    let created: Bool?
    let workspace_slug: String?
    let url: String?
    let calendar_attached: Bool?
}

struct MyTaskSummary: Codable, Identifiable {
    let id: String
    let name: String
    let priority: String?
    let sequence_id: Int?
    let project_id: String?
    let state_id: String?
    let target_date: String?
}

struct StateSummary: Codable, Identifiable {
    let id: String
    let name: String
    let group: String
}

struct AgentSummary: Codable, Identifiable {
    let id: String
    let name: String
    let is_enabled: Bool
}

struct AgentChatSession: Codable, Identifiable {
    let id: String
    let agent: String
    let title: String
}

struct AgentChatMessageEnvelope: Codable {
    struct Message: Codable {
        let id: String
        let role: String
        let content: String
        let error_message: String
    }
    let user_message: Message
    let assistant_message: Message
}

struct AgentChatAttachmentPayload {
    let name: String
    let mimeType: String
    let contentBase64: String

    var jsonObject: [String: String] {
        [
            "name": name,
            "mime_type": mimeType,
            "content_base64": contentBase64,
        ]
    }
}

private struct PagedResponse<Element: Decodable>: Decodable {
    let results: [Element]
}

struct OAuthStartResponse: Codable {
    let authorize_url: String
}

struct CSRFResponse: Codable {
    let csrf_token: String
}

private struct MultipartFile {
    let fieldName: String
    let fileURL: URL
    let mimeType: String
}

struct APIClient {
    var baseURL: URL
    var apiToken: String?
    private let session: URLSession
    private static let logger = Logger(subsystem: "sh.dragonfruit.copilot", category: "api")
    private static let defaultTimeout: TimeInterval = 12
    private static let calendarReadTimeout: TimeInterval = 25

    init(baseURL: URL, apiToken: String?) {
        self.baseURL = baseURL
        self.apiToken = apiToken
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpCookieAcceptPolicy = .always
        configuration.timeoutIntervalForRequest = Self.defaultTimeout
        configuration.timeoutIntervalForResource = 90
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)
    }

    private func authorizedRequest(url: URL, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = Self.defaultTimeout
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        return request
    }

    func fetchCSRFToken() async throws -> String {
        let url = baseURL.appending(path: "auth/get-csrf-token/")
        let (data, response) = try await send(URLRequest(url: url), endpoint: "GET auth/get-csrf-token")
        try ensureStatus(response, allowed: [200])
        return try JSONDecoder().decode(CSRFResponse.self, from: data).csrf_token
    }

    func signIn(email: String, password: String) async throws {
        let csrf = try await fetchCSRFToken()
        var request = URLRequest(url: baseURL.appending(path: "auth/sign-in/"))
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let body = [
            "email": email,
            "password": password,
            "next_path": "/",
            "csrfmiddlewaretoken": csrf,
        ]
        request.httpBody = formEncode(body).data(using: .utf8)

        let (_, response) = try await send(request, endpoint: "POST auth/sign-in")
        try ensureStatus(response, allowed: [200, 302, 303])
        _ = try await getCurrentUser()
    }

    func getCurrentUser() async throws -> [String: Any] {
        let url = baseURL.appending(path: "api/users/me/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET api/users/me")
        try ensureStatus(response, allowed: [200])
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "DragonFruitNative", code: 1001, userInfo: [NSLocalizedDescriptionKey: "Invalid user payload"])
        }
        return json
    }

    func listCalendarAccounts() async throws -> [CalendarAccount] {
        let url = baseURL.appending(path: "api/users/me/calendar-accounts/")
        var request = authorizedRequest(url: url)
        request.timeoutInterval = Self.calendarReadTimeout
        let (data, response) = try await send(request, endpoint: "GET calendar-accounts", retryOnTimeout: true)
        try ensureCalendarStatus(response, data: data, allowed: [200])
        return try JSONDecoder().decode([CalendarAccount].self, from: data)
    }

    func startGoogleOAuth() async throws -> URL {
        var components = URLComponents(url: baseURL.appending(path: "api/users/me/calendar-accounts/google/start/"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "client", value: "web")]
        guard let url = components?.url else {
            throw NSError(domain: "DragonFruitNative", code: 1004, userInfo: [NSLocalizedDescriptionKey: "Invalid Google start URL"])
        }
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET google/start")
        try ensureStatus(response, allowed: [200])
        let payload = try JSONDecoder().decode(OAuthStartResponse.self, from: data)
        guard let authURL = URL(string: payload.authorize_url) else {
            throw NSError(domain: "DragonFruitNative", code: 1003, userInfo: [NSLocalizedDescriptionKey: "Invalid authorize URL"])
        }
        return authURL
    }

    func getEvents(accountId: String, fromISO: String, toISO: String) async throws -> [CalendarEvent] {
        var components = URLComponents(url: baseURL.appending(path: "api/users/me/calendar-accounts/\(accountId)/events/"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "from", value: fromISO),
            URLQueryItem(name: "to", value: toISO),
        ]
        guard let url = components?.url else {
            throw NSError(domain: "DragonFruitNative", code: 1002, userInfo: [NSLocalizedDescriptionKey: "Invalid events URL"])
        }
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET calendar events")
        try ensureCalendarStatus(response, data: data, allowed: [200])

        struct EventsResponse: Codable {
            let events: [CalendarEvent]
        }

        return try JSONDecoder().decode(EventsResponse.self, from: data).events
    }

    func getUpcomingMeetings(fromISO: String, toISO: String) async throws -> [CalendarEvent] {
        var components = URLComponents(url: baseURL.appending(path: "api/users/me/calendar/upcoming-meetings/"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "from", value: fromISO),
            URLQueryItem(name: "to", value: toISO),
        ]
        guard let url = components?.url else {
            throw NSError(domain: "DragonFruitNative", code: 1005, userInfo: [NSLocalizedDescriptionKey: "Invalid meetings URL"])
        }
        var request = authorizedRequest(url: url)
        request.timeoutInterval = Self.calendarReadTimeout
        let (data, response) = try await send(request, endpoint: "GET upcoming meetings", retryOnTimeout: true)
        try ensureCalendarStatus(response, data: data, allowed: [200])

        struct EventsResponse: Codable {
            let events: [CalendarEvent]
        }

        return try JSONDecoder().decode(EventsResponse.self, from: data).events
    }

    func createMeetingNotesDraft(
        workspaceSlug: String,
        meeting: MeetingInfo,
        notes: String,
        micAudioURL: URL? = nil,
        systemAudioURL: URL? = nil
    ) async throws -> MeetingNotesDraftResponse {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/calendar/meeting-notes/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("cursor-buddy", forHTTPHeaderField: "X-DragonFruit-Source")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        let fields = [
            "meeting_id": meeting.eventId,
            "meeting_title": meeting.title,
            "start": ISO8601DateFormatter().string(from: meeting.startAt),
            "end": ISO8601DateFormatter().string(from: meeting.endAt),
            "meeting_url": meeting.joinURL?.absoluteString ?? meeting.htmlLink ?? "",
            "account_id": meeting.accountId ?? "",
            "account_email": meeting.accountEmail ?? "",
            "calendar_id": meeting.calendarId ?? "",
            "notes": notes,
        ]
        let files = [
            ("mic_audio", micAudioURL, "audio/wav"),
            ("system_audio", systemAudioURL, "audio/m4a"),
        ].compactMap { fieldName, url, mimeType -> MultipartFile? in
            guard let url, FileManager.default.fileExists(atPath: url.path) else { return nil }
            return MultipartFile(fieldName: fieldName, fileURL: url, mimeType: mimeType)
        }
        if files.isEmpty {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: fields)
        } else {
            let boundary = "DragonFruitBoundary-\(UUID().uuidString)"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.httpBody = try makeMultipartBody(fields: fields, files: files, boundary: boundary)
        }
        let (data, response) = try await send(request, endpoint: "POST meeting notes")
        try ensureStatus(response, data: data, allowed: [200, 201])
        return try JSONDecoder().decode(MeetingNotesDraftResponse.self, from: data)
    }

    func listWorkspaces() async throws -> [WorkspaceSummary] {
        let url = baseURL.appending(path: "api/workspaces/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET workspaces")
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: WorkspaceSummary.self)
    }

    func listProjects(workspaceSlug: String) async throws -> [ProjectSummary] {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET projects")
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: ProjectSummary.self)
    }

    func createTask(workspaceSlug: String, projectId: String, title: String, descriptionHtml: String) async throws -> CreatedEntity {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/issues/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("cursor-buddy", forHTTPHeaderField: "X-DragonFruit-Source")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": title,
            "description_html": descriptionHtml,
            "priority": "none",
        ])
        let (data, response) = try await send(request, endpoint: "POST task")
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedEntity.self, from: data)
    }

    func createDoc(workspaceSlug: String, projectId: String, title: String, descriptionHtml: String) async throws -> CreatedEntity {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/pages/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("cursor-buddy", forHTTPHeaderField: "X-DragonFruit-Source")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": title,
            "page_type": "doc",
            "description_html": descriptionHtml,
        ])
        let (data, response) = try await send(request, endpoint: "POST doc")
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedEntity.self, from: data)
    }

    func createSticky(workspaceSlug: String, title: String, descriptionHtml: String) async throws -> CreatedEntity {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/stickies/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": title,
            "description_html": descriptionHtml,
        ])
        let (data, response) = try await send(request, endpoint: "POST sticky")
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedEntity.self, from: data)
    }

    func createBookmark(
        workspaceSlug: String,
        projectId: String,
        title: String,
        url bookmarkURL: String,
        description: String,
        metadata: [String: String],
        tags: [String] = []
    ) async throws -> CreatedBookmark {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/bookmarks/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("cursor-buddy", forHTTPHeaderField: "X-DragonFruit-Source")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "title": title,
            "url": bookmarkURL,
            "description": description,
            "metadata": metadata,
            "tags": tags,
        ])
        let (data, response) = try await send(request, endpoint: "POST bookmark")
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedBookmark.self, from: data)
    }

    func listMyOpenTasks(workspaceSlug: String, userId: String) async throws -> [MyTaskSummary] {
        var components = URLComponents(
            url: baseURL.appending(path: "api/workspaces/\(workspaceSlug)/user-issues/\(userId)/"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "assignees", value: userId),
            URLQueryItem(name: "state_group", value: "backlog,unstarted,started"),
            URLQueryItem(name: "order_by", value: "-created_at"),
            URLQueryItem(name: "per_page", value: "20"),
        ]
        guard let url = components?.url else {
            throw NSError(domain: "DragonFruitNative", code: 1006, userInfo: [NSLocalizedDescriptionKey: "Invalid my-tasks URL"])
        }
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET my tasks")
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: MyTaskSummary.self)
    }

    func listStates(workspaceSlug: String, projectId: String) async throws -> [StateSummary] {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/states/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET states")
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: StateSummary.self)
    }

    func setTaskState(workspaceSlug: String, projectId: String, issueId: String, stateId: String) async throws {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/issues/\(issueId)/")
        var request = authorizedRequest(url: url, method: "PATCH")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("cursor-buddy", forHTTPHeaderField: "X-DragonFruit-Source")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["state_id": stateId])
        let (data, response) = try await send(request, endpoint: "PATCH task state")
        try ensureStatus(response, data: data, allowed: [200])
    }

    func listAgents(workspaceSlug: String) async throws -> [AgentSummary] {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/agents/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await send(request, endpoint: "GET agents")
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: AgentSummary.self)
    }

    func createAgentChatSession(workspaceSlug: String, agentId: String? = nil, title: String) async throws -> AgentChatSession {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/agent-chats/sessions/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        var body: [String: Any] = ["title": title]
        if let agentId, !agentId.isEmpty {
            body["agent_id"] = agentId
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await send(request, endpoint: "POST agent session")
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(AgentChatSession.self, from: data)
    }

    func sendAgentChatMessage(
        workspaceSlug: String,
        sessionId: String,
        content: String,
        projectId: String? = nil,
        toolMode: String? = nil,
        attachments: [AgentChatAttachmentPayload] = [],
        contextNote: String? = nil,
        forceDocumentTool: Bool = false
    ) async throws -> AgentChatMessageEnvelope {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/agent-chats/sessions/\(sessionId)/messages/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 75
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        var body: [String: Any] = ["content": content]
        if let projectId, !projectId.isEmpty {
            body["project_id"] = projectId
        }
        if let toolMode, !toolMode.isEmpty {
            body["tool_mode"] = toolMode
        }
        if !attachments.isEmpty {
            body["attachments"] = attachments.map(\.jsonObject)
        }
        if let contextNote, !contextNote.isEmpty {
            body["context_note"] = contextNote
        }
        if forceDocumentTool {
            body["force_document_tool"] = true
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await send(request, endpoint: "POST agent message")
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(AgentChatMessageEnvelope.self, from: data)
    }

    private func send(_ request: URLRequest, endpoint: String, retryOnTimeout: Bool = false) async throws -> (Data, URLResponse) {
        let maxAttempts = retryOnTimeout ? 2 : 1
        for attempt in 1...maxAttempts {
            let startedAt = Date()
            do {
                let result = try await session.data(for: request)
                let elapsed = Date().timeIntervalSince(startedAt)
                Self.logger.info("DragonFruit API \(endpoint, privacy: .public) completed in \(elapsed, privacy: .public)s (attempt \(attempt, privacy: .public)/\(maxAttempts, privacy: .public))")
                return result
            } catch {
                let elapsed = Date().timeIntervalSince(startedAt)
                Self.logger.error("DragonFruit API \(endpoint, privacy: .public) failed in \(elapsed, privacy: .public)s (attempt \(attempt, privacy: .public)/\(maxAttempts, privacy: .public)): \(error.localizedDescription, privacy: .public)")
                let isTimedOut = (error as? URLError)?.code == .timedOut
                if retryOnTimeout, isTimedOut, attempt < maxAttempts {
                    try? await Task.sleep(nanoseconds: 500_000_000)
                    continue
                }
                if isTimedOut {
                    throw NSError(
                        domain: "DragonFruitNative",
                        code: (error as? URLError)?.errorCode ?? 408,
                        userInfo: [NSLocalizedDescriptionKey: "\(endpoint) timed out. Please try again."]
                    )
                }
                throw error
            }
        }
        throw NSError(
            domain: "DragonFruitNative",
            code: 999,
            userInfo: [NSLocalizedDescriptionKey: "\(endpoint) failed unexpectedly."]
        )
    }

    private func ensureStatus(_ response: URLResponse, data: Data? = nil, allowed: Set<Int>) throws {
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "DragonFruitNative", code: 900, userInfo: [NSLocalizedDescriptionKey: "Non-HTTP response"])
        }
        guard allowed.contains(http.statusCode) else {
            let message: String
            if let serverMessage = errorMessage(from: data) {
                message = serverMessage
            } else {
                switch http.statusCode {
                case 401:
                    message = "Session expired. Please sign in again."
                case 502, 503, 504:
                    message = "Calendar service is temporarily unavailable (\(http.statusCode)). Please try again."
                default:
                    message = "Request failed with status \(http.statusCode)"
                }
            }
            throw NSError(domain: "DragonFruitNative", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }

    private func ensureCalendarStatus(_ response: URLResponse, data: Data? = nil, allowed: Set<Int>) throws {
        guard let http = response as? HTTPURLResponse else {
            try ensureStatus(response, data: data, allowed: allowed)
            return
        }
        guard !allowed.contains(http.statusCode), [502, 503, 504].contains(http.statusCode) else {
            try ensureStatus(response, data: data, allowed: allowed)
            return
        }

        let message = errorMessage(from: data) ?? "Calendar sync paused. Atlas will retry shortly."
        throw CalendarServiceError(statusCode: http.statusCode, message: message)
    }

    private func errorMessage(from data: Data?) -> String? {
        guard let data,
              let object = try? JSONSerialization.jsonObject(with: data)
        else { return nil }

        if let json = object as? [String: Any] {
            for key in ["error", "detail", "message"] {
                if let value = json[key] as? String {
                    let message = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !message.isEmpty { return message }
                }
            }
        }
        return nil
    }

    private func formEncode(_ values: [String: String]) -> String {
        values
            .map { key, value in
                let escapedKey = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key
                let escapedValue = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
                return "\(escapedKey)=\(escapedValue)"
            }
            .joined(separator: "&")
    }

    private func makeMultipartBody(fields: [String: String], files: [MultipartFile], boundary: String) throws -> Data {
        var body = Data()
        let lineBreak = "\r\n"

        for (key, value) in fields {
            body.append("--\(boundary)\(lineBreak)")
            body.append("Content-Disposition: form-data; name=\"\(key)\"\(lineBreak)\(lineBreak)")
            body.append("\(value)\(lineBreak)")
        }

        for file in files {
            let filename = file.fileURL.lastPathComponent
            body.append("--\(boundary)\(lineBreak)")
            body.append("Content-Disposition: form-data; name=\"\(file.fieldName)\"; filename=\"\(filename)\"\(lineBreak)")
            body.append("Content-Type: \(file.mimeType)\(lineBreak)\(lineBreak)")
            body.append(try Data(contentsOf: file.fileURL))
            body.append(lineBreak)
        }

        body.append("--\(boundary)--\(lineBreak)")
        return body
    }

    private func decodeArrayOrResults<T: Decodable>(_ data: Data, as type: T.Type) throws -> [T] {
        if let direct = try? JSONDecoder().decode([T].self, from: data) {
            return direct
        }
        return try JSONDecoder().decode(PagedResponse<T>.self, from: data).results
    }
}
