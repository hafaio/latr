package io.hafa.latr.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import io.hafa.latr.data.Todo
import io.hafa.latr.data.TodoState
import io.hafa.latr.data.TodoStoreHolder
import io.hafa.latr.data.UserPreferences
import io.hafa.latr.util.LocalDateTimeUtil
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
    val todos: StateFlow<List<Todo>> = storeHolder.store
        .flatMapLatest { it.observeAll() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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

    private var _lastClearedDoneTodos: List<Todo> = emptyList()

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
        viewModelScope.launch {
            val store = currentStore()
            store.deleteEmptyTodosExcept("")
            val todo = Todo()
            store.insert(todo)
            _fastCreationId.value = todo.id
            _focusId.value = todo.id
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

    fun unsnoozeExpired() {
        viewModelScope.launch {
            val now = LocalDateTimeUtil.now()
            val store = currentStore()
            val expired = store.getExpiredSnoozed(now)
            for (todo in expired) {
                val snoozeMillis = todo.snoozeUntil?.let { LocalDateTimeUtil.toEpochMillis(it) }
                    ?: System.currentTimeMillis()
                store.update(todo.copy(state = TodoState.ACTIVE, modifiedAt = snoozeMillis))
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
        viewModelScope.launch {
            _lastClearedDoneTodos = currentStore().clearAllDone()
        }
    }

    fun signOut() {
        viewModelScope.launch { storeHolder.signOut() }
    }

    fun deleteAccount() {
        viewModelScope.launch { storeHolder.deleteAccount() }
    }

    fun undoClearAllDone() {
        val todosToRestore = _lastClearedDoneTodos
        if (todosToRestore.isNotEmpty()) {
            _lastClearedDoneTodos = emptyList()
            viewModelScope.launch {
                currentStore().restoreMany(todosToRestore)
            }
        }
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
