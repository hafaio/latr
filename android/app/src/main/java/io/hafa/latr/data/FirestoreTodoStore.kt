package io.hafa.latr.data

import android.util.Log
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.tasks.await

/**
 * Firestore-backed store; the snapshot listener is the sole source of truth.
 * Writes are fire-and-forget (never await the Task) so an offline write can't
 * suspend the caller; the persistent cache replays it on reconnect.
 */
class FirestoreTodoStore(
    private val firestore: FirebaseFirestore,
    uid: String,
) : TodoStore {
    private val collection: CollectionReference =
        firestore.collection("users").document(uid).collection("todos")

    // `== false` does NOT match docs missing the field; every doc is backfilled.
    private val liveOnly: Query = collection.whereEqualTo("deleted", false)

    override fun observeAll(): Flow<List<Todo>> {
        // Tracked ourselves (not retryWhen's cumulative attempt) so onEach can reset it on a healthy emission.
        var failures = 0
        return callbackFlow {
            val reg = liveOnly.addSnapshotListener { snap, err ->
                // A delivered error terminates this listener; propagate so retryWhen
                // re-collects and registers a fresh one.
                if (err != null) close(err)
                else if (snap != null) {
                    trySend(
                        snap.documents.map { doc ->
                            Todo.fromMap(doc.id, doc.data ?: emptyMap())
                        }
                    )
                }
            }
            awaitClose { reg.remove() }
        }.onEach { failures = 0 }.retryWhen { cause, _ ->
            val backoff = minOf(
                MAX_RETRY_DELAY_MS,
                BASE_RETRY_DELAY_MS shl failures.coerceAtMost(RETRY_SHIFT_CAP),
            )
            failures++
            Log.w(TAG, "snapshot listener error; retrying in ${backoff}ms", cause)
            delay(backoff)
            true
        }
    }

    override suspend fun snapshot(): List<Todo> {
        val snap = liveOnly.get().await()
        return snap.documents.map { doc ->
            Todo.fromMap(doc.id, doc.data ?: emptyMap())
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
        collection.document(todo.id).set(tombstone(), SetOptions.merge())
            .addOnFailureListener { Log.w(TAG, "delete failed", it) }
    }

    override suspend fun clearAllDone(done: List<Todo>) {
        if (done.isEmpty()) return
        val batch = firestore.batch()
        for (t in done) {
            batch.set(collection.document(t.id), tombstone(), SetOptions.merge())
        }
        batch.commit().addOnFailureListener { Log.w(TAG, "clearAllDone failed", it) }
    }

    override suspend fun restoreMany(todos: List<Todo>) {
        if (todos.isEmpty()) return
        val batch = firestore.batch()
        for (t in todos) {
            batch.set(
                collection.document(t.id),
                t.copy(deleted = false).toMap(),
                SetOptions.merge(),
            )
        }
        batch.commit().addOnFailureListener { Log.w(TAG, "restoreMany failed", it) }
    }

    // set/merge (not update) so a missing doc doesn't abort the batch.
    private fun tombstone(): Map<String, Any> = mapOf(
        "deleted" to true,
        "modifiedAt" to System.currentTimeMillis(),
        "serverModifiedAt" to FieldValue.serverTimestamp(),
    )

    override suspend fun deleteEmptyTodosExcept(exceptId: String) {
        val snap = collection.whereEqualTo("text", "").get().await()
        // A tombstone keeps its text, so an empty one would be reaped here too.
        val toDelete = snap.documents.filter {
            it.id != exceptId && it.getBoolean("deleted") != true
        }
        if (toDelete.isEmpty()) return
        val batch = firestore.batch()
        for (doc in toDelete) batch.delete(doc.reference)
        batch.commit().addOnFailureListener {
            Log.w(TAG, "deleteEmptyTodosExcept failed", it)
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
        private const val BASE_RETRY_DELAY_MS = 1_000L
        private const val MAX_RETRY_DELAY_MS = 30_000L
        private const val RETRY_SHIFT_CAP = 5
    }
}
