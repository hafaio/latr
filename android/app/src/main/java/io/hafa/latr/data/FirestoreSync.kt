package io.hafa.latr.data

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class FirestoreSync(
    private val auth: FirebaseAuth,
    private val scope: CoroutineScope
) {
    private val firestore = FirebaseFirestore.getInstance()
    private var listener: ListenerRegistration? = null

    private fun todosCollection() =
        firestore.collection("users")
            .document(auth.currentUser!!.uid)
            .collection("todos")

    suspend fun pushTodo(todo: Todo) {
        if (auth.currentUser == null) return
        todosCollection().document(todo.id).set(todo.toMap(), SetOptions.merge()).await()
    }

    suspend fun deleteTodo(todoId: String) {
        if (auth.currentUser == null) return
        todosCollection().document(todoId).delete().await()
    }

    suspend fun uploadAll(todos: List<Todo>) {
        if (auth.currentUser == null || todos.isEmpty()) return
        val batch = firestore.batch()
        for (todo in todos) {
            batch.set(todosCollection().document(todo.id), todo.toMap(), SetOptions.merge())
        }
        batch.commit().await()
        Log.d(TAG, "Uploaded ${todos.size} local todos to Firestore")
    }

    fun startListening(todoDao: TodoDao) {
        val uid = auth.currentUser?.uid ?: return
        stopListening()
        Log.d(TAG, "Starting Firestore listener for uid=$uid")
        listener = firestore.collection("users").document(uid).collection("todos")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Log.e(TAG, "Snapshot listener error", error)
                    return@addSnapshotListener
                }
                if (snapshot == null) return@addSnapshotListener
                scope.launch {
                    for (change in snapshot.documentChanges) {
                        val doc = change.document
                        when (change.type) {
                            DocumentChange.Type.ADDED,
                            DocumentChange.Type.MODIFIED -> {
                                val todo = Todo.fromMap(doc.id, doc.data)
                                val existing = todoDao.getById(doc.id)
                                if (existing == null) {
                                    todoDao.insert(todo)
                                } else if (todo.serverModifiedAt > existing.serverModifiedAt) {
                                    todoDao.update(todo)
                                }
                            }
                            DocumentChange.Type.REMOVED -> {
                                todoDao.getById(doc.id)?.let { todoDao.delete(it) }
                            }
                        }
                    }
                }
            }
    }

    fun stopListening() {
        listener?.remove()
        listener = null
    }

    suspend fun deleteAllRemoteData() {
        val uid = auth.currentUser?.uid ?: return
        val snapshot = todosCollection().get().await()
        if (snapshot.isEmpty) {
            Log.d(TAG, "No remote todos to delete for uid=$uid")
            return
        }
        val batch = firestore.batch()
        for (doc in snapshot.documents) {
            batch.delete(doc.reference)
        }
        batch.commit().await()
        Log.d(TAG, "Deleted ${snapshot.size()} remote todos for uid=$uid")
    }

    companion object {
        private const val TAG = "FirestoreSync"
    }
}
