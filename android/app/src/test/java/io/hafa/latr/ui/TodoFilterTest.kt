package io.hafa.latr.ui

import io.hafa.latr.data.Todo
import io.hafa.latr.data.TodoState
import io.hafa.latr.util.LocalDateTimeUtil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodoFilterTest {

    private val now = 1_000_000L

    private fun todo(
        id: String = "id",
        text: String = "",
        state: TodoState = TodoState.ACTIVE,
        modifiedAt: Long = 0L,
        snoozeUntil: String? = null,
        pinned: Boolean = false,
    ): Todo = Todo(
        id = id,
        text = text,
        state = state,
        modifiedAt = modifiedAt,
        snoozeUntil = snoozeUntil,
        pinned = pinned,
    )

    private fun iso(epoch: Long): String = LocalDateTimeUtil.fromEpochMillis(epoch)

    private fun List<Todo>.sorted(filter: StatusFilter, query: String = "") =
        filterAndSort(filter, query, now).map { it.id }

    @Test
    fun `ALL returns every todo in modifiedAt-desc order`() {
        val a = todo(id = "a", state = TodoState.ACTIVE, modifiedAt = 100)
        val b = todo(id = "b", state = TodoState.DONE, modifiedAt = 300)
        val c = todo(id = "c", modifiedAt = 200, snoozeUntil = iso(now + 5_000))
        assertEquals(listOf("b", "c", "a"), listOf(a, b, c).sorted(StatusFilter.ALL))
    }

    @Test
    fun `DONE keeps only DONE todos sorted by modifiedAt desc`() {
        val a = todo(id = "a", state = TodoState.ACTIVE, modifiedAt = 100)
        val b = todo(id = "b", state = TodoState.DONE, modifiedAt = 200)
        val c = todo(id = "c", state = TodoState.DONE, modifiedAt = 300)
        assertEquals(listOf("c", "b"), listOf(a, b, c).sorted(StatusFilter.DONE))
    }

    @Test
    fun `snoozed-ness is the snooze time, not the state`() {
        val ahead = todo(snoozeUntil = iso(now + 1))
        val lapsed = todo(snoozeUntil = iso(now - 1))
        assertTrue(ahead.isSnoozed(now))
        assertFalse(lapsed.isSnoozed(now))
        assertFalse(todo().isSnoozed(now))
    }

    @Test
    fun `state ACTIVE no longer implies unsnoozed - gates must ask isSnoozed`() {
        // Every live todo is now state ACTIVE, so `state == ACTIVE` can't stand in
        // for "not snoozed" — the edit gate did exactly that and unsnoozed rows.
        val snoozed = todo(state = TodoState.ACTIVE, snoozeUntil = iso(now + 1_000))
        assertEquals(TodoState.ACTIVE, snoozed.state)
        assertTrue(snoozed.isSnoozed(now))
    }

    @Test
    fun `a done todo is never snoozed, however far out its snoozeUntil`() {
        val done = todo(state = TodoState.DONE, snoozeUntil = iso(now + 10_000))
        assertFalse(done.isSnoozed(now))
        assertEquals(listOf("id"), listOf(done).sorted(StatusFilter.DONE))
        assertEquals(emptyList<String>(), listOf(done).sorted(StatusFilter.SNOOZED))
    }

    @Test
    fun `a row left ACTIVE with a future snooze still reads as snoozed`() {
        val corrupted = todo(id = "corrupt", state = TodoState.ACTIVE, snoozeUntil = iso(now + 5_000))
        assertEquals(listOf("corrupt"), listOf(corrupted).sorted(StatusFilter.SNOOZED))
        assertEquals(emptyList<String>(), listOf(corrupted).sorted(StatusFilter.ACTIVE))
    }

    @Test
    fun `a lapsed snooze moves itself into ACTIVE with no write`() {
        val lapsing = todo(id = "lapsing", snoozeUntil = iso(now + 1_000))
        assertEquals(listOf("lapsing"), listOf(lapsing).filterAndSort(StatusFilter.SNOOZED, "", now).map { it.id })
        val later = now + 2_000
        assertEquals(
            listOf("lapsing"),
            listOf(lapsing).filterAndSort(StatusFilter.ACTIVE, "", later).map { it.id },
        )
        assertEquals(
            emptyList<String>(),
            listOf(lapsing).filterAndSort(StatusFilter.SNOOZED, "", later).map { it.id },
        )
    }

    @Test
    fun `ACTIVE surfaces recently-unsnoozed rows by their snoozeUntil`() {
        val plain = todo(id = "plain", modifiedAt = 1_000L)
        val recentlyUnsnoozed = todo(id = "recent", modifiedAt = 500L, snoozeUntil = iso(5_000L))
        assertEquals(
            listOf("recent", "plain"),
            listOf(plain, recentlyUnsnoozed).sorted(StatusFilter.ACTIVE),
        )
    }

    @Test
    fun `ACTIVE floats pinned todos above unpinned regardless of modifiedAt`() {
        val pinnedOld = todo(id = "pinned", modifiedAt = 100, pinned = true)
        val freshA = todo(id = "freshA", modifiedAt = 300)
        val freshB = todo(id = "freshB", modifiedAt = 200)
        assertEquals(
            listOf("pinned", "freshA", "freshB"),
            listOf(freshA, pinnedOld, freshB).sorted(StatusFilter.ACTIVE),
        )
    }

    @Test
    fun `ACTIVE orders pinned todos among themselves by the normal key`() {
        val older = todo(id = "older", modifiedAt = 100, pinned = true)
        val newer = todo(id = "newer", modifiedAt = 200, pinned = true)
        assertEquals(listOf("newer", "older"), listOf(older, newer).sorted(StatusFilter.ACTIVE))
    }

    @Test
    fun `DONE and ALL ignore pinned`() {
        val pinnedOld = todo(id = "pinned", state = TodoState.DONE, modifiedAt = 100, pinned = true)
        val fresh = todo(id = "fresh", state = TodoState.DONE, modifiedAt = 300)
        assertEquals(
            listOf("fresh", "pinned"),
            listOf(pinnedOld, fresh).sorted(StatusFilter.DONE),
        )
        assertEquals(
            listOf("fresh", "pinned"),
            listOf(pinnedOld, fresh).sorted(StatusFilter.ALL),
        )
    }

    @Test
    fun `SNOOZED ignores pinned`() {
        val laterPinned = todo(id = "later", snoozeUntil = iso(now + 10_000), pinned = true)
        val sooner = todo(id = "sooner", snoozeUntil = iso(now + 5_000))
        assertEquals(
            listOf("sooner", "later"),
            listOf(laterPinned, sooner).sorted(StatusFilter.SNOOZED),
        )
    }

    @Test
    fun `ACTIVE breaks unsnooze-time ties by modifiedAt desc`() {
        val sameUnsnooze = iso(5_000L)
        val older = todo(id = "older", modifiedAt = 100, snoozeUntil = sameUnsnooze)
        val newer = todo(id = "newer", modifiedAt = 200, snoozeUntil = sameUnsnooze)
        assertEquals(listOf("newer", "older"), listOf(older, newer).sorted(StatusFilter.ACTIVE))
    }

    @Test
    fun `SNOOZED sorts by snoozeUntil ascending`() {
        val later = todo(id = "later", snoozeUntil = iso(now + 10_000))
        val sooner = todo(id = "sooner", snoozeUntil = iso(now + 5_000))
        assertEquals(
            listOf("sooner", "later"),
            listOf(later, sooner).sorted(StatusFilter.SNOOZED),
        )
    }

    @Test
    fun `search does word-boundary prefix match`() {
        val hit = todo(id = "hit", text = "email reply")
        val miss = todo(id = "miss", text = "female review")
        assertEquals(listOf("hit"), listOf(hit, miss).sorted(StatusFilter.ACTIVE, "em"))
        assertEquals(emptyList<String>(), listOf(hit, miss).sorted(StatusFilter.ACTIVE, "mail"))
    }

    @Test
    fun `search ranks by number of matched terms`() {
        val two = todo(id = "two", text = "buy milk and bread")
        val one = todo(id = "one", text = "buy coffee")
        assertEquals(
            listOf("two", "one"),
            listOf(one, two).sorted(StatusFilter.ACTIVE, "buy milk"),
        )
    }

    @Test
    fun `search escapes regex metacharacters in the query`() {
        val hit = todo(id = "hit", text = "price is 5.99 today")
        val miss = todo(id = "miss", text = "code 5x99 today")
        assertEquals(listOf("hit"), listOf(hit, miss).sorted(StatusFilter.ACTIVE, "5.99"))
    }

    @Test
    fun `blank searchQuery is a no-op (keeps sorted order)`() {
        val a = todo(id = "a", modifiedAt = 100)
        val b = todo(id = "b", modifiedAt = 200)
        assertEquals(listOf("b", "a"), listOf(a, b).sorted(StatusFilter.ACTIVE, "   "))
    }

    @Test
    fun `TAB_ORDER and DEFAULT_TAB stay in sync`() {
        assertEquals(StatusFilter.ACTIVE, TAB_ORDER[DEFAULT_TAB])
    }
}
