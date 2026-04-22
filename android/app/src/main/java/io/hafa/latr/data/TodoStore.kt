package io.hafa.latr.data

import kotlinx.coroutines.flow.Flow

/**
 * A single backend for todos. While signed in this is [FirestoreTodoStore];
 * while signed out it is [RoomTodoStore]. Swapping happens in
 * [TodoStoreHolder] at the auth boundary, so the rest of the app sees one
 * coherent data source and does not need to reconcile two stores per write.
 */
interface TodoStore {
    fun observeAll(): Flow<List<Todo>>
    suspend fun snapshot(): List<Todo>

    suspend fun insert(todo: Todo)
    suspend fun update(todo: Todo)
    suspend fun delete(todo: Todo)

    suspend fun clearAllDone(): List<Todo>
    suspend fun restoreMany(todos: List<Todo>)
    suspend fun deleteEmptyTodosExcept(exceptId: String)
    suspend fun getExpiredSnoozed(nowIso: String): List<Todo>
}
