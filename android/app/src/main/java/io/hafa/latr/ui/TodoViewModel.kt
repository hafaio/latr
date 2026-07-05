package io.hafa.latr.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import io.hafa.latr.data.Todo
import io.hafa.latr.data.TodoState
import io.hafa.latr.data.TodoStoreHolder
import io.hafa.latr.data.UserPreferences
import io.hafa.latr.util.LocalDateTimeUtil
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class TodoViewModel(
    private val storeHolder: TodoStoreHolder,
    private val userPreferences: UserPreferences
) : ViewModel() {
    // `null` until the live store delivers its first snapshot. On a signed-in
    // cold start the store swaps to Firestore and its listener takes a beat to
    // fire even from the local cache; surfacing null lets the UI show a spinner
    // instead of a false "no todos" empty state during that window.
    val todos: StateFlow<List<Todo>?> = storeHolder.store
        .flatMapLatest { it.observeAll() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    private val _focusId = MutableStateFlow<String?>(null)
    val focusId: StateFlow<String?> = _focusId

    private val _fastCreationId = MutableStateFlow<String?>(null)
    val fastCreationId: StateFlow<String?> = _fastCreationId

    private val _lastCustomSnoozeTime = MutableStateFlow<String?>(null)
    val lastCustomSnoozeTime: StateFlow<String?> = _lastCustomSnoozeTime

    private val _morningMinutes = MutableStateFlow(userPreferences.morningMinutes)
    val morningMinutes: StateFlow<Int> = _morningMinutes

    private val _eveningMinutes = MutableStateFlow(userPreferences.eveningMinutes)
    val eveningMinutes: StateFlow<Int> = _eveningMinutes

    // A single, most-recent-wins undo buffer. Delete restores via re-insert
    // (the rows are gone); Snooze and Complete restore via update (the row still
    // exists, just needs its prior state/snoozeUntil/modifiedAt put back).
    private sealed interface UndoableAction {
        data class Delete(val todos: List<Todo>) : UndoableAction
        data class Snooze(val previous: Todo) : UndoableAction
        data class Complete(val previous: Todo) : UndoableAction
    }

    private var _lastAction: UndoableAction? = null

    // The VM owns both the undo buffer and its 5s lifetime, so delete and
    // snooze share one source of truth — the UI just renders `undoVisible` and
    // reports the events (swipe-delete, clear-all, snooze, filter change) that
    // arm or dismiss it. No per-action UI flag or timer.
    private val _undoVisible = MutableStateFlow(false)
    val undoVisible: StateFlow<Boolean> = _undoVisible

    private var undoExpiryJob: Job? = null

    private fun armUndo() {
        _undoVisible.value = true
        undoExpiryJob?.cancel()
        undoExpiryJob = viewModelScope.launch {
            delay(UNDO_TIMEOUT_MS)
            _undoVisible.value = false
            _lastAction = null
        }
    }

    /** Drops the undo buffer and hides the chip (filter change, new todo). */
    fun dismissUndo() {
        undoExpiryJob?.cancel()
        undoExpiryJob = null
        _undoVisible.value = false
        _lastAction = null
    }

    fun setLastCustomSnoozeTime(time: String) {
        _lastCustomSnoozeTime.value = time
    }

    fun setMorningMinutes(minutes: Int) {
        userPreferences.morningMinutes = minutes
        _morningMinutes.value = minutes
    }

    fun setEveningMinutes(minutes: Int) {
        userPreferences.eveningMinutes = minutes
        _eveningMinutes.value = minutes
    }

    init {
        unsnoozeExpired()
    }

    private fun currentStore() = storeHolder.store.value

    fun createTodo() {
        dismissUndo()
        // Insert + focus first so the new row appears immediately; the empty-
        // cleanup query (Firestore `.get().await()`) runs in the background.
        // Otherwise a cold-boot `get` can block focus by seconds while it
        // waits on auth/network.
        val todo = Todo()
        viewModelScope.launch {
            val store = currentStore()
            store.insert(todo)
            _fastCreationId.value = todo.id
            _focusId.value = todo.id
            store.deleteEmptyTodosExcept(todo.id)
        }
    }

    fun updateTodo(todo: Todo, touchModifiedAt: Boolean = true) {
        viewModelScope.launch {
            val updated = if (touchModifiedAt) {
                todo.copy(modifiedAt = System.currentTimeMillis())
            } else {
                todo
            }
            currentStore().update(updated)
        }
    }

    fun deleteTodo(todo: Todo) {
        viewModelScope.launch {
            currentStore().delete(todo)
        }
    }

    fun deleteTodoUndoable(todo: Todo) {
        _lastAction = UndoableAction.Delete(listOf(todo))
        armUndo()
        viewModelScope.launch {
            currentStore().delete(todo)
        }
    }

    fun completeUndoable(todo: Todo) {
        _lastAction = UndoableAction.Complete(todo)
        armUndo()
        updateTodo(
            todo.copy(state = TodoState.DONE, snoozeUntil = null),
            touchModifiedAt = true
        )
    }

    fun snoozeUndoable(todo: Todo, snoozeUntil: String) {
        // Buffer the pre-snooze snapshot so undo can restore its prior
        // state/snoozeUntil/modifiedAt (and thus its prior sort position).
        _lastAction = UndoableAction.Snooze(todo)
        armUndo()
        updateTodo(
            todo.copy(state = TodoState.SNOOZED, snoozeUntil = snoozeUntil),
            touchModifiedAt = true
        )
    }

    fun unsnoozeExpired() {
        viewModelScope.launch {
            val now = LocalDateTimeUtil.now()
            val store = currentStore()
            for (todo in store.getExpiredSnoozed(now)) {
                try {
                    store.unsnooze(todo)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "unsnooze failed for ${todo.id}; will retry", e)
                }
            }
        }
    }

    fun setFocusId(todoId: String) {
        _focusId.value = todoId
        if (_fastCreationId.value != null && _fastCreationId.value != todoId) {
            _fastCreationId.value = null
        }
        viewModelScope.launch {
            currentStore().deleteEmptyTodosExcept(todoId)
        }
    }

    fun clearFocusId(expectedId: String) {
        if (_focusId.value == expectedId) {
            _focusId.value = null
            _fastCreationId.value = null
        }
    }

    fun clearFocus() {
        _focusId.value = null
        _fastCreationId.value = null
        viewModelScope.launch {
            currentStore().deleteEmptyTodosExcept("")
        }
    }

    fun clearAllDone() {
        val doneTodos = todos.value?.filter { it.state == TodoState.DONE }.orEmpty()
        if (doneTodos.isEmpty()) return
        viewModelScope.launch {
            // Enqueue the delete before arming undo so an early Undo lands after it.
            currentStore().clearAllDone(doneTodos)
            _lastAction = UndoableAction.Delete(doneTodos)
            armUndo()
        }
    }

    fun signIn(onResult: (Result<Unit>) -> Unit = {}) {
        viewModelScope.launch { onResult(storeHolder.signIn()) }
    }

    fun signOut() {
        viewModelScope.launch { storeHolder.signOut() }
    }

    fun deleteAccount(onResult: (Result<Unit>) -> Unit = {}) {
        viewModelScope.launch { onResult(storeHolder.deleteAccount()) }
    }

    fun undoLastAction() {
        when (val action = _lastAction) {
            is UndoableAction.Delete ->
                if (action.todos.isNotEmpty()) {
                    viewModelScope.launch {
                        currentStore().restoreMany(action.todos)
                    }
                }
            is UndoableAction.Snooze ->
                // Re-apply the prior snapshot verbatim (no modifiedAt touch) so
                // the row lands back in its previous sort position.
                viewModelScope.launch {
                    currentStore().update(action.previous)
                }
            is UndoableAction.Complete ->
                viewModelScope.launch {
                    currentStore().update(action.previous)
                }
            null -> {}
        }
        dismissUndo()
    }

    companion object {
        private const val TAG = "TodoViewModel"
        private const val UNDO_TIMEOUT_MS = 5_000L
    }
}

class TodoViewModelFactory(
    private val storeHolder: TodoStoreHolder,
    private val userPreferences: UserPreferences
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TodoViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return TodoViewModel(storeHolder, userPreferences) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
