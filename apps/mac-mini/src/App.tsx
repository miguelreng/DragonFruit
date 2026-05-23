import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

type MeetingState = "idle" | "upcoming" | "recording" | "summary";

type Meeting = {
  id: string;
  title: string;
  startsAt: Date;
  attendees: string[];
};

const demoMeetings: Meeting[] = [
  {
    id: "m-1",
    title: "Acme weekly product sync",
    startsAt: new Date(Date.now() + 1000 * 60 * 9),
    attendees: ["Sofia", "Miguel", "Jon"],
  },
  {
    id: "m-2",
    title: "Customer feedback review",
    startsAt: new Date(Date.now() + 1000 * 60 * 80),
    attendees: ["Design", "Sales"],
  },
];

type TranscriptResponse = {
  sections: Array<{ heading: string; body_markdown: string }>;
  action_items: Array<{ title: string; description: string }>;
};

function parseIcsDate(value: string): Date | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  return new Date(
    Date.UTC(
      Number.parseInt(match[1] ?? "0", 10),
      Number.parseInt(match[2] ?? "1", 10) - 1,
      Number.parseInt(match[3] ?? "1", 10),
      Number.parseInt(match[4] ?? "0", 10),
      Number.parseInt(match[5] ?? "0", 10),
      Number.parseInt(match[6] ?? "0", 10)
    )
  );
}

