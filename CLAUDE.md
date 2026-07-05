# latr

Monorepo with a Kotlin Android app (`android/`), shared Firestore rules (`firebase/`), and a Next.js web client (`web/`). User-facing docs live in [README.md](./README.md); this file is for contributors and AI sessions working on the code.

## Features & Expected Behavior

Track features and behavior here. When making changes, verify existing behavior isn't broken. Add unit tests when possible.

### Todo Display
- Snoozed todos show time as "<date> at <time>" using DateUtils (render date and time independently, concatenate with " at ")
- In snooze menu, if snooze time is within 24 hours, only show the time
- Snooze time formatting uses abs() on time delta so past snooze times >24h ago also show date+time format

### Snooze Options
- Quick options come from `getSnoozeOptions` (web: `utils/snooze.ts`, Android: `SnoozeTimeCalculator`), context-dependent on time-of-day/weekday
- "Last" appears only after a custom date+time has been picked this session, re-offering that exact time; it sits just above "Custom"
- The last custom pick is session-only (resets on reload) — web stores it in the UI reducer (`lastCustomSnooze`), Android in a ViewModel `StateFlow`. Picking a preset or "Last" itself does not overwrite it; only the custom picker does

### Focus Behavior
- No todo should be focused when opening the app
- No todo should be focused when changing filters
- No todo should be focused after a state-changing swipe (complete, reactivate, snooze, delete)
- No todo should be focused when the app is backgrounded
- No todo should be focused after pressing back
- No todo should be focused after the keyboard is dismissed (e.g. swipe down)
- When a todo gains focus, scroll to it first
- No extra space should appear below the search bar when focusing a todo

### Undo
- The undo buffer holds one most-recent action — a delete, a snooze, or a complete. A later action of any kind overwrites the prior buffer (single slot, most-recent-wins)
- The buffer is a tagged entry: web `lastUndo: { kind: "delete" | "snooze" | "complete"; todos }` in the UI reducer; Android a private `UndoableAction` sealed type (`Delete` | `Snooze` | `Complete`) on the ViewModel
- Undo chip auto-expires after 5 seconds; cancelled when changing filters or creating a new todo

#### Delete
- "Clear all done" button appears above the bottom bar when on the Done filter with non-empty list (surfaceContainerHigh background)
- Button is hidden on other filters and when the done list is empty (unless undo is pending)
- Tapping it clears focus, deletes all done todos, and shows an inline "Undo" chip in place
- A single swipe-delete (DONE row swiped end-to-start) also shows the "Undo" chip at the bottom, on any filter
- The empty-draft blur-cleanup (new todo abandoned without typing) does NOT show the chip — the user never had content to lose
- Tapping "Undo" re-inserts the deleted todo(s) with their original modifiedAt so they land back in their previous sort position (true undo)

#### Snooze
- Committing a snooze (preset, "Last", or custom pick) shows the "Undo" chip; tapping it reverts the todo to its pre-snooze snapshot (prior state/snoozeUntil/modifiedAt), so it lands back in its previous sort position
- Snooze undo restores via the normal update path (the row still exists, unlike a delete which re-inserts); `serverModifiedAt` bumps on the write so it passes the server-time rule
- Web: `lastUndo` drives the same chip as delete (label "Snoozed"), and ⌘/Ctrl+Z reverts it. Android: snooze undo shares the delete machinery — `snoozeUndoable` on the ViewModel buffers the pre-snooze snapshot as `UndoableAction.Snooze`, arms the shared `undoVisible` chip, and applies the snooze; tapping Undo re-applies that snapshot through the normal update path
- Snooze undo only surfaces on the filter where the snooze happened (Active/Snoozed); a filter change clears it, so it never competes with "Clear all done" on the Done filter

