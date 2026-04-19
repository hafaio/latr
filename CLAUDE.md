# latr

Monorepo with a Kotlin Android app (`android/`), shared Firestore rules (`firebase/`), and a Next.js web client (`web/`). User-facing docs live in [README.md](./README.md); this file is for contributors and AI sessions working on the code.

## Features & Expected Behavior

Track features and behavior here. When making changes, verify existing behavior isn't broken. Add unit tests when possible.

### Todo Display
- Snoozed todos show time as "<date> at <time>" using DateUtils (render date and time independently, concatenate with " at ")
- In snooze menu, if snooze time is within 24 hours, only show the time
- Snooze time formatting uses abs() on time delta so past snooze times >24h ago also show date+time format

### Focus Behavior
- No todo should be focused when opening the app
- No todo should be focused when changing filters
- No todo should be focused after a state-changing swipe (complete, reactivate, snooze, delete)
- No todo should be focused when the app is backgrounded
- No todo should be focused after pressing back
- No todo should be focused after the keyboard is dismissed (e.g. swipe down)
- When a todo gains focus, scroll to it first
- No extra space should appear below the search bar when focusing a todo

### Clear All Done
- "Clear all done" button appears above the bottom bar when on the Done filter with non-empty list
- Button has surfaceContainerHigh background
- Button is hidden on other filters and when the done list is empty (unless undo is pending)
- Tapping the button clears focus, deletes all done todos, and shows an inline "Undo" button in place
- Undo button auto-expires after 5 seconds
- Undo is cancelled when changing filters or creating a new todo
- Tapping "Undo" re-inserts all cleared todos

### Sort Order
- Active: unsnoozed items by snoozeUntil (most recently unsnoozed first), regular items by modifiedAt descending
- Snoozed: by snooze time ascending
- Done, All: by modifiedAt descending

### Fast Todo Compose Loop
- When in fast compose mode with an empty todo, pressing Done should clear focus and delete the empty todo
- IME action should be "Done" when the todo text is empty (not "Next")
- IME action should be "Next" when the todo text is not empty (creates new todo)

## Firestore schema

`users/{uid}/todos/{todoId}` — each doc: `{ text, state: "ACTIVE"|"DONE"|"SNOOZED", createdAt, modifiedAt, snoozeUntil, pinned }`. Rules in `firebase/firestore.rules` restrict reads and writes to the owning `uid`.

## Android build (extra)

`cd android && export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" && ./gradlew assembleDebug`. Open `android/` (not the repo root) in Android Studio.

## Web build (extra)

`cd web && bun lint` runs `tsc && biome check`. `bun export` runs `next build` and emits the static site to `web/out/`. The Firebase web config is inlined in `web/utils/firebase.ts` — values are public (they ship in the client bundle anyway); security is enforced by Firestore rules.

## Deployment

GitHub Pages via `.github/workflows/web.yml`. Triggers: manual (`workflow_dispatch`) or a GitHub Release being published. The workflow runs `bun export` with `NEXT_PUBLIC_BASE_PATH=/${{ github.event.repository.name }}` and uploads `web/out` as a Pages artifact.

For sign-in to work on the deployed URL, the domain must be on Firebase's Authorized Domains list (Authentication → Settings).

## Design decisions

- **No Zustand on web.** A `useReducer` + context provider is ~60 lines and handles everything the todo store needs. Pattern: `utils/store.tsx`.
- **Tailwind v4 semantic tokens.** Colors live as `--color-*` CSS variables inside `@theme` (light) with `.dark` overrides. Components use utility classes like `bg-surface`, `text-muted` — no `bg-[#hex]` anywhere.
- **Content-diff for remote sync, not `modifiedAt>`.** Android writes `System.currentTimeMillis()` and web writes `Date.now()`; cross-device clock skew silently drops legitimate edits under a strict `>` rule. The current rule accepts any remote update whose content differs, with echo suppression (`remoteAppliedRef` in `utils/store.tsx`) to avoid re-pushing our own writes coming back.
- **`uploadAll` before `startListening`.** The snapshot listener no longer auto-attaches in the auth callback. `AuthMenu` awaits `uploadAll(localTodos)`, then explicitly calls `startListening()`. This keeps a stale initial snapshot from clobbering unsaved local edits.
- **Favicon viewBox cropped to `49 27 22 32`.** The clock-hands L reads at 16×16; the full 108×108 Android composition is illegible at that size.
- **Left icon = primary state flip; right cluster = secondary actions.** Click the left icon on any row to toggle its main state (active↔done, snoozed→active). Right actions fade in on hover and vary by state.
- **No `.env.local`.** Firebase web-config values ship in the client bundle by design; there is no secret. Inlined in `web/utils/firebase.ts` so a fresh clone builds without env setup.

## Known limitations

- Simultaneous edits on web and Android to the same todo resolve by "last write to Firestore wins on next snapshot." This is not true collaborative editing.
- Touch-device hover actions use `@media (hover: none)` to show a trailing menu instead — not fully tested on real iOS/Android browsers.
- The snooze popover's "Pick a date & time…" uses the native `<input type="datetime-local">`, whose UI varies by browser.
- On first load the web store hydrates from `localStorage` in a mount effect, so there's a brief frame where the todo list is empty before cache loads.
