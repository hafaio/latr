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
        todoDao.delete(todo)
        firestoreSync?.deleteTodo(todo.id)
    }

    suspend fun getExpiredSnoozed(now: String): List<Todo> =
        todoDao.getExpiredSnoozed(now)

    suspend fun deleteEmptyTodosExcept(exceptId: String) {
        val empties = todoDao.getEmptyTodosExcept(exceptId)
        todoDao.deleteEmptyTodosExcept(exceptId)
        empties.forEach { firestoreSync?.deleteTodo(it.id) }
    }

    suspend fun getDoneTodos(): List<Todo> =
        todoDao.getDoneTodos()

    suspend fun deleteAllDone() {
        val done = todoDao.getDoneTodos()
        todoDao.deleteAllDone()
        done.forEach { firestoreSync?.deleteTodo(it.id) }
    }

    suspend fun insertAll(todos: List<Todo>) {
        todoDao.insertAll(todos)
        todos.forEach { firestoreSync?.pushTodo(it) }
    }

    /**
     * Called when the user signs in. Uploads any local todos that aren't yet in
     * Firestore and starts the real-time listener.
     */
    suspend fun onSignedIn() {
        val sync = firestoreSync ?: return
        sync.uploadAll(todoDao.getAllSnapshot())
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
