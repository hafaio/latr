package io.hafa.latr.data

import org.junit.Assert.assertEquals
import org.junit.Test

class TodoMergeTest {

    private fun todo(
        id: String = "id",
        modifiedAt: Long = 0L,
        deleted: Boolean = false,
    ): Todo = Todo(id = id, modifiedAt = modifiedAt, deleted = deleted)

    private fun remote(vararg todos: Todo): Map<String, Todo> =
        todos.associateBy { it.id }

    @Test
    fun `a local row with no remote twin is an offline create - push it`() {
        val plan = planMerge(listOf(todo(id = "new")), remote())
        assertEquals(listOf("new"), plan.toPush.map { it.id })
        assertEquals(emptyList<String>(), plan.toDropLocalIds)
    }

    @Test
    fun `a newer local row wins over its remote twin`() {
        val plan = planMerge(
            listOf(todo(id = "a", modifiedAt = 200)),
            remote(todo(id = "a", modifiedAt = 100)),
        )
        assertEquals(listOf("a"), plan.toPush.map { it.id })
    }

    @Test
    fun `an older local row is left alone`() {
        val plan = planMerge(
            listOf(todo(id = "a", modifiedAt = 100)),
            remote(todo(id = "a", modifiedAt = 200)),
        )
        assertEquals(emptyList<Todo>(), plan.toPush)
        assertEquals(emptyList<String>(), plan.toDropLocalIds)
    }

    @Test
    fun `a remote tombstone kills the local row - no resurrection`() {
        val plan = planMerge(
            listOf(todo(id = "gone", modifiedAt = 999)),
            remote(todo(id = "gone", modifiedAt = 1, deleted = true)),
        )
        assertEquals(emptyList<Todo>(), plan.toPush)
        assertEquals(listOf("gone"), plan.toDropLocalIds)
    }

    @Test
    fun `a local tombstone newer than the remote row is pushed - the signed-out delete lands`() {
        val plan = planMerge(
            listOf(todo(id = "x", modifiedAt = 200, deleted = true)),
            remote(todo(id = "x", modifiedAt = 100)),
        )
        assertEquals(listOf("x"), plan.toPush.map { it.id })
        assertEquals(listOf(true), plan.toPush.map { it.deleted })
        assertEquals(emptyList<String>(), plan.toDropLocalIds)
    }

    @Test
    fun `a local tombstone older than a remote edit loses - the edit survives`() {
        val plan = planMerge(
            listOf(todo(id = "x", modifiedAt = 100, deleted = true)),
            remote(todo(id = "x", modifiedAt = 200)),
        )
        assertEquals(emptyList<Todo>(), plan.toPush)
        assertEquals(emptyList<String>(), plan.toDropLocalIds)
    }

    @Test
    fun `a local tombstone with no remote twin says nothing - never pushed`() {
        val plan = planMerge(listOf(todo(id = "x", deleted = true)), remote())
        assertEquals(emptyList<Todo>(), plan.toPush)
        assertEquals(emptyList<String>(), plan.toDropLocalIds)
    }

    @Test
    fun `remote tombstone beats local tombstone - already dead, just drop it`() {
        val plan = planMerge(
            listOf(todo(id = "x", modifiedAt = 999, deleted = true)),
            remote(todo(id = "x", modifiedAt = 1, deleted = true)),
        )
        assertEquals(emptyList<Todo>(), plan.toPush)
        assertEquals(listOf("x"), plan.toDropLocalIds)
    }

    @Test
    fun `a remote row absent locally is untouched - a fresh device must not wipe the account`() {
        val plan = planMerge(emptyList(), remote(todo(id = "onlyRemote")))
        assertEquals(emptyList<Todo>(), plan.toPush)
        assertEquals(emptyList<String>(), plan.toDropLocalIds)
    }
}
