# Research: the Gallery app's built-in notification and calendar skills

What Kin v0.2 can build on, read from the source of
[google-ai-edge/gallery](https://github.com/google-ai-edge/gallery) at commit `4928788` (main,
2026-10-13). Everything below about behaviour comes from the Android source; the iOS app's source
is not public.

## Where they are

The repository's `skills/built-in/` folder has only JavaScript and text skills (calculate-hash,
interactive-map, kitchen-adventure, mood-tracker, qr-code, query-wikipedia, send-email,
text-spinner). The notification and calendar skills are **not there**. They are bundled with the
Android app, in `Android/src/app/src/main/assets/skills/`:

| Skill | Tool | Intent |
| --- | --- | --- |
| `schedule-notification` | `run_intent` | `schedule_notification` |
| `create-calendar-event` | `run_intent` | `create_calendar_event` |
| `read-calendar-events` | `run_intent` | `read_calendar_events` |
| (used by all three) | `run_intent` | `get_current_date_and_time` |
| `learn-something-new` | `run_js`, then `run_intent` | `schedule_notification` (daily) |

These skills are only instructions. The work is done by `IntentHandler.kt` through the
`run_intent(intent, parameters)` tool, where `parameters` is a JSON string. On Android,
`run_intent` is offered to the model in every agent chat, whether or not those skills are switched
on (`AgentTools.getAvailableTools()` returns `loadSkill, runMcp, runJs, runIntent`). Its result is
`{action, parameters, result}` with `result` = `"succeeded"` or `"failed…"`. An unknown intent
returns an error.

## `schedule_notification`

Parameters (`ScheduleNotificationParams`):

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string, required | Notification title. |
| `message` | string, required | Notification text **and** the prompt opened by a tap (see below). |
| `hour`, `minute` | int, required | Local time. |
| `year`, `month`, `day` | int, optional | All three for a specific date. |
| `repeat_daily` | bool, optional | Repeats every day at `hour:minute`. |
| `deeplink` | string, optional | Overrides what a tap opens. |
| `task_id`, `model_name` | string, optional | Build a deep link to a specific task and model. |

Behaviour (`NotificationScheduleManager.kt`, `NotificationReceiver.kt`):

- **One-shot or daily only.** With a date, it fires once on that date. Without a date, it fires
  today at that time, or tomorrow if the time has passed. `repeat_daily` uses
  `AlarmManager.setRepeating(INTERVAL_DAY)`. There is **no weekly, monthly or yearly repeat**.
- **A date in the past fires at once.** The past-time check only moves undated or daily
  notifications to tomorrow. A dated one-shot in the past is not rejected.
- One-shots use `setAndAllowWhileIdle`, which Android may delay by a few minutes in Doze.
- Scheduled notifications are saved in the app (`scheduled_notifications.pb`), rescheduled after
  a reboot (`BootReceiver`), and listed on a Notifications screen in the app. A one-shot removes
  itself after firing.
- Each call creates a new notification with a random id: **scheduling the same thing twice gives
  two notifications.** Skills cannot list or cancel notifications.
- **Tap:** without `deeplink` or `task_id`, the tap opens
  `com.google.ai.edge.gallery://llm_agent_chat/?query=<message>`. That is the Agent Skills chat
  with the default model, and `message` as the prompt. The prompt is **never sent
  automatically**: `AgentChatScreen.kt` holds it in an `ExternalPromptConfirmationDialog` until
  the user confirms, because deep links are untrusted input. So a notification **can carry a
  prompt that starts a session**, with one confirmation tap.
- The notification text is the same `message`, so it must read well both as a notification and
  as a request to the model.

## `create_calendar_event`

Parameters: `title`, `description`, `begin_time`, `end_time`, as `yyyy-MM-ddTHH:mm:ss` in local
time.

Behaviour: it does not write to the calendar. It fires `Intent.ACTION_INSERT` on
`CalendarContract.Events`, which **opens the calendar app's "new event" screen, pre-filled**. The
user must save it. `"succeeded"` means the screen opened, not that the event was saved.

