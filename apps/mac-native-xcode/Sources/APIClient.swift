import Foundation

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
    let status: String
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

struct OAuthStartResponse: Codable {
    let authorize_url: String
}

struct CSRFResponse: Codable {
    let csrf_token: String
}

struct APIClient {
    var baseURL: URL
    var apiToken: String?

    private var session: URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpCookieAcceptPolicy = .always
        return URLSession(configuration: configuration)
    }

    private func authorizedRequest(url: URL, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        return request
    }

    func fetchCSRFToken() async throws -> String {
        let url = baseURL.appending(path: "auth/get-csrf-token/")
        let (data, response) = try await session.data(from: url)
        try ensureStatus(response, allowed: [200])
        return try JSONDecoder().decode(CSRFResponse.self, from: data).csrf_token
    }

    func signIn(email: String, password: String) async throws {
        let csrf = try await fetchCSRFToken()
        var request = URLRequest(url: baseURL.appending(path: "auth/sign-in/"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let body = [
            "email": email,
            "password": password,
            "next_path": "/",
            "csrfmiddlewaretoken": csrf,
        ]
        request.httpBody = formEncode(body).data(using: .utf8)

        let (_, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200, 302, 303])
        _ = try await getCurrentUser()
    }

    func getCurrentUser() async throws -> [String: Any] {
        let url = baseURL.appending(path: "api/users/me/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "DragonFruitNative", code: 1001, userInfo: [NSLocalizedDescriptionKey: "Invalid user payload"])
        }
        return json
    }

    func listCalendarAccounts() async throws -> [CalendarAccount] {
        let url = baseURL.appending(path: "api/users/me/calendar-accounts/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
        return try JSONDecoder().decode([CalendarAccount].self, from: data)
    }

    func startGoogleOAuth() async throws -> URL {
        var components = URLComponents(url: baseURL.appending(path: "api/users/me/calendar-accounts/google/start/"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "client", value: "native")]
        guard let url = components?.url else {
            throw NSError(domain: "DragonFruitNative", code: 1004, userInfo: [NSLocalizedDescriptionKey: "Invalid Google start URL"])
        }
        let request = authorizedRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
        let payload = try JSONDecoder().decode(OAuthStartResponse.self, from: data)
        guard let authURL = URL(string: payload.authorize_url) else {
            throw NSError(domain: "DragonFruitNative", code: 1003, userInfo: [NSLocalizedDescriptionKey: "Invalid authorize URL"])
        }
        return authURL
    }

    func finishGoogleOAuth(code: String) async throws {
        let csrf = try await fetchCSRFToken()
        var request = URLRequest(url: baseURL.appending(path: "api/users/me/calendar-accounts/google/callback/"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(csrf, forHTTPHeaderField: "X-CSRFToken")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONEncoder().encode(["code": code, "client": "native"])

        let (_, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
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
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])

        struct EventsResponse: Codable {
            let events: [CalendarEvent]
        }

        return try JSONDecoder().decode(EventsResponse.self, from: data).events
    }

    func listWorkspaces() async throws -> [WorkspaceSummary] {
        let url = baseURL.appending(path: "api/workspaces/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: WorkspaceSummary.self)
    }

    func listProjects(workspaceSlug: String) async throws -> [ProjectSummary] {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: ProjectSummary.self)
    }

    func createTask(workspaceSlug: String, projectId: String, title: String, descriptionHtml: String) async throws -> CreatedEntity {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/issues/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": title,
            "description_html": descriptionHtml,
            "priority": "none",
        ])
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedEntity.self, from: data)
    }

    func createDoc(workspaceSlug: String, projectId: String, title: String, descriptionHtml: String) async throws -> CreatedEntity {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/projects/\(projectId)/pages/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": title,
            "page_type": "doc",
            "description_html": descriptionHtml,
        ])
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedEntity.self, from: data)
    }

    func createSticky(workspaceSlug: String, title: String, descriptionHtml: String) async throws -> CreatedEntity {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/stickies/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": title,
            "description_html": descriptionHtml,
        ])
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(CreatedEntity.self, from: data)
    }

    func listAgents(workspaceSlug: String) async throws -> [AgentSummary] {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/agents/")
        let request = authorizedRequest(url: url)
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200])
        return try decodeArrayOrResults(data, as: AgentSummary.self)
    }

    func createAgentChatSession(workspaceSlug: String, agentId: String, title: String) async throws -> AgentChatSession {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/agent-chats/sessions/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "agent_id": agentId,
            "title": title,
        ])
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(AgentChatSession.self, from: data)
    }

    func sendAgentChatMessage(workspaceSlug: String, sessionId: String, content: String) async throws -> AgentChatMessageEnvelope {
        let url = baseURL.appending(path: "api/workspaces/\(workspaceSlug)/agent-chats/sessions/\(sessionId)/messages/")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Api-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "content": content,
        ])
        let (data, response) = try await session.data(for: request)
        try ensureStatus(response, allowed: [200, 201])
        return try JSONDecoder().decode(AgentChatMessageEnvelope.self, from: data)
    }

    private func ensureStatus(_ response: URLResponse, allowed: Set<Int>) throws {
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "DragonFruitNative", code: 900, userInfo: [NSLocalizedDescriptionKey: "Non-HTTP response"])
        }
        guard allowed.contains(http.statusCode) else {
            throw NSError(domain: "DragonFruitNative", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "Request failed with status \(http.statusCode)"])
        }
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

    private func decodeArrayOrResults<T: Decodable>(_ data: Data, as type: T.Type) throws -> [T] {
        if let direct = try? JSONDecoder().decode([T].self, from: data) {
            return direct
        }
        struct Paged<T: Decodable>: Decodable {
            let results: [T]
        }
        return try JSONDecoder().decode(Paged<T>.self, from: data).results
    }
}
