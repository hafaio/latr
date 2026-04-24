package io.hafa.latr.ui

import io.hafa.latr.data.Todo
import io.hafa.latr.data.TodoState
import io.hafa.latr.util.LocalDateTimeUtil
import org.junit.Assert.assertEquals
import org.junit.Test

class TodoFilterTest {

    private fun todo(
        id: String = "id",
        text: String = "",
        state: TodoState = TodoState.ACTIVE,
        modifiedAt: Long = 0L,
        snoozeUntil: String? = null,
    ): Todo = Todo(
        id = id,
        text = text,
        state = state,
        modifiedAt = modifiedAt,
        snoozeUntil = snoozeUntil,
    )

    private fun iso(epoch: Long): String = LocalDateTimeUtil.fromEpochMillis(epoch)

    @Test
    fun `ALL returns every todo in modifiedAt-desc order`() {
        val a = todo(id = "a", state = TodoState.ACTIVE, modifiedAt = 100)
        val b = todo(id = "b", state = TodoState.DONE, modifiedAt = 300)
        val c = todo(id = "c", state = TodoState.SNOOZED, modifiedAt = 200)
        val out = listOf(a, b, c).filterAndSort(StatusFilter.ALL, "").map { it.id }
        assertEquals(listOf("b", "c", "a"), out)
    }

    @Test
    fun `DONE keeps only DONE todos sorted by modifiedAt desc`() {
        val a = todo(id = "a", state = TodoState.ACTIVE, modifiedAt = 100)
        val b = todo(id = "b", state = TodoState.DONE, modifiedAt = 200)
        val c = todo(id = "c", state = TodoState.DONE, modifiedAt = 300)
        val out = listOf(a, b, c).filterAndSort(StatusFilter.DONE, "").map { it.id }
        assertEquals(listOf("c", "b"), out)
    }

    @Test
    fun `ACTIVE surfaces recently-unsnoozed rows by their snoozeUntil`() {
        val plain = todo(id = "plain", state = TodoState.ACTIVE, modifiedAt = 1_000L)
        val recentlyUnsnoozed = todo(
            id = "recent",
            state = TodoState.ACTIVE,
            modifiedAt = 500L,
            snoozeUntil = iso(5_000L),
        )
        val out = listOf(plain, recentlyUnsnoozed)
            .filterAndSort(StatusFilter.ACTIVE, "")
            .map { it.id }
        assertEquals(listOf("recent", "plain"), out)
    }

    @Test
    fun `SNOOZED sorts by snoozeUntil ascending`() {
        val later = todo(
            id = "later",
            state = TodoState.SNOOZED,
            snoozeUntil = iso(10_000L),
        )
        val sooner = todo(
            id = "sooner",
            state = TodoState.SNOOZED,
            snoozeUntil = iso(5_000L),
        )
        val out = listOf(later, sooner)
            .filterAndSort(StatusFilter.SNOOZED, "")
            .map { it.id }
        assertEquals(listOf("sooner", "later"), out)
    }

    @Test
    fun `search does word-boundary prefix match`() {
        val hit = todo(id = "hit", state = TodoState.ACTIVE, text = "email reply")
        val miss = todo(id = "miss", state = TodoState.ACTIVE, text = "female review")
        val out = listOf(hit, miss).filterAndSort(StatusFilter.ACTIVE, "em").map { it.id }
        assertEquals(listOf("hit"), out)
        val noMatch = listOf(hit, miss).filterAndSort(StatusFilter.ACTIVE, "mail")
        assertEquals(emptyList<Todo>(), noMatch)
    }

    @Test
    fun `search ranks by number of matched terms`() {
        val two = todo(id = "two", state = TodoState.ACTIVE, text = "buy milk and bread")
        val one = todo(id = "one", state = TodoState.ACTIVE, text = "buy coffee")
        val out = listOf(one, two)
            .filterAndSort(StatusFilter.ACTIVE, "buy milk")
            .map { it.id }
        assertEquals(listOf("two", "one"), out)
    }

    @Test
    fun `search escapes regex metacharacters in the query`() {
        val hit = todo(id = "hit", state = TodoState.ACTIVE, text = "price is 5.99 today")
        val miss = todo(id = "miss", state = TodoState.ACTIVE, text = "code 5x99 today")
        val out = listOf(hit, miss).filterAndSort(StatusFilter.ACTIVE, "5.99").map { it.id }
        assertEquals(listOf("hit"), out)
    }

    @Test
    fun `blank searchQuery is a no-op (keeps sorted order)`() {
        val a = todo(id = "a", state = TodoState.ACTIVE, modifiedAt = 100)
        val b = todo(id = "b", state = TodoState.ACTIVE, modifiedAt = 200)
        val out = listOf(a, b).filterAndSort(StatusFilter.ACTIVE, "   ").map { it.id }
        assertEquals(listOf("b", "a"), out)
    }

    @Test
    fun `TAB_ORDER and DEFAULT_TAB stay in sync`() {
        assertEquals(StatusFilter.ACTIVE, TAB_ORDER[DEFAULT_TAB])
    }
}
