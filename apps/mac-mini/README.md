# DragonFruit Mini (macOS)

A Tauri + React mini app prototype for:

- cursor-following companion bubble
- upcoming meeting reminder widget
- meeting lifecycle (`upcoming` -> `recording` -> `summary`)
- post-meeting handoff stub (`Save to DragonFruit`)

## Run

From repo root:

```bash
pnpm --filter mac-mini dev
```

Run in Tauri window:

```bash
pnpm --filter mac-mini tauri:dev
```

## Next Integration Steps

1. Add CalendarKit/Google Calendar ingestion for real upcoming meetings.
2. Replace recorder stub with macOS audio capture + transcription service.
3. Connect summary output to DragonFruit transcript-to-spec endpoint.
4. Add menu bar tray + compact popover window behavior.
