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

### Snooze is derived
- **`state` is only `ACTIVE` or `DONE`.** Snoozed-ness is not stored — it is computed from the clock: a todo is snoozed iff it isn't done and `snoozeUntil` is still in the future (web `isSnoozed` in `utils/todo.ts`, Android `Todo.isSnoozed(nowMillis)` in `TodoFilter.kt`). Snoozing writes `snoozeUntil`; nothing writes a state to say "this is snoozed", and **nothing writes anything when a snooze lapses**.
- There is no auto-unsnooze, no `unsnooze()` on the store, no `getExpiredSnoozed`. A lapsed snooze moves its row from Snoozed to Active because `now` advanced, not because a client wrote to it. That makes it correct offline (it's a local computation needing nobody's permission) and impossible to get wrong across devices (there's no write to race).
- Both clients hold a **ticking `now`** that advances at the soonest pending snooze, since no data change will announce the lapse: web keeps it in the store provider (`now` in the context; a `setTimeout` to the next expiry) and every snooze-derived read takes it from there; Android keeps `nowMillis` in `TodoScreenContent` (a `LaunchedEffect` `delay`ing to the next expiry, plus a bump on `ON_RESUME` and on pull-to-refresh) and threads it into `filterAndSort` and each row's `snoozed` flag.
- **Why it was built this way** (do not "restore" the write): the old design flipped `state` to `ACTIVE` on expiry via an automatic Firestore write. Because the Firestore listener's first emission is cache-only, a client with a stale IndexedDB cache would fire that sweep against months-old data on load. The payload sent `serverModifiedAt: <basis> ?? serverTimestamp()`, and the `??` fallback (taken for legacy docs with no basis) resolves to `request.time`, which satisfies the rule's `>=` unconditionally — bypassing the very CAS meant to stop stale writes. It silently overwrote `state` on live docs: todos completed on another device came back as `ACTIVE`, and todos re-snoozed to a future time kept that future `snoozeUntil` while being forced to `ACTIVE` (the minimal payload didn't touch `snoozeUntil`) — which also sorted them above everything, since `activeSortKey` reads `snoozeUntil`. Deriving the state removes the write, and therefore the whole failure class.
- Corrupt rows from that era (`state: "ACTIVE"` with a future `snoozeUntil`) **heal themselves** under the derived rule: they simply read as snoozed until their time passes. No repair migration was needed. Rows whose `DONE` was overwritten are unrecoverable (the state was destroyed) and must be re-completed by hand.

### Sort Order
- Active: by `activeSortKey` (`utils/todo.ts`) — snoozeUntil (unsnoozed, most recently unsnoozed first) else modifiedAt — descending. Every filter's final tie-break is `id` (a stable uuid) so equal-time rows never flip-flop. The **web** sort ignores `pinned` (pinning is a grouping concern, below); **Android** keeps pinned-first in its flat list.
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
- Pinning only floats items to the top of the **Active** list; Snoozed (snooze-time order) and Done/All (modifiedAt order) ignore `pinned` so a time-ordered view isn't reshuffled. But a **snoozed** todo can still be pinned — it just doesn't float until it unsnoozes and enters Active. The affordance is therefore shown on every row *except* a done one (web `showPin = !isDone`; Android passes `onTogglePin = null` only when `state == DONE`).
- It's a toggle: the web hover button and the Android long-press read the current `pinned` and flip it (web label "Unpin" when already pinned).
- Toggling always **bumps** `modifiedAt` (web `Date.now()`, Android `touchModifiedAt = true`) — a pin is an edit. On an **active** row it additionally **clears the was-snoozed marker** (`snoozeUntil = null`) so the toggled row becomes a plain recent row and lands at the top of its group rather than snapping back to its old unsnooze-time position. A **snoozed** row keeps its snooze time, so the bump doesn't move it (Snoozed orders by `snoozeUntil`); on Done/All, which order by `modifiedAt`, the bump does float the row — accepted, it was just edited. Web centralizes both cases in `withPinToggled` (`utils/todo.ts`, unit-tested); Android inlines the same branch at the `onTogglePin` call site. Pin never arms or clears the undo buffer.
- **State icon beats pin icon, but the pin keeps its colour.** The left icon shows the pin *glyph* only on a row that is genuinely active — precedence is done → snoozed → pinned → was-unsnoozed → plain — since that's the only row whose order the pin changes. A pinned done or snoozed row keeps its own glyph (check / filled clock) but is drawn in the **pin tint** (web `text-accent`, Android `colorScheme.primary`), so pinned-ness is still legible everywhere without the glyph lying about the row's state. On Android a done row is already `primary`-tinted, so a pinned done row looks unchanged there; the snoozed one goes tertiary → primary. The icon's "Pinned" `contentDescription` follows the tint, not the glyph.
- No scroll-into-view on toggle (deliberately removed). The `modifiedAt` bump already lands the row near the top of its group — a pinned row at the very top, an unpinned row just below the pinned rows — so it stays visible in the common case (toggling while at the top of the list). Chasing the row with a programmatic scroll wasn't worth the complexity: the row's `animateItem` reorder is mid-flight for a few hundred ms after the toggle, so any visibility check reads stale offsets, which forced a fixed settle delay and still misfired. The list just re-sorts (with its row animation) and the viewport stays put.
- Web: a pinned active row is identified by its **left/primary icon** — an outlined pin (`BsPinAngle`, accent) in place of the state dot. Clicking it still marks done, exactly like the `wasUnsnoozed` outline-clock icon does — the pin is a state *indicator*, not the toggle. Pinning is the **hover pin button** (between snooze and delete in the action cluster, `showPin`, `FaThumbtack`), which behaves like every other hover action (hidden at rest, fades in on hover via the shared `hoverAction` class; accent tint when pinned).
- Android: pin is a **long-press anywhere on the row** (`onTogglePin` on `TodoItem`; the `onLongClick` of the same `Modifier.combinedClickable` that handles tap-to-edit, so it fires over the icon/padding *and* the text). There is **no trailing pin button** — the earlier always-visible button was too much visual noise. A pinned active row is identified by its **left icon**: a primary-tinted outline `PushPin` replaces the state dot. Long-press gives haptic feedback and is a no-op on a done row. Trade-off vs the old button: lower discoverability and weaker TalkBack affordance (the icon carries a "Pinned" contentDescription, but the toggle isn't a discrete a11y action). The swipe gestures are unchanged (`SwipeToDismissBox`: complete/delete + snooze/reactivate).

### Fast Todo Compose Loop
- When in fast compose mode with an empty todo, pressing Done should clear focus and delete the empty todo
- IME action should be "Done" when the todo text is empty (not "Next")
- IME action should be "Next" when the todo text is not empty (creates new todo)

## Firestore schema

`users/{uid}/todos/{todoId}` — each doc: `{ text, state: "ACTIVE"|"DONE", createdAt, modifiedAt, snoozeUntil, pinned }`. Rules in `firebase/firestore.rules` restrict reads and writes to the owning `uid`.

There is no `SNOOZED` state — see [Snooze is derived](#snooze-is-derived). Docs written by older clients still carry one; both clients map it to `ACTIVE` on read (web `readState` in `utils/todo.ts`, Android `Todo.readState`, and the Room `Converters.toTodoState`, which must not use `valueOf`), so `snoozeUntil` alone decides.

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
- **The snapshot listener self-heals with backoff.** A Firestore listener that delivers an *error* (not a transient drop, which the SDK reconnects silently) is dead for good. Both clients re-register with capped exponential backoff (1s→30s): Android propagates the error out of the `observeAll` `callbackFlow` (`close(err)`) and wraps it in `retryWhen`; web re-`attach`es on a `setTimeout` from the `onSnapshot` error callback. Recovery needs no user gesture. Both reset the backoff after a healthy emission (web on a server-confirmed snapshot; Android via an `onEach` that zeroes its failure counter). Web additionally exposes `reattach()` (fired on tab-wake / online) as an immediate-retry-that-resets-backoff; Android relies on `retryWhen` plus `WhileSubscribed` re-collecting the flow (a fresh listener) once its 5s grace lapses after the last subscriber leaves.
- **Store swaps live in `TodoStoreHolder`; the auth listener only swaps.** `onAuthStateChanged` swaps the live `TodoStore` (local ↔ Firestore) and does nothing else. Merging and snapshotting happen only on the explicit user-initiated entry points `signIn` / `signOut` / `deleteAccount`. On sign-in, `mergeLocalIntoFirestore` (web) / `mergeRoomIntoFirestore` (Android) `getDocs` the full remote collection, pushes local rows that are newer (`modifiedAt >` remote) or absent remotely, and drops local rows matching a remote tombstone (so a delete made on another device isn't resurrected) — then the auth listener swaps.
- **Favicon viewBox cropped to `49 27 22 32`.** The clock-hands L reads at 16×16; the full 108×108 Android composition is illegible at that size.
- **Left icon = primary state flip; right cluster = secondary actions.** Click the left icon on any row to toggle its main state (active↔done, snoozed→active). Right actions fade in on hover and vary by state.
- **Android rows render display text at rest, swapping to an editor on tap.** Each `TodoItem` shows a plain `Text` until tapped, then swaps to a `BasicTextField` (`editing` gates the two). This keeps scroll cheap (a `BasicTextField` per visible row is a real composition cost) and frees the row for a long-press-to-pin gesture that an always-present editor would swallow as text selection. Seamlessness depends on the display `Text` and the field sharing one `TextStyle` with no padding on either, so the swap doesn't shift a pixel. Tap-to-edit and long-press-to-pin are a single `Modifier.combinedClickable` on the whole row (**not** a raw `detectTapGestures` — nested inside the `SwipeToDismissBox` drag + `LazyColumn` scroll, a raw tap detector dropped most taps). `combinedClickable` gives no tap position, so a passive `pointerInput` on the display `Text` peeks at each down (Initial pass, non-consuming, so it doesn't disturb the click) and records the caret offset via `getOffsetForPosition`; `onClick` opens the editor there, falling back to end for taps off the text. Focus is requested after a `withFrameNanos` delay so it isn't lost when stealing focus from another row's field. Web keeps its always-present field (no scroll list of the same weight, and its pin uses a hover button, not long-press).
- **Android list scroll perf: cache window + stability config.** All four `rememberLazyListState`s get a `LazyLayoutCacheWindow(ahead = 300.dp, behind = 150.dp)` (experimental foundation API) so heavy rows pre-compose in idle frame time instead of on viewport entry during a fling. `app/compose_stability.conf` declares `com.google.firebase.Timestamp` stable (it's deeply immutable) — without it `Todo.serverModifiedAt` made the whole `Todo` class unstable, so every Firestore echo recomposed all visible rows.
- **Release runs R8, with keep rules for what it can't see.** `isMinifyEnabled`/`isShrinkResources` are on for release (judge scroll smoothness on a release install — debug Compose is expected to jank); release is debug-signed so `installRelease` works until real publish signing exists. Two things R8 can't statically see and would strip: Credential Manager's Play Services provider, loaded via `Class.forName` from manifest metadata (kept via `proguard-rules.pro`, verbatim from the Credential Manager docs) — without it `getCredential()` fails and Google sign-in silently does nothing; and `default_web_client_id`, read only through `resources.getIdentifier` so the resource shrinker can't see it (kept via `res/raw/keep.xml`) — without it release builds disable auth entirely.
- **No `.env.local`.** Firebase web-config values ship in the client bundle by design; there is no secret. Inlined in `web/utils/firebase.ts` so a fresh clone builds without env setup.
- **Deletes are tombstones, and the query hides them.** A delete writes `{deleted: true, modifiedAt, serverModifiedAt}` (web `updateDoc`, Android `.update()` — *not* `set`/merge, so a doc already deleted elsewhere isn't re-created as a tombstone) instead of removing the doc. The point is the sign-in merge: with a hard delete, "absent remotely" is ambiguous — *never synced* or *deleted on another device*? — and the merge guessed "never synced" and pushed the row back up, resurrecting every delete. A tombstone removes the guess.
  - The tombstone write is **`set`/merge, not `update`** — `update` rejects a missing doc, so one NOT_FOUND (a row an older, hard-deleting client removed) would abort the whole `clearAllDone` batch and clear nothing. `set`/merge keeps the batch atomic *and* works offline (a transaction would give atomicity too, but Firestore transactions need a server round trip and fail offline). If the doc is gone, `set`/merge just re-creates it as a bare `{deleted: true}` gravestone: invisible behind the `deleted == false` query, read as "deleted" by the merge, and it usefully converts an old client's hard delete into a real tombstone.
  - The cost of keeping them is paid **server-side**: both listeners query `where("deleted", "==", false)` (web `LIVE_ONLY`, Android `liveOnly`), so a tombstone never reaches a client — no read, no bandwidth, no in-memory filter needed (the `!t.deleted` filters are kept only as a backstop). A tombstoned doc simply leaves the query and Firestore delivers REMOVED, exactly as a hard delete did. Growth is storage-only, and storage is free at this size.
  - **`== false` does not match a doc missing the field**, so every doc must have it. All 151 existing docs were backfilled (2026-07-12; one predated the field — created 2026-04-12, before `deleted` was added in `6325632`, and never rewritten since because it was snoozed a year out). Every write path stamps `deleted`, so new docs are fine. If you ever add a write that doesn't go through `toFirestoreFields`/`toMap`, it must still set it or the todo will vanish from the app.
  - **Local (signed-out) deletes are tombstones too**, and the merge consumes them: `RoomTodoStore`/`LocalTodoStore` mark the row rather than dropping it, the merge pushes it up, then purges it (`dao.purgeTombstones()`, web `replaceAll`). Without that, a delete made while signed out is forgotten and the live remote doc resurfaces on the next sign-in. Reads filter them (`getAllTodos` has `WHERE deleted = 0`; web `getTodos()` holds only live rows, with `getWithTombstones()` for the merge).
  - Hard deletes survive in exactly two places, both correct: the delete-account wipe, and the abandoned-empty-draft cleanup (a todo that never had content isn't worth a tombstone).
  - The merge decision is a pure function — `planMerge` (`web/utils/merge.ts`, `data/TodoMerge.kt`), unit-tested on both platforms. Note it never deletes a *remote* row that's merely absent locally: a fresh device with an empty store must not wipe the account.
  - Undo holds the full `Todo[]` (web `lastUndo.todos`, Android `UndoableAction.Delete.todos`) and restores by flipping `deleted` back to false, preserving the original `modifiedAt` so the row lands back in its prior sort position. Since the doc still exists, that's now a plain update rather than a re-create through the laxer `create` rule.
- **Server-time gated writes via Firestore rule.** Every doc carries `serverModifiedAt = serverTimestamp()` and the rule on `users/{uid}/todos/{id}` requires `request.resource.data.serverModifiedAt >= resource.data.serverModifiedAt`. It's a compare-and-swap on a per-doc version stamp. Every write we make now is a *user edit*, which stamps `serverTimestamp()` (= `request.time`) and so always passes — the rule's remaining job is to reject a write whose basis is stale, which today can only happen to a client whose cache is behind. `serverModifiedAt` is carried as the raw SDK `Timestamp` (web `firebase/firestore` Timestamp, Android `com.google.firebase.Timestamp`) — truncating to millis would defeat the `>=` check even with no conflict.
  - **Never forge a basis.** The one write that used to re-send a basis (the auto-unsnooze) fell back to `serverTimestamp()` when the local `serverModifiedAt` was null, which resolves to `request.time` and passes the CAS *unconditionally* — a stale client then won every race. That corrupted live data (see [Snooze is derived](#snooze-is-derived)) and the write is gone. If a future automatic (non-user-initiated) write is ever added, it must either carry a real basis or not be sent; and it must not run off a cache-only snapshot (web's listener emits `fromCache: true` first).
  - If you need an automatic cross-device write, prefer a **server-side field transform** (`arrayUnion` / `arrayRemove` / `increment`) over a read-modify-write: transforms are evaluated on the server against the current doc, so they're immune to a stale local snapshot and need no CAS at all.

## Known limitations

- Simultaneous edits on web and Android to the same todo resolve by "last write to Firestore wins on next snapshot." This is not true collaborative editing. A client acting on a **stale view** (e.g. a rarely-opened origin whose Firestore cache is far behind) can therefore clobber newer remote state — but only for a write the user actually initiated, at `request.time`. No write happens on its own any more.
- Snoozed-ness is derived from **local** wall-clock time, so a device with a badly skewed clock will disagree about which todos are snoozed. Nothing is written, so it self-corrects the moment the clock does.
- A concurrent snooze from two devices resolves LWW on `snoozeUntil` rather than merging (an add/remove set of snooze tokens would merge; see [Snooze is derived](#snooze-is-derived)).
- Undo of a snooze/complete/delete resolves against a concurrent remote edit by the same last-write-wins as any other write. It can no longer *resurrect* a todo deleted on another device, though: deletes are tombstones, so the doc is still there and undo is an ordinary update rather than a re-create.
- Touch-device hover actions use `@media (hover: none)` to show a trailing menu instead — not fully tested on real iOS/Android browsers.
- The snooze popover's "Pick a date & time…" uses the native `<input type="datetime-local">`, whose UI varies by browser.
- On first load the web store hydrates from `localStorage` in a mount effect, so there's a brief frame where the todo list is empty before cache loads.
- Tombstones accumulate in Firestore forever (no GC). They cost the clients nothing — the `deleted == false` listener query never fetches them — so this is storage-only growth. Deliberately **no automatic sweep to reap them**: an automatic cross-device write is the exact shape of the bug in [Snooze is derived](#snooze-is-derived). If it ever matters, GC with an admin script.
- Deploy order matters: a client still on an older build **hard-deletes**, writing no tombstone, so the merge protection is only real once both clients are updated.
