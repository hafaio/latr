package io.hafa.latr.data

import io.hafa.latr.util.LocalDateTimeUtil
import kotlinx.coroutines.flow.Flow

class RoomTodoStore(private val dao: TodoDao) : TodoStore {
    override fun observeAll(): Flow<List<Todo>> = dao.getAllTodos()

    override suspend fun snapshot(): List<Todo> = dao.getAllSnapshot()

    override suspend fun insert(todo: Todo) = dao.insert(todo)

    override suspend fun update(todo: Todo) = dao.update(todo)

    override suspend fun unsnooze(todo: Todo) {
        val snoozeMillis = todo.snoozeUntil?.let { LocalDateTimeUtil.toEpochMillis(it) }
            ?: System.currentTimeMillis()
        dao.update(todo.copy(state = TodoState.ACTIVE, modifiedAt = snoozeMillis))
    }

    override suspend fun delete(todo: Todo) = dao.delete(todo)

    override suspend fun clearAllDone(done: List<Todo>) {
        for (t in done) dao.delete(t)
    }

    override suspend fun restoreMany(todos: List<Todo>) {
        for (t in todos) dao.insert(t)
    }

    override suspend fun deleteEmptyTodosExcept(exceptId: String) {
        dao.deleteEmptyTodosExcept(exceptId)
    }

    override suspend fun getExpiredSnoozed(nowIso: String): List<Todo> =
        dao.getExpiredSnoozed(nowIso)
}
