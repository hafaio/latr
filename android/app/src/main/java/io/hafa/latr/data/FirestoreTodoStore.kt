package io.hafa.latr.data

import android.util.Log
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Reads and writes go straight through Firestore (with its persistent local
 * cache). The snapshot listener is the only source of truth — no Room
 * intermediate to reconcile, so echoes of our own writes cannot clobber
 * in-flight typing the way they could in the two-store model.
 *
 * Legacy tombstone docs (deleted=true, written by older clients) are filtered
 * out on read so the UI never surfaces them. New deletes call deleteDoc
 * directly; Firestore propagates REMOVED to every active listener.
 *
 * Writes do **not** await the returned Task: while offline that Task stays
 * pending until the server acks, which would suspend the coroutine
 * indefinitely and block subsequent steps in the caller's flow (e.g. setting
 * focus on a freshly inserted todo). The local cache write fires the
 * snapshot listener regardless, and persistentLocalCache replays the queued
 * write to the server once the connection is back. Failures are logged.
 */
class FirestoreTodoStore(
    private val firestore: FirebaseFirestore,
    uid: String,
) : TodoStore {
    private val collection: CollectionReference =
        firestore.collection("users").document(uid).collection("todos")

    override fun observeAll(): Flow<List<Todo>> = callbackFlow {
        val reg = collection.addSnapshotListener { snap, err ->
            if (err != null || snap == null) return@addSnapshotListener
            val todos = snap.documents.mapNotNull { doc ->
                val todo = Todo.fromMap(doc.id, doc.data ?: emptyMap())
                if (todo.deleted) null else todo
            }
            trySend(todos)
        }
        awaitClose { reg.remove() }
    }

    override suspend fun snapshot(): List<Todo> {
        val snap = collection.get().await()
        return snap.documents.mapNotNull { doc ->
            val todo = Todo.fromMap(doc.id, doc.data ?: emptyMap())
            if (todo.deleted) null else todo
        }
    }

    override suspend fun insert(todo: Todo) {
        collection.document(todo.id).set(todo.toMap(), SetOptions.merge())
            .addOnFailureListener { Log.w(TAG, "insert failed", it) }
    }

    override suspend fun update(todo: Todo) {
        collection.document(todo.id).set(todo.toMap(), SetOptions.merge())
            .addOnFailureListener { Log.w(TAG, "update failed", it) }
    }

    override suspend fun delete(todo: Todo) {
        collection.document(todo.id).delete()
            .addOnFailureListener { Log.w(TAG, "delete failed", it) }
    }

    override suspend fun clearAllDone(): List<Todo> {
        val snap = collection.whereEqualTo("state", TodoState.DONE.name).get().await()
        val done = snap.documents.mapNotNull { doc ->
            val todo = Todo.fromMap(doc.id, doc.data ?: emptyMap())
            if (todo.deleted) null else todo
        }
        if (done.isEmpty()) return emptyList()
        val batch = firestore.batch()
        for (doc in snap.documents) batch.delete(doc.reference)
        batch.commit().addOnFailureListener { Log.w(TAG, "clearAllDone failed", it) }
        return done
    }

    override suspend fun restoreMany(todos: List<Todo>) {
        if (todos.isEmpty()) return
        val now = System.currentTimeMillis()
        val batch = firestore.batch()
        for (t in todos) {
            val restored = t.copy(modifiedAt = now)
            batch.set(collection.document(t.id), restored.toMap(), SetOptions.merge())
        }
        batch.commit().addOnFailureListener { Log.w(TAG, "restoreMany failed", it) }
    }

    override suspend fun deleteEmptyTodosExcept(exceptId: String) {
        val snap = collection.whereEqualTo("text", "").get().await()
        val toDelete = snap.documents.filter { it.id != exceptId }
        if (toDelete.isEmpty()) return
        val batch = firestore.batch()
        for (doc in toDelete) batch.delete(doc.reference)
        batch.commit().addOnFailureListener {
            Log.w(TAG, "deleteEmptyTodosExcept failed", it)
        }
    }

    override suspend fun getExpiredSnoozed(nowIso: String): List<Todo> {
        val snap = collection
            .whereEqualTo("state", TodoState.SNOOZED.name)
            .whereLessThan("snoozeUntil", nowIso)
            .get().await()
        return snap.documents.mapNotNull { doc ->
            val todo = Todo.fromMap(doc.id, doc.data ?: emptyMap())
            if (todo.deleted) null else todo
        }
    }

    /** Wipe every doc in this user's todos collection. Used by delete-account. */
    suspend fun deleteAll() {
        val snap = collection.get().await()
        if (snap.isEmpty) return
        val batch = firestore.batch()
        for (doc in snap.documents) batch.delete(doc.reference)
        batch.commit().await()
    }

    companion object {
        private const val TAG = "FirestoreTodoStore"
    }
}
