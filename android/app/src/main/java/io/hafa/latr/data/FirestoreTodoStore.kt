package io.hafa.latr.data

import android.util.Log
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.SetOptions
import io.hafa.latr.util.LocalDateTimeUtil
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.retryWhen
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
            // A delivered error terminates this listener; propagate so retryWhen
            // re-collects and registers a fresh one.
            if (err != null) close(err)
            else if (snap != null) {
                trySend(
                    snap.documents.mapNotNull { doc ->
                        val todo = Todo.fromMap(doc.id, doc.data ?: emptyMap())
                        if (todo.deleted) null else todo
                    }
                )
            }
        }
        awaitClose { reg.remove() }
    }.retryWhen { cause, attempt ->
        val backoff = minOf(
            MAX_RETRY_DELAY_MS,
            BASE_RETRY_DELAY_MS shl attempt.toInt().coerceAtMost(RETRY_SHIFT_CAP),
        )
        Log.w(TAG, "snapshot listener error; retrying in ${backoff}ms", cause)
        delay(backoff)
        true
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

    override suspend fun unsnooze(todo: Todo) {
        // Minimal payload + update (vs set/merge): a stale unsnooze can't ride
        // any other fields along on an equal-basis race, and can't resurrect
        // a doc deleted on another device (the create rule wouldn't check the
        // basis monotonicity).
        val snoozeMillis = todo.snoozeUntil?.let { LocalDateTimeUtil.toEpochMillis(it) }
            ?: System.currentTimeMillis()
        val payload = mapOf<String, Any>(
            "state" to TodoState.ACTIVE.name,
            "modifiedAt" to snoozeMillis,
            "serverModifiedAt" to (todo.serverModifiedAt ?: FieldValue.serverTimestamp()),
        )
        try {
            collection.document(todo.id).update(payload).await()
        } catch (e: FirebaseFirestoreException) {
            // PERMISSION_DENIED: concurrent edit advanced the basis.
            // NOT_FOUND: doc was deleted on another device since our snapshot.
            // Both are expected; the listener will deliver the truth.
            if (
                e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED ||
                e.code == FirebaseFirestoreException.Code.NOT_FOUND
            ) return
            else throw e
        }
    }

    override suspend fun delete(todo: Todo) {
        collection.document(todo.id).delete()
            .addOnFailureListener { Log.w(TAG, "delete failed", it) }
    }

    override suspend fun clearAllDone(done: List<Todo>) {
        if (done.isEmpty()) return
        val batch = firestore.batch()
        for (t in done) batch.delete(collection.document(t.id))
        batch.commit().addOnFailureListener { Log.w(TAG, "clearAllDone failed", it) }
    }

    override suspend fun restoreMany(todos: List<Todo>) {
        if (todos.isEmpty()) return
        val batch = firestore.batch()
        for (t in todos) {
            batch.set(collection.document(t.id), t.toMap(), SetOptions.merge())
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
        private const val BASE_RETRY_DELAY_MS = 1_000L
        private const val MAX_RETRY_DELAY_MS = 30_000L
        private const val RETRY_SHIFT_CAP = 5
    }
}