#### Complete
- Marking a todo done shows the "Undo" chip; tapping it restores the pre-done snapshot (prior state/snoozeUntil/modifiedAt), so it lands back in its previous sort position — mechanically identical to snooze undo (the row still exists, restored via the update path)
- Web: `markDone` buffers `{ kind: "complete" }` (chip label "Completed"); ⌘/Ctrl+Z reverts it. The complete trigger is the left state-icon click. Android: swipe-to-complete (end-to-start on an Active/Snoozed row) routes through `completeUndoable` on the ViewModel, which buffers `UndoableAction.Complete` and raises the shared `undoVisible` chip
- Like snooze undo, it only surfaces on the filter where the complete happened; a filter change clears it

### Sync Indicator (web)
- The top-bar arrow only appears while syncing (Firestore snapshot is `fromCache` — not yet confirmed with the server); a confirmed-synced state shows nothing
- **Delay-show debounce**: `fromCache` blips on/off around writes and metadata changes (`includeMetadataChanges: true`), which flickered the icon. `TopBar` only surfaces the indicator after `syncing` has been continuously true for `SYNC_INDICATOR_DELAY_MS` (500ms) and hides it immediately when it settles, so transient blips never flash the spinner; only a genuinely slow/offline sync shows it
- While syncing and online: spinning muted arrow ("Syncing")
- While syncing and offline (`navigator.onLine === false`): static amber arrow ("Offline — changes saved on this device")
- Offline is subordinate to syncing — never shown when `!syncing`, since there's nothing pending to sync
- Online status comes from `useOnlineStatus` (`utils/use-online-status.ts`), a `useSyncExternalStore` hook reading `navigator.onLine` live so online/offline event ordering can't leave a stale value

### Sort Order
- Active: by `activeSortKey` (`utils/todo.ts`) — snoozeUntil (unsnoozed, most recently unsnoozed first) else modifiedAt — descending, with modifiedAt as the tiebreak. The **web** sort ignores `pinned` (pinning is a grouping concern, below); **Android** keeps pinned-first in its flat list.
- Snoozed: by snooze time ascending
- Done, All: by modifiedAt descending

### Grouping (web)
- The web list renders in buckets whose key is the *same* key the list is sorted by, so a row's bucket and its position can never disagree. (The old modifiedAt-only grouping fought the Active sort: a recently-unsnoozed row sorted at the top but fell into a late date bucket.) `groupForFilter` (`utils/group.ts`) buckets an already-sorted list, preserving order within each bucket.
- Active: a **Pinned** bucket on top (all pinned rows), then date buckets Today / Yesterday / This week / Earlier keyed on `activeSortKey` — so an unsnoozed row buckets by its unsnooze time. Pinned rows appear only in the Pinned bucket.
- Snoozed: Later today / Tomorrow / This week / Later keyed on snoozeUntil.
- Done, All: date buckets keyed on modifiedAt.
- Search: one unlabeled group (relevance-ranked, so date/pinned buckets would be meaningless).
- Android renders a flat list (no buckets); pinning floats via its sort there.

