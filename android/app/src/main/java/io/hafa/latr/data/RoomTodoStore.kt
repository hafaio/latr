package io.hafa.latr.data

import kotlinx.coroutines.flow.Flow

class RoomTodoStore(private val dao: TodoDao) : TodoStore {
    override fun observeAll(): Flow<List<Todo>> = dao.getAllTodos()

    override suspend fun snapshot(): List<Todo> = dao.getAllSnapshot()

    override suspend fun insert(todo: Todo) = dao.insert(todo)

    override suspend fun update(todo: Todo) = dao.update(todo)

    override suspend fun delete(todo: Todo) = dao.delete(todo)

    override suspend fun clearAllDone(): List<Todo> {
        val done = dao.getDoneTodos()
        if (done.isNotEmpty()) dao.deleteAllDone()
        return done
    }

    override suspend fun restoreMany(todos: List<Todo>) {
        val now = System.currentTimeMillis()
        for (t in todos) dao.insert(t.copy(modifiedAt = now))
    }

    override suspend fun deleteEmptyTodosExcept(exceptId: String) {
        dao.deleteEmptyTodosExcept(exceptId)
    }

    override suspend fun getExpiredSnoozed(nowIso: String): List<Todo> =
        dao.getExpiredSnoozed(nowIso)
}
