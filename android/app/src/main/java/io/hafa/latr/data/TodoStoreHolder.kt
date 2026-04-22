package io.hafa.latr.data

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import io.hafa.latr.ui.auth.AuthManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Owns the single live [TodoStore] and swaps it at the auth boundary.
 *
 * The auth listener only swaps stores — it does not merge or snapshot.
 * Merging (Room → Firestore) and snapshotting (Firestore → Room) happen
 * exclusively on the explicit user-initiated entry points [signIn],
 * [signOut], and [deleteAccount]. A plain app-launch-while-signed-in does
 * no merge: Firestore is already the source of truth, its persistent local
 * cache fires the first listener tick near-instantly.
 */
class TodoStoreHolder(
    private val dao: TodoDao,
    private val authManager: AuthManager?,
    private val scope: CoroutineScope,
) {
    private val roomStore = RoomTodoStore(dao)
    private val firestore: FirebaseFirestore? = try {
        FirebaseFirestore.getInstance()
    } catch (_: Exception) {
        null
    }

    private val _store = MutableStateFlow<TodoStore>(roomStore)
    val store: StateFlow<TodoStore> = _store

    private var currentFirestoreStore: FirestoreTodoStore? = null

    init {
        if (authManager != null && firestore != null) {
            scope.launch {
                var prevUid: String? = null
                authManager.currentUser.collect { user ->
                    val newUid = user?.uid
                    if (newUid != prevUid) {
                        if (newUid != null) swapToFirestore(newUid)
                        else swapToRoom()
                    }
                    prevUid = newUid
                }
            }
        }
    }

    private fun swapToFirestore(uid: String) {
        val fs = firestore ?: return
        val store = FirestoreTodoStore(fs, uid)
        currentFirestoreStore = store
        _store.value = store
    }

    private fun swapToRoom() {
        currentFirestoreStore = null
        _store.value = roomStore
    }

    /**
     * User-initiated sign-in: push any offline Room edits into Firestore
     * (respecting legacy tombstones from older clients), then let the auth
     * state change swap the live store. If auth is already signed in the
     * merge runs against the current user.
     */
    suspend fun signIn() {
        val am = authManager ?: return
        val result = am.signInWithGoogle()
        val user = result.getOrNull() ?: return
        try {
            mergeRoomIntoFirestore(user.uid)
        } catch (e: Exception) {
            Log.e(TAG, "sign-in merge failed", e)
        }
    }

    /**
     * User-initiated sign-out: preserves the current signed-in todos locally
     * by copying them into Room before revoking auth.
     */
    suspend fun signOut() {
        snapshotFirestoreIntoRoom()
        authManager?.signOut()
    }

    /**
     * User-initiated delete-account: copies current state into Room (so local
     * todos are preserved), wipes the remote collection, then deletes the
     * Firebase auth user (which triggers sign-out).
     */
    suspend fun deleteAccount() {
        snapshotFirestoreIntoRoom()
        currentFirestoreStore?.deleteAll()
        authManager?.deleteCurrentUser()
    }

    /**
     * Copy the current Firestore state into Room. Call while still signed in
     * — after sign-out the read would be rejected by security rules.
     */
    private suspend fun snapshotFirestoreIntoRoom() {
        val leaving = currentFirestoreStore ?: return
        try {
            val remote = leaving.snapshot()
            dao.replaceAll(remote)
        } catch (e: Exception) {
            Log.e(TAG, "snapshot-to-room failed", e)
        }
    }

    /**
     * Merge Room's current state into Firestore. Local edits made while
     * signed out are published; remote tombstones from legacy clients
     * (deleted=true docs) take precedence so we don't resurrect them.
     */
    private suspend fun mergeRoomIntoFirestore(uid: String) {
        val fs = firestore ?: return
        val collection = fs.collection("users").document(uid).collection("todos")
        val local = dao.getAllSnapshot()
        val remoteSnap = collection.get().await()
        val remoteById = HashMap<String, Todo>(remoteSnap.size())
        for (doc in remoteSnap.documents) {
            remoteById[doc.id] = Todo.fromMap(doc.id, doc.data ?: emptyMap())
        }
        val toPush = mutableListOf<Todo>()
        val toDropLocalIds = mutableListOf<String>()
        for (l in local) {
            val remote = remoteById[l.id]
            if (remote == null) {
                toPush.add(l)
                continue
            }
            if (remote.deleted) {
                toDropLocalIds.add(l.id)
                continue
            }
            if (l.modifiedAt > remote.modifiedAt) toPush.add(l)
        }
        for (id in toDropLocalIds) dao.deleteById(id)
        if (toPush.isNotEmpty()) {
            val batch = fs.batch()
            for (t in toPush) {
                batch.set(collection.document(t.id), t.toMap(), SetOptions.merge())
            }
            batch.commit().await()
        }
        Log.d(TAG, "Sign-in merge: pushed=${toPush.size} dropped=${toDropLocalIds.size}")
    }

    companion object {
        private const val TAG = "TodoStoreHolder"
    }
}