### Pinned
- `pinned: boolean` on every todo, synced (web `toFirestoreFields`/`fromFirestore`, Android `toMap`/`fromMap`, Room column already in schema v9). Defaults to false.
- Pinning only floats items to the top of the **Active** list; Snoozed (snooze-time order) and Done/All (modifiedAt order) ignore `pinned` so a time-ordered view isn't reshuffled. The pin affordance is shown on the Active filter only — web gates on the current `filter`, not `todo.state` (unsnoozed rows show in Active while still `state: "SNOOZED"`); Android gates via `onPin != null` (passed only for the Active page).
- It's a toggle: the web button and the Android trailing icon read the current `pinned` and flip it (label "Unpin" when already pinned).
- Toggling **bumps** `modifiedAt` (web `Date.now()`, Android `touchModifiedAt = true`) **and clears the was-snoozed marker** (`snoozeUntil = null`; web also forces `state: "ACTIVE"` so an expired-snooze row stays in the list) so the toggled row becomes a plain recent row and lands at the top of its group rather than snapping back to its old unsnooze-time position. Pin never arms or clears the undo buffer.
- No scroll-into-view on toggle (deliberately removed). The `modifiedAt` bump already lands the row near the top of its group — a pinned row at the very top, an unpinned row just below the pinned rows — so it stays visible in the common case (toggling while at the top of the list). Chasing the row with a programmatic scroll wasn't worth the complexity: the row's `animateItem` reorder is mid-flight for a few hundred ms after the toggle, so any visibility check reads stale offsets, which forced a fixed settle delay and still misfired. The list just re-sorts (with its row animation) and the viewport stays put.
- Web: a pinned row is identified by its **left/primary icon** — an outlined pin (`BsPinAngle`, accent) shown in place of the state dot when `todo.pinned` (done rows keep their check). Clicking it still marks done, exactly like the `wasUnsnoozed` outline-clock icon does — the pin is a state *indicator*, not the toggle. Pinning stays on the **hover pin button** (between snooze and delete in the action cluster, Active filter only, `showPin`, `FaThumbtack`), which now behaves like every other hover action (hidden at rest, fades in on hover via the shared `hoverAction` class; accent tint when pinned) since the left icon already marks pinned rows.
- Android: pin is a **long-press anywhere on the row** (`onTogglePin` on `TodoItem`, passed only for the Active page; a `detectTapGestures(onLongPress)` on both the row and the display text so it fires over the icon/padding *and* the text). There is **no trailing pin button** — the earlier always-visible button was too much visual noise. A pinned row is identified by its **left icon**: a primary-tinted outline `PushPin` replaces the state dot (done rows keep their check). Long-press gives haptic feedback and is a no-op off the Active list. Trade-off vs the old button: lower discoverability and weaker TalkBack affordance (the icon carries a "Pinned" contentDescription, but the toggle isn't a discrete a11y action). The swipe gestures are unchanged (`SwipeToDismissBox`: complete/delete + snooze/reactivate).

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
- **Firestore snapshot listener is the sole source of truth when signed in.** `FirestoreTodoStore` reads/writes straight through Firestore (with `persistentLocalCache`); its `onSnapshot` listener is the only thing that populates the UI, so there's no separate local store to reconcile and an echo of our own write coming back through the listener can't clobber in-flight typing. Cross-device write conflicts resolve via the server-time gate (below), **not** a `modifiedAt>` comparison — so clock skew between Android (`System.currentTimeMillis()`) and web (`Date.now()`) can't silently drop edits.
- **The snapshot listener self-heals with backoff.** A Firestore listener that delivers an *error* (not a transient drop, which the SDK reconnects silently) is dead for good. Both clients re-register with capped exponential backoff (1s→30s): Android propagates the error out of the `observeAll` `callbackFlow` (`close(err)`) and wraps it in `retryWhen`; web re-`attach`es on a `setTimeout` from the `onSnapshot` error callback. Recovery needs no user gesture. Web additionally exposes `reattach()` (fired on tab-wake / online) as an immediate-retry-that-resets-backoff; Android relies on `retryWhen` plus `WhileSubscribed`, which tears down and re-collects the flow (fresh listener) on resume.
- **Store swaps live in `TodoStoreHolder`; the auth listener only swaps.** `onAuthStateChanged` swaps the live `TodoStore` (local ↔ Firestore) and does nothing else. Merging and snapshotting happen only on the explicit user-initiated entry points `signIn` / `signOut` / `deleteAccount`. On sign-in, `mergeLocalIntoFirestore` (web) / `mergeRoomIntoFirestore` (Android) `getDocs` the full remote collection, pushes local rows that are newer (`modifiedAt >` remote) or absent remotely, and drops local rows matching a remote tombstone (so a delete made on another device isn't resurrected) — then the auth listener swaps.
- **Favicon viewBox cropped to `49 27 22 32`.** The clock-hands L reads at 16×16; the full 108×108 Android composition is illegible at that size.
- **Left icon = primary state flip; right cluster = secondary actions.** Click the left icon on any row to toggle its main state (active↔done, snoozed→active). Right actions fade in on hover and vary by state.
- **Android rows render display text at rest, swapping to an editor on tap.** Each `TodoItem` shows a plain `Text` until tapped, then swaps to a `BasicTextField` (`editing` gates the two). This keeps scroll cheap (a `BasicTextField` per visible row is a real composition cost) and frees the row for a long-press-to-pin gesture that an always-present editor would swallow as text selection. Seamlessness depends on the display `Text` and the field sharing one `TextStyle` with no padding on either, so the swap doesn't shift a pixel. Tap-to-edit and long-press-to-pin are a single `Modifier.combinedClickable` on the whole row (**not** a raw `detectTapGestures` — nested inside the `SwipeToDismissBox` drag + `LazyColumn` scroll, a raw tap detector dropped most taps). `combinedClickable` gives no tap position, so a passive `pointerInput` on the display `Text` peeks at each down (Initial pass, non-consuming, so it doesn't disturb the click) and records the caret offset via `getOffsetForPosition`; `onClick` opens the editor there, falling back to end for taps off the text. Focus is requested after a `withFrameNanos` delay so it isn't lost when stealing focus from another row's field. Web keeps its always-present field (no scroll list of the same weight, and its pin uses a hover button, not long-press).
- **No `.env.local`.** Firebase web-config values ship in the client bundle by design; there is no secret. Inlined in `web/utils/firebase.ts` so a fresh clone builds without env setup.
- **Deletes hard-delete; `deleted=true` docs are legacy read-only.** A delete removes the local row and calls `deleteDoc` (web) / `.delete()` (Android) on the Firestore doc; Firestore propagates REMOVED to every active listener. Older clients wrote tombstone docs (`deleted: true`) instead — those are still filtered out on read (`fromFirestore` / `Todo.fromMap` consumers skip `deleted`), and the sign-in merge drops local rows matching a remote tombstone, but new code never writes one. Undo holds the full `Todo[]` (web `lastUndo.todos`, Android `UndoableAction.Delete.todos`) and re-inserts on tap preserving the original `modifiedAt` so the restored row lands back in its prior sort position.
- **Server-time gated writes via Firestore rule.** Every doc carries `serverModifiedAt = serverTimestamp()` and the rule on `users/{uid}/todos/{id}` requires `request.resource.data.serverModifiedAt >= resource.data.serverModifiedAt`. Real edits stamp `serverTimestamp()` (= `request.time`) so they always pass. The auto-unsnooze re-sends its basis verbatim instead of bumping, so a stale client loses to any concurrent edit. `serverModifiedAt` is carried as the raw SDK `Timestamp` (web `firebase/firestore` Timestamp, Android `com.google.firebase.Timestamp`) — truncating to millis would defeat the `>=` check even with no conflict. The unsnooze uses `updateDoc` (not `setDoc` with merge) so a doc deleted on another device can't be resurrected by going through the laxer `create` rule, and writes a minimal `{state, modifiedAt, serverModifiedAt}` payload so no other fields can ride along on an equal-basis race. It explicitly swallows `PERMISSION_DENIED` and `NOT_FOUND` (concurrent edit / concurrent delete — the listener will deliver the truth); other errors propagate to the caller and are logged, with the natural retry coming on the next listener tick / refresh.

## Known limitations

- Simultaneous edits on web and Android to the same todo resolve by "last write to Firestore wins on next snapshot." This is not true collaborative editing.
- Touch-device hover actions use `@media (hover: none)` to show a trailing menu instead — not fully tested on real iOS/Android browsers.
- The snooze popover's "Pick a date & time…" uses the native `<input type="datetime-local">`, whose UI varies by browser.
- On first load the web store hydrates from `localStorage` in a mount effect, so there's a brief frame where the todo list is empty before cache loads.
- Tombstones accumulate in Firestore forever (no server-side GC). Local state doesn't carry them — the growth is remote-only.
- Deleting a previously-synced todo while signed out will not push a tombstone. On next sign-in the merge only pushes/drops local rows, so the still-live remote doc isn't removed; when the store swaps to Firestore its listener surfaces it again — the delete is lost. Sign in before deleting, or accept the re-appearance.
