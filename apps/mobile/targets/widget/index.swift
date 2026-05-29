import WidgetKit
import SwiftUI

// MARK: - Shared config (must match app.json + lib/calendar-widget.ts)

private let appGroup = "group.sh.dragonfruit.mobile"
private let eventsKey = "calendar_events"
private let accentColor = Color(red: 0.894, green: 0.271, blue: 0.651) // #E445A6

// MARK: - Stored snapshot (written by the app)

private struct StoredEvent: Decodable {
  let id: String
  let title: String
  let start: String
  let end: String?
  let allDay: Bool?
  let location: String?
}

private struct StoredPayload: Decodable {
  let updatedAt: String?
  let events: [StoredEvent]
}

struct CalendarEvent: Identifiable {
  let id: String
  let title: String
  let date: Date?
  let allDay: Bool
  let location: String?
}

private func parseDate(_ value: String) -> Date? {
  let withFraction = ISO8601DateFormatter()
  withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = withFraction.date(from: value) { return date }

  let plain = ISO8601DateFormatter()
  plain.formatOptions = [.withInternetDateTime]
  if let date = plain.date(from: value) { return date }

  // All-day events arrive as "yyyy-MM-dd".
  let dateOnly = DateFormatter()
  dateOnly.dateFormat = "yyyy-MM-dd"
  dateOnly.timeZone = TimeZone.current
  return dateOnly.date(from: value)
}

private func loadEvents() -> [CalendarEvent] {
  guard
    let defaults = UserDefaults(suiteName: appGroup),
    let raw = defaults.string(forKey: eventsKey),
    let data = raw.data(using: .utf8),
    let payload = try? JSONDecoder().decode(StoredPayload.self, from: data)
  else { return [] }

  // Drop events that already finished a while ago.
  let cutoff = Date().addingTimeInterval(-3600)
  return payload.events
    .map {
      CalendarEvent(
        id: $0.id,
        title: $0.title,
        date: parseDate($0.start),
        allDay: $0.allDay ?? false,
        location: $0.location
      )
    }
    .filter { ($0.date ?? .distantFuture) >= cutoff }
    .sorted { ($0.date ?? .distantFuture) < ($1.date ?? .distantFuture) }
}

// MARK: - Timeline

struct CalendarEntry: TimelineEntry {
  let date: Date
  let events: [CalendarEvent]
}

private let sampleEvents: [CalendarEvent] = [
  CalendarEvent(id: "1", title: "Design review", date: Date().addingTimeInterval(3600), allDay: false, location: "Zoom"),
  CalendarEvent(id: "2", title: "1:1 with Sam", date: Date().addingTimeInterval(9000), allDay: false, location: nil),
  CalendarEvent(id: "3", title: "Sprint planning", date: Date().addingTimeInterval(18000), allDay: false, location: nil),
]

struct CalendarProvider: TimelineProvider {
  func placeholder(in context: Context) -> CalendarEntry {
    CalendarEntry(date: Date(), events: sampleEvents)
  }

  func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) {
    completion(CalendarEntry(date: Date(), events: context.isPreview ? sampleEvents : loadEvents()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
    let entry = CalendarEntry(date: Date(), events: loadEvents())
    // Nudge a re-render so finished events drop off; the app also force-reloads
    // the timeline whenever it writes a fresh snapshot.
    let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(refresh)))
  }
}

// MARK: - Views

private func timeLabel(_ event: CalendarEvent) -> String {
  guard let date = event.date else { return "" }
  if event.allDay { return "All day" }
  let formatter = DateFormatter()
  formatter.locale = Locale.current
  formatter.dateFormat = Calendar.current.isDateInToday(date) ? "h:mm a" : "EEE h:mm a"
  return formatter.string(from: date)
}

struct EventRow: View {
  let event: CalendarEvent
  let compact: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      RoundedRectangle(cornerRadius: 2).fill(accentColor).frame(width: 3)
      VStack(alignment: .leading, spacing: 1) {
        Text(event.title)
          .font(compact ? .footnote : .subheadline)
          .fontWeight(.medium)
          .lineLimit(compact ? 2 : 1)
        Text(timeLabel(event))
          .font(.caption2)
          .foregroundColor(.secondary)
      }
      Spacer(minLength: 0)
    }
  }
}

struct CalendarWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: CalendarEntry

  private var maxCount: Int {
    switch family {
    case .systemSmall: return 2
    case .systemMedium: return 3
    default: return 6
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Image(systemName: "calendar").font(.caption2).foregroundColor(accentColor)
        Text("Upcoming").font(.caption2).fontWeight(.semibold).foregroundColor(.secondary)
      }
      if entry.events.isEmpty {
        Spacer()
        Text("No upcoming events").font(.footnote).foregroundColor(.secondary)
        Spacer()
      } else {
        ForEach(entry.events.prefix(maxCount)) { event in
          EventRow(event: event, compact: family == .systemSmall)
        }
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .containerBackground(for: .widget) { Color(.systemBackground) }
  }
}

// MARK: - Widget

struct CalendarWidget: Widget {
  let kind = "CalendarWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CalendarProvider()) { entry in
      CalendarWidgetView(entry: entry)
    }
    .configurationDisplayName("Calendar")
    .description("Your upcoming meetings from DragonFruit.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

@main
struct ExportedWidgets: WidgetBundle {
  var body: some Widget {
    CalendarWidget()
  }
}