function parseIcsUpcomingMeetings(ics: string, nowMs: number): Meeting[] {
  const blocks = ics.split("BEGIN:VEVENT").slice(1);
  const events: Meeting[] = [];
  for (const block of blocks) {
    const title = (block.match(/SUMMARY:(.+)/)?.[1] ?? "Untitled meeting").trim();
    const startRaw = (block.match(/DTSTART(?:;[^:]+)?:([^\r\n]+)/)?.[1] ?? "").trim();
    const startAt = parseIcsDate(startRaw);
    if (!startAt || startAt.getTime() <= nowMs) continue;
    events.push({
      id: crypto.randomUUID(),
      title,
      startsAt: startAt,
      attendees: [],
    });
  }
  return events.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

export function App() {
  const [now, setNow] = useState(() => Date.now());
  const [meetingState, setMeetingState] = useState<MeetingState>("upcoming");
  const [followCursor, setFollowCursor] = useState(true);
  const [cursor, setCursor] = useState({ x: 140, y: 140 });
  const [summary, setSummary] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<TranscriptResponse | null>(null);
  const [calendarFeedUrl, setCalendarFeedUrl] = useState<string>("");
  const [calendarSource, setCalendarSource] = useState<"demo" | "google-ics">("demo");
  const [meetings, setMeetings] = useState<Meeting[]>(demoMeetings);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("http://localhost:8000");
  const [workspaceSlug, setWorkspaceSlug] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const [autoStartMinutesBefore, setAutoStartMinutesBefore] = useState(2);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const autoStartedMeetingIdRef = useRef<string | null>(null);

  const upcomingMeeting = useMemo(() => {
    return meetings
      .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .find((meeting) => meeting.startsAt.getTime() > now);
  }, [meetings, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!followCursor) return;
    const onMove = (event: MouseEvent) => {
      setCursor({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [followCursor]);

  const countdown = upcomingMeeting
    ? formatCountdown(upcomingMeeting.startsAt.getTime() - now)
    : "No upcoming meetings";

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecordingSeconds(0);
      setIsRecording(true);
      setMeetingState("recording");
    } catch {
      setError("Microphone permission denied or unavailable.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setSummary("Recording stopped. Add/edit transcript below, then generate a spec.");
    setMeetingState("summary");
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const register = async () => {
      unlisten = await listen("mini://start-recording", async () => {
        await startRecording();
      });
    };
    void register();
    return () => {
      if (unlisten) unlisten();
    };
  }, [startRecording]);

  useEffect(() => {
    if (!autoStartEnabled || isRecording || !upcomingMeeting) return;
    const triggerMs = upcomingMeeting.startsAt.getTime() - autoStartMinutesBefore * 60_000;
    const shouldAutoStart = now >= triggerMs && now < upcomingMeeting.startsAt.getTime() + 30_000;
    const alreadyStartedForMeeting = autoStartedMeetingIdRef.current === upcomingMeeting.id;

    if (shouldAutoStart && !alreadyStartedForMeeting) {
      autoStartedMeetingIdRef.current = upcomingMeeting.id;
      void startRecording();
    }
  }, [autoStartEnabled, autoStartMinutesBefore, isRecording, now, startRecording, upcomingMeeting]);

  const handleLoadGoogleCalendar = async () => {
    if (!calendarFeedUrl.trim()) {
      setError("Paste a Google Calendar ICS feed URL first.");
      return;
    }
    setError("");
    try {
      const response = await fetch(calendarFeedUrl.trim());
      if (!response.ok) {
        setError("Could not fetch that ICS feed.");
        return;
      }
      const text = await response.text();
      const parsedMeetings = parseIcsUpcomingMeetings(text, Date.now());
      setMeetings(parsedMeetings);
      setCalendarSource("google-ics");
    } catch {
      setError("Failed to load calendar feed.");
    }
  };

  const handleGenerateSpec = async () => {
    if (!workspaceSlug || !projectId) {
      setError("Add workspace slug and project ID.");
      return;
    }
    if (transcript.trim().length < 20) {
      setError("Paste at least a couple of transcript sentences.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/api/workspaces/${workspaceSlug}/projects/${projectId}/transcript-to-doc/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            transcript: transcript.trim(),
            hint: hint.trim() || undefined,
          }),
        }
      );
      if (!response.ok) {
        setError(`Spec generation failed (${response.status}).`);
        return;
      }
      const data = (await response.json()) as TranscriptResponse;
      setResult(data);
      setMeetingState("summary");
    } catch {
      setError("Could not reach DragonFruit API.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mini-root" data-theme="dark">
      <div className="glass-card">
        <p className="eyebrow">DragonFruit Mini</p>
        <h1>Meeting Copilot</h1>
        <p className="sub">Fast capture for your next meeting.</p>

        <section className="widget">
          <div>
            <p className="widget-title">Upcoming meeting</p>
            <p className="meeting-title">{upcomingMeeting?.title ?? "Nothing scheduled"}</p>
            <p className="meeting-meta">{countdown}</p>
            <p className="meeting-meta">{calendarSource === "demo" ? "Demo data" : "Google Calendar"}</p>
          </div>
        </section>

        <section className="widget">
          <div>
            <p className="widget-title">Recorder state</p>
            <p className="meeting-meta">
              {meetingState.toUpperCase()}
              {isRecording ? ` · ${recordingSeconds}s` : ""}
            </p>
          </div>
          <div className="button-row">
            {meetingState !== "recording" ? (
              <button type="button" className="primary" onClick={startRecording}>
                Start
              </button>
            ) : (
              <button type="button" className="danger" onClick={stopRecording}>
                Stop
              </button>
            )}
          </div>
        </section>

        <section className="widget column compact">
          <p className="widget-title">Auto-start</p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoStartEnabled}
              onChange={(event) => setAutoStartEnabled(event.target.checked)}
            />
            Start before meeting
          </label>
          <input
            type="number"
            min={0}
            max={30}
            value={autoStartMinutesBefore}
            onChange={(event) => setAutoStartMinutesBefore(Number(event.target.value || 0))}
          />
          <p className="meeting-meta">{autoStartMinutesBefore} min before meeting</p>
        </section>

        {meetingState === "summary" && (
          <section className="widget summary column">
            <p className="widget-title">Summary</p>
            <pre>{summary}</pre>
            {result && (
              <div className="result">
                <p className="meeting-meta">
                  {result.sections.length} sections · {result.action_items.length} action items
                </p>
              </div>
            )}
          </section>
        )}

        <details className="widget column advanced">
          <summary>Advanced</summary>
          <p className="widget-title">Calendar import (ICS)</p>
          <input
            value={calendarFeedUrl}
            onChange={(event) => setCalendarFeedUrl(event.target.value)}
            placeholder="Google Calendar ICS URL"
          />
          <button type="button" className="secondary" onClick={() => void handleLoadGoogleCalendar()}>
            Import meetings
          </button>

          <p className="widget-title">DragonFruit handoff</p>
          <input
            value={apiBaseUrl}
            onChange={(event) => setApiBaseUrl(event.target.value)}
            placeholder="API base URL"
          />
          <input
            value={workspaceSlug}
            onChange={(event) => setWorkspaceSlug(event.target.value)}
            placeholder="Workspace slug"
          />
          <input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="Project ID" />
          <input value={hint} onChange={(event) => setHint(event.target.value)} placeholder="Optional context" />
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Transcript..."
            rows={5}
          />
          <button type="button" className="primary" onClick={() => void handleGenerateSpec()} disabled={isSubmitting}>
            {isSubmitting ? "Generating..." : "Generate spec"}
          </button>
          <label className="toggle">
            <input type="checkbox" checked={followCursor} onChange={(e) => setFollowCursor(e.target.checked)} />
            Cursor companion
          </label>
          {error && <p className="error">{error}</p>}
        </details>
      </div>

      <div
        className="cursor-buddy"
        style={{
          transform: `translate(${cursor.x + 16}px, ${cursor.y + 18}px)`,
          opacity: followCursor ? 1 : 0,
        }}
      >
        <span>●</span>
        <small>{meetingState === "recording" ? "Recording" : "Ready"}</small>
      </div>
    </div>
  );
}
