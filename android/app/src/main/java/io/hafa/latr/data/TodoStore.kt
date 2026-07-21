package io.hafa.latr.data

import kotlinx.coroutines.flow.Flow

/** Single todo backend: [FirestoreTodoStore] when signed in, [RoomTodoStore] when out; swapped by [TodoStoreHolder]. */
interface TodoStore {
    fun observeAll(): Flow<List<Todo>>
    suspend fun snapshot(): List<Todo>

    suspend fun insert(todo: Todo)
    suspend fun update(todo: Todo)
    suspend fun delete(todo: Todo)

    suspend fun clearAllDone(done: List<Todo>)
    suspend fun restoreMany(todos: List<Todo>)
    suspend fun deleteEmptyTodosExcept(exceptId: String)
}