- **No all-day events** (`EXTRA_EVENT_ALL_DAY` is not set), **no recurrence** (no `RRULE`), no
  alarms, no choice of calendar.
- One event per call, so one screen per event.

## `read_calendar_events`

Parameter: `date` (`YYYY-MM-DD`). It returns the events of that one day as
`{events: [{title, description, begin_time, end_time}]}`, after asking for `READ_CALENDAR`
permission. It reads one day per call.

## `get_current_date_and_time`

Returns the device's local time as `yyyy-MM-ddTHH:mm:ss EEEE`. The built-in skills tell the model
to call it and then work out dates itself. Kin does not need it: it takes today from the JS
runtime and computes every date in code (spec §15.1).

## Android only?

Everything above is Android code: Kotlin, `AlarmManager`, Android intents, a bundled assets
folder. Pointers on iOS:

- The skills README says native intents use "the Android/iOS operating system's built-in
  capabilities", but its examples and `IntentHandler.kt` are Android, and it says adding an intent
  "requires updating the app's source code".
- Release notes for the Android app (1.0.14, 1.0.15) list reminders and reading or creating
  calendar events ([APKMirror](https://www.apkmirror.com/apk/research-at-google/google-ai-edge-gallery/google-ai-edge-gallery-1-0-15-release/)).
  Google's announcement of notifications and MCP says MCP is experimental on Android, with iOS
  "coming soon" ([Google Developers Blog](https://developers.googleblog.com/a-smarter-google-ai-edge-gallery-mcp-integration-notifications-and-session-continuity/)).
  Reviews describe a one-shot or daily notification whose tap opens an AI session
  ([igor'sLAB](https://www.igorslab.de/en/google-ai-edge-gallery-local-ai-agents-tools-memory/),
  [Korben](https://korben.info/en/edge-gallery-google-ai-local-smartphone.html)).
- Nothing public confirms that the iPhone app ships `schedule-notification` or
  `create-calendar-event`, or a `run_intent` tool with these intents.

**Until it is checked on an iPhone, treat both as Android only.** The check: open the Skills chip
in Agent Skills and see whether `schedule-notification` and `create-calendar-event` are listed.

## Consequences for Kin v0.2

1. **Kin computes every date and time and hands over finished parameters.** For a notification,
   Kin returns the exact `schedule_notification` JSON, so the model only copies it into
   `run_intent`. Kin never returns a time in the past, because the app would fire it at once.
2. **The weekly digest is not possible natively** (daily only). Closest alternative: a one-shot
   notification for the next chosen weekday whose prompt asks for the digest. When the digest runs
   from that prompt, its result includes the next week's notification, so the chain renews itself.
   A daily digest uses `repeat_daily`.
3. **Duplicates must be avoided on Kin's side.** The app cannot list or cancel notifications, so
   Kin remembers what it handed over (on the device, since notifications belong to one phone) and
   asks before handing over the same reminder again.
4. **Calendar export uses an `.ics` file instead of `create_calendar_event`.** The built-in can't
   make all-day or yearly events and opens one screen per event. An `.ics` file can hold every
   date as an all-day, yearly event with alarms at the chosen lead times. It goes through the share
   sheet from a panel, like the backup, which already works on iPhone. On iPhone the alarms also
   give native reminders even without `schedule-notification`. Kin records in Lore what it
   exported, so a second export only adds what is new or changed. Stable `UID`s let calendar apps
   that de-duplicate do so.
5. **Chaining is a fallback, not a dependency.** When `run_intent` exists, the model calls Kin and
   then `run_intent` in the same turn, as `learn-something-new` does. When it doesn't (iPhone), or
   when the small model stops after Kin, Kin's result ends with a sentence the user can say next.
   That sentence is self-contained, so the built-in skill can act on it in a second turn or a new
   chat.
6. **Sensitive data stays out.** Notifications and calendar events are output that is stored and
   shown outside Kin (spec §6.4 rule 4), so they never contain sensitive dates or notes.

Also noted for the roadmap: the Android app has a `run_mcp` tool and an `mcp/` folder, which fits
v1's local MCP server.
