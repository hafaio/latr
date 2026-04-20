package io.hafa.latr.data

import kotlinx.coroutines.flow.Flow

class TodoRepository(
    private val todoDao: TodoDao,
    private val firestoreSync: FirestoreSync?
) {
    fun getAllTodos(): Flow<List<Todo>> = todoDao.getAllTodos()

    suspend fun insert(todo: Todo) {
        todoDao.insert(todo)
        firestoreSync?.pushTodo(todo)
    }

    suspend fun update(todo: Todo) {
        todoDao.update(todo)
        firestoreSync?.pushTodo(todo)
    }

    suspend fun delete(todo: Todo) {
        val now = System.currentTimeMillis()
        todoDao.delete(todo)
        firestoreSync?.pushTodo(todo.copy(deleted = true, modifiedAt = now))
    }

    suspend fun getExpiredSnoozed(now: String): List<Todo> =
        todoDao.getExpiredSnoozed(now)

    suspend fun deleteEmptyTodosExcept(exceptId: String) {
        val empties = todoDao.getEmptyTodosExcept(exceptId)
        if (empties.isEmpty()) return
        val now = System.currentTimeMillis()
        todoDao.deleteEmptyTodosExcept(exceptId)
        empties.forEach { firestoreSync?.pushTodo(it.copy(deleted = true, modifiedAt = now)) }
    }

    suspend fun getDoneTodos(): List<Todo> =
        todoDao.getDoneTodos()

    suspend fun deleteAllDone() {
        val done = todoDao.getDoneTodos()
        if (done.isEmpty()) return
        val now = System.currentTimeMillis()
        todoDao.deleteAllDone()
        done.forEach { firestoreSync?.pushTodo(it.copy(deleted = true, modifiedAt = now)) }
    }

    suspend fun restoreMany(todos: List<Todo>) {
        val now = System.currentTimeMillis()
        for (t in todos) {
            val restored = t.copy(deleted = false, modifiedAt = now)
            todoDao.insert(restored)
            firestoreSync?.pushTodo(restored)
        }
    }

    /**
     * Called when the user signs in. Uploads any local todos that aren't yet in
     * Firestore and starts the real-time listener.
     */
    suspend fun onSignedIn() {
        val sync = firestoreSync ?: return
        sync.uploadAll(todoDao)
        sync.startListening(todoDao)
    }

    /**
     * Called when the user signs out. Stops the real-time listener. Local Room
     * data is preserved.
     */
    fun onSignedOut() {
        firestoreSync?.stopListening()
    }

    /**
     * Stop the Firestore listener and delete all of the user's remote data
     * without cascading the deletions to Room.
     */
    suspend fun deleteAllRemoteData() {
        val sync = firestoreSync ?: return
        sync.stopListening()
        sync.deleteAllRemoteData()
    }
}
