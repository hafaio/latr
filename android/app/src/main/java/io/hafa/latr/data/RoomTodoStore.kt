package io.hafa.latr.data

import kotlinx.coroutines.flow.Flow

/** The signed-out store. A delete leaves a tombstone for the sign-in merge to push. */
class RoomTodoStore(private val dao: TodoDao) : TodoStore {
    override fun observeAll(): Flow<List<Todo>> = dao.getAllTodos()

    override suspend fun snapshot(): List<Todo> = dao.getLiveSnapshot()

    override suspend fun insert(todo: Todo) = dao.insert(todo)

    override suspend fun update(todo: Todo) = dao.update(todo)

    override suspend fun delete(todo: Todo) = tombstone(todo)

    override suspend fun clearAllDone(done: List<Todo>) {
        for (t in done) tombstone(t)
    }

    override suspend fun restoreMany(todos: List<Todo>) {
        for (t in todos) dao.upsert(t.copy(deleted = false))
    }

    override suspend fun deleteEmptyTodosExcept(exceptId: String) {
        dao.deleteEmptyTodosExcept(exceptId)
    }

    // modifiedAt so the merge can last-write-wins this against a remote edit.
    private suspend fun tombstone(todo: Todo) {
        dao.update(
            todo.copy(deleted = true, modifiedAt = System.currentTimeMillis()),
        )
    }
}
