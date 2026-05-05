package io.hafa.latr.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.DockedSearchBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import io.hafa.latr.data.Todo
import io.hafa.latr.data.TodoState
import io.hafa.latr.ui.auth.AccountBottomSheet
import io.hafa.latr.ui.auth.AuthManager
import io.hafa.latr.ui.auth.AuthState
import io.hafa.latr.ui.auth.ProfilePhoto
import io.hafa.latr.ui.auth.SignInBottomSheet
import io.hafa.latr.ui.auth.isSignedIn
import io.hafa.latr.ui.auth.photoUrl
import io.hafa.latr.ui.auth.rememberAuthState
import io.hafa.latr.ui.theme.LatrTheme
import io.hafa.latr.util.LocalDateTimeUtil
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private fun StatusFilter.displayName(): String =
    name.lowercase().replaceFirstChar { it.uppercase() }

private fun StatusFilter.icon(): ImageVector = when (this) {
    StatusFilter.ALL -> Icons.AutoMirrored.Filled.List
    StatusFilter.ACTIVE -> Icons.Default.RadioButtonUnchecked
    StatusFilter.SNOOZED -> Icons.Default.Notifications
    StatusFilter.DONE -> Icons.Filled.CheckCircle
}

@Composable
private fun StatusFilter.iconTint() = when (this) {
    StatusFilter.ALL, StatusFilter.ACTIVE -> MaterialTheme.colorScheme.onSurfaceVariant
    StatusFilter.SNOOZED -> MaterialTheme.colorScheme.tertiary
    StatusFilter.DONE -> MaterialTheme.colorScheme.primary
}

/**
 * Horizontal-drag handler that flips the active filter by paging
 * [pagerState]. Each invocation gets its own remembered drag-start page so
 * multiple call sites (bottom bar, list area) don't share state.
 */
@Composable
private fun Modifier.filterSwipe(
    pagerState: PagerState,
    scope: CoroutineScope
): Modifier {
    var dragStartPage by remember { mutableIntStateOf(0) }
    return this.draggable(
        state = rememberDraggableState { delta ->
            scope.launch { pagerState.scrollBy(-delta * 1.5f) }
        },
        orientation = Orientation.Horizontal,
        onDragStarted = { dragStartPage = pagerState.currentPage },
        onDragStopped = { velocity ->
            val target = when {
                pagerState.currentPage > dragStartPage ->
                    (dragStartPage + 1).coerceAtMost(TAB_ORDER.size - 1)
                pagerState.currentPage < dragStartPage ->
                    (dragStartPage - 1).coerceAtLeast(0)
                velocity < -800f ->
                    (dragStartPage + 1).coerceAtMost(TAB_ORDER.size - 1)
                velocity > 800f ->
                    (dragStartPage - 1).coerceAtLeast(0)
                else -> dragStartPage
            }
            scope.launch { pagerState.animateScrollToPage(target) }
        }
    )
}

@Composable
fun FilterIconButton(
    selectedFilter: StatusFilter,
    onFilterSelected: (StatusFilter) -> Unit,
    isSignedIn: Boolean = false,
    profilePhotoUrl: String? = null,
    onSignInClick: () -> Unit = {},
    onAccountClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier.focusProperties { canFocus = false }) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(color = MaterialTheme.colorScheme.surfaceContainerHigh)
                .clickable { expanded = true },
            contentAlignment = Alignment.Center
        ) {
            Crossfade(targetState = selectedFilter, label = "filterIcon") { filter ->
                Icon(
                    imageVector = filter.icon(),
                    contentDescription = "Filter: ${filter.displayName()}",
                    tint = filter.iconTint()
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            if (isSignedIn) {
                DropdownMenuItem(
                    text = { Text("Account") },
                    leadingIcon = {
                        ProfilePhoto(url = profilePhotoUrl, size = 24.dp)
                    },
                    onClick = {
                        onAccountClick()
                        expanded = false
                    }
                )
            } else {
                DropdownMenuItem(
                    text = { Text("Sign in") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    onClick = {
                        onSignInClick()
                        expanded = false
                    }
                )
            }
            HorizontalDivider()
            TAB_ORDER.forEach { filter ->
                DropdownMenuItem(
                    text = { Text(filter.displayName()) },
                    leadingIcon = {
                        Icon(
                            imageVector = filter.icon(),
                            contentDescription = null,
                            tint = filter.iconTint()
                        )
                    },
                    onClick = {
                        onFilterSelected(filter)
                        expanded = false
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodoScreen(
    viewModel: TodoViewModel,
    authManager: AuthManager? = null,
    modifier: Modifier = Modifier
) {
    val todos by viewModel.todos.collectAsState()
    val focusId by viewModel.focusId.collectAsState()
    val fastCreationId by viewModel.fastCreationId.collectAsState()
    val lastCustomSnoozeTime by viewModel.lastCustomSnoozeTime.collectAsState()
    val morningMinutes by viewModel.morningMinutes.collectAsState()
    val eveningMinutes by viewModel.eveningMinutes.collectAsState()

    var showSnoozeSheet by remember { mutableStateOf(false) }
    var todoToSnooze by remember { mutableStateOf<Todo?>(null) }
    val authState = rememberAuthState(authManager)
    var showSignInSheet by remember { mutableStateOf(false) }
    var showAccountSheet by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    TodoScreenContent(
        todos = todos,
        focusId = focusId,
        fastCreationId = fastCreationId,
        onCreateTodo = { viewModel.createTodo() },
        onUpdateTodo = { todo, touch -> viewModel.updateTodo(todo, touch) },
        onDeleteTodo = { viewModel.deleteTodo(it) },
        onRefresh = { viewModel.unsnoozeExpired() },
        onTodoFocused = { todoId -> viewModel.setFocusId(todoId) },
        onTodoBlurred = { todoId -> viewModel.clearFocusId(todoId) },
        onClearFocus = { viewModel.clearFocus() },
        onRequestSnooze = { todo ->
            todoToSnooze = todo
            showSnoozeSheet = true
        },
        onClearAllDone = { viewModel.clearAllDone() },
        onUndoClearAllDone = { viewModel.undoClearAllDone() },
        isSignedIn = authState.isSignedIn,
        profilePhotoUrl = authState.photoUrl,
        onSignInClick = { showSignInSheet = true },
        onAccountClick = { showAccountSheet = true },
        modifier = modifier
    )

    if (showSnoozeSheet) {
        SnoozeBottomSheet(
            onDismiss = {
                showSnoozeSheet = false
                todoToSnooze = null
            },
            onSnoozeSelected = { isoDateTime ->
                todoToSnooze?.let { todo ->
                    viewModel.updateTodo(
                        todo.copy(
                            state = TodoState.SNOOZED,
                            snoozeUntil = isoDateTime
                        ),
                        touchModifiedAt = true
                    )
                }
            },
            onCustomTimeSelected = { isoDateTime ->
                viewModel.setLastCustomSnoozeTime(isoDateTime)
            },
            lastCustomSnoozeTime = lastCustomSnoozeTime,
            morningMinutes = morningMinutes,
            eveningMinutes = eveningMinutes,
            onSetPreferredTime = { minutes ->
                if (minutes < 720) {
                    viewModel.setMorningMinutes(minutes)
                } else {
                    viewModel.setEveningMinutes(minutes)
                }
            }
        )
    }

    if (showSignInSheet) {
        SignInBottomSheet(
            onSignIn = { viewModel.signIn() },
            onDismiss = { showSignInSheet = false }
        )
    }

    if (showAccountSheet) {
        val signedIn = authState as? AuthState.SignedIn
        if (signedIn != null) {
            AccountBottomSheet(
                authState = signedIn,
                onSignOut = { viewModel.signOut() },
                onDeleteAccount = { viewModel.deleteAccount() },
                onDismiss = { showAccountSheet = false }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TodoScreenContent(
    todos: List<Todo>,
    focusId: String? = null,
    fastCreationId: String? = null,
    onCreateTodo: () -> Unit,
    onUpdateTodo: (Todo, Boolean) -> Unit,
    onDeleteTodo: (Todo) -> Unit,
    onRefresh: () -> Unit,
    onTodoFocused: (String) -> Unit,
    onTodoBlurred: (String) -> Unit = {},
    onClearFocus: () -> Unit = {},
    onRequestSnooze: (Todo) -> Unit,
    onClearAllDone: (() -> Unit)? = null,
    onUndoClearAllDone: (() -> Unit)? = null,
    isSignedIn: Boolean = false,
    profilePhotoUrl: String? = null,
    onSignInClick: () -> Unit = {},
    onAccountClick: () -> Unit = {},
    modifier: Modifier = Modifier,
    initialStatusFilter: StatusFilter = StatusFilter.ACTIVE
) {
    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val hapticFeedback = LocalHapticFeedback.current
    val pullToRefreshState = rememberPullToRefreshState()
    var undoPending by remember { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var savedPage by rememberSaveable { mutableIntStateOf(TAB_ORDER.indexOf(initialStatusFilter)) }
    val pagerState = rememberPagerState(initialPage = savedPage) { TAB_ORDER.size }
    val statusFilter = TAB_ORDER[pagerState.settledPage]
    val listStates = TAB_ORDER.map { rememberLazyListState() }

    LaunchedEffect(pagerState.settledPage) {
        savedPage = pagerState.settledPage
    }

    val filteredTodosByFilter = remember(todos, searchQuery) {
        TAB_ORDER.associateWith { filter -> todos.filterAndSort(filter, searchQuery) }
    }
    val filteredTodos = filteredTodosByFilter[statusFilter] ?: emptyList()

    LaunchedEffect(Unit) {
        onRefresh()
    }

    // Clear focus when filter changes
    // Track previous filter to only clear on actual changes, not initial composition
    var previousFilter by remember { mutableStateOf<StatusFilter?>(null) }
    LaunchedEffect(statusFilter) {
        if (previousFilter != null) {
            focusManager.clearFocus()
            onClearFocus()
            undoPending = false
        }
        previousFilter = statusFilter
    }

    LaunchedEffect(undoPending) {
        if (undoPending) {
            delay(5_000)
            undoPending = false
        }
    }

    // Clear focus when app is backgrounded
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        focusManager.clearFocus()
        onClearFocus()
    }

    // Unsnooze expired items when app is resumed
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        onRefresh()
    }

    // Clear focus on back press
    BackHandler(enabled = focusId != null) {
        focusManager.clearFocus()
        onClearFocus()
    }

    // Clear focus when keyboard is dismissed (e.g. swipe down)
    val imeVisible = WindowInsets.isImeVisible
    LaunchedEffect(imeVisible) {
        if (!imeVisible && focusId != null) {
            focusManager.clearFocus()
            onClearFocus()
        }
    }

    // Use rememberUpdatedState so snapshotFlow reads current list, not a stale capture
    val currentFilteredTodos by rememberUpdatedState(filteredTodos)

    // Scroll to focused todo
    LaunchedEffect(focusId, pagerState.settledPage) {
        if (focusId != null) {
            val index = snapshotFlow {
                currentFilteredTodos.indexOfFirst { it.id == focusId }
            }.first { it >= 0 }
            val listState = listStates[pagerState.settledPage]
            val isVisible = listState.layoutInfo.visibleItemsInfo.any { it.index == index }
            if (!isVisible) {
                listState.scrollToItem(index)
            }
        }
    }

    LaunchedEffect(pullToRefreshState) {
        var wasAtThreshold = false
        snapshotFlow { pullToRefreshState.distanceFraction }
            .collect { fraction ->
                val isAtThreshold = fraction >= 1f
                if (isAtThreshold && !wasAtThreshold) {
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                }
                wasAtThreshold = isAtThreshold
            }
    }

    Scaffold(
        modifier = modifier.imePadding(),
        bottomBar = {
            Row(
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .filterSwipe(pagerState, scope),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterIconButton(
                    selectedFilter = statusFilter,
                    onFilterSelected = { filter ->
                        scope.launch { pagerState.animateScrollToPage(TAB_ORDER.indexOf(filter)) }
                    },
                    isSignedIn = isSignedIn,
                    profilePhotoUrl = profilePhotoUrl,
                    onSignInClick = onSignInClick,
                    onAccountClick = onAccountClick
                )

                DockedSearchBar(
                    inputField = {
                        SearchBarDefaults.InputField(
                            query = searchQuery,
                            onQueryChange = { searchQuery = it },
                            onSearch = { focusManager.clearFocus() },
                            expanded = false,
                            onExpandedChange = {},
                            placeholder = { Text("Search in Latr") },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                            trailingIcon = if (searchQuery.isNotEmpty()) {
                                {
                                    IconButton(onClick = { searchQuery = "" }) {
                                        Icon(
                                            Icons.Default.Clear,
                                            contentDescription = "Clear search"
                                        )
                                    }
                                }
                            } else null
                        )
                    },
                    expanded = false,
                    onExpandedChange = {},
                    modifier = Modifier.weight(1f)
                ) {}

                FilledTonalIconButton(
                    onClick = {
                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                        scope.launch { pagerState.animateScrollToPage(DEFAULT_TAB) }
                        undoPending = false
                        onCreateTodo()
                    },
                    modifier = Modifier.size(56.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add todo")
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = innerPadding.calculateBottomPadding())
                .statusBarsPadding()
                .filterSwipe(pagerState, scope)
        ) {
            HorizontalPager(
                state = pagerState,
                userScrollEnabled = false,
                modifier = Modifier.fillMaxSize()
            ) { pageIndex ->
                val pageFilter = TAB_ORDER[pageIndex]
                val pageTodos = filteredTodosByFilter[pageFilter] ?: emptyList()

                PullToRefreshBox(
                    state = pullToRefreshState,
                    isRefreshing = isRefreshing,
                    onRefresh = {
                        hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                        scope.launch {
                            isRefreshing = true
                            onRefresh()
                            delay(500)
                            isRefreshing = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            focusManager.clearFocus()
                        }
                ) {
                    if (pageTodos.isEmpty()) {
                        val message = if (searchQuery.isBlank()) {
                            "No todos yet. Tap + to add one."
                        } else {
                            "No todos match \"$searchQuery\""
                        }
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = message,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        LazyColumn(
                            state = listStates[pageIndex],
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(pageTodos, key = { it.id }) { todo ->
                                TodoItem(
                                    todo = todo,
                                    shouldRequestFocus = todo.id == focusId,
                                    isInFastComposeMode = fastCreationId != null && todo.id == focusId,
                                    onFocused = onTodoFocused,
                                    onBlurred = onTodoBlurred,
                                    onUpdate = { updatedTodo, touchModifiedAt ->
                                        if (updatedTodo.state != todo.state) {
                                            focusManager.clearFocus()
                                            onClearFocus()
                                        }
                                        onUpdateTodo(updatedTodo, touchModifiedAt)
                                    },
                                    onDelete = {
                                        focusManager.clearFocus()
                                        onClearFocus()
                                        onDeleteTodo(todo)
                                    },
                                    onSnooze = {
                                        focusManager.clearFocus()
                                        onClearFocus()
                                        onRequestSnooze(todo)
                                    },
                                    onCreateNewTodo = onCreateTodo,
                                    modifier = Modifier.animateItem()
                                )
                            }
                        }
                    }
                }
            }

            AnimatedVisibility(
                visible = statusFilter == StatusFilter.DONE && (filteredTodos.isNotEmpty() || undoPending),
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
                modifier = Modifier.align(Alignment.BottomCenter)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    AnimatedContent(targetState = undoPending, label = "clearAllDone") { isUndoPending ->
                        TextButton(
                            onClick = {
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                if (isUndoPending) {
                                    onUndoClearAllDone?.invoke()
                                    undoPending = false
                                } else {
                                    focusManager.clearFocus()
                                    onClearFocus()
                                    onClearAllDone?.invoke()
                                    undoPending = true
                                }
                            },
                            shape = RoundedCornerShape(50),
                            colors = ButtonDefaults.textButtonColors(
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                            )
                        ) {
                            Icon(
                                if (isUndoPending) Icons.Default.Refresh else Icons.Default.Delete,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = if (isUndoPending) "Undo" else "Clear all done",
                                modifier = Modifier.padding(start = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodoItem(
    todo: Todo,
    shouldRequestFocus: Boolean,
    isInFastComposeMode: Boolean = false,
    onFocused: (String) -> Unit,
    onBlurred: (String) -> Unit = {},
    onUpdate: (Todo, Boolean) -> Unit,
    onDelete: () -> Unit,
    onSnooze: () -> Unit,
    onCreateNewTodo: () -> Unit,
    modifier: Modifier = Modifier
) {
    var text by remember(todo.id) { mutableStateOf(todo.text) }
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val hapticFeedback = LocalHapticFeedback.current
    var hasFocused by remember { mutableStateOf(false) }
    var isFocused by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Picks up external text changes (e.g. remote edits) only while the field
    // isn't focused, so the user's in-flight typing is never clobbered.
    LaunchedEffect(todo.text, isFocused) {
        if (!isFocused && text != todo.text) text = todo.text
    }

    // Use rememberUpdatedState to avoid stale closures in the swipe callback
    val currentTodo by rememberUpdatedState(todo)
    val currentOnUpdate by rememberUpdatedState(onUpdate)
    val currentOnDelete by rememberUpdatedState(onDelete)
    val currentText by rememberUpdatedState(text)
    val currentOnSnooze by rememberUpdatedState(onSnooze)

    val dismissState = rememberSwipeToDismissBoxState(
        positionalThreshold = { totalDistance -> totalDistance * 0.4f },
    )

    LaunchedEffect(shouldRequestFocus) {
        if (shouldRequestFocus && !hasFocused) {
            focusRequester.requestFocus()
        }
    }

    SwipeToDismissBox(
        state = dismissState,
        modifier = modifier,
        onDismiss = { direction ->
            when (direction to currentTodo.state) {
                SwipeToDismissBoxValue.EndToStart to TodoState.DONE -> currentOnDelete()
                SwipeToDismissBoxValue.EndToStart to TodoState.SNOOZED,
                SwipeToDismissBoxValue.EndToStart to TodoState.ACTIVE ->
                    currentOnUpdate(currentTodo.copy(state = TodoState.DONE, snoozeUntil = null), true)

                SwipeToDismissBoxValue.StartToEnd to TodoState.DONE,
                SwipeToDismissBoxValue.StartToEnd to TodoState.SNOOZED ->
                    currentOnUpdate(currentTodo.copy(state = TodoState.ACTIVE, snoozeUntil = null), true)

                SwipeToDismissBoxValue.StartToEnd to TodoState.ACTIVE -> currentOnSnooze()
                else -> Unit
            }
            hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
            scope.launch { dismissState.snapTo(SwipeToDismissBoxValue.Settled) }
        },
        backgroundContent = {
            val direction = dismissState.dismissDirection
            val colorScheme = MaterialTheme.colorScheme
            val (backgroundColor, icon, iconTint) = when (direction to todo.state) {
                SwipeToDismissBoxValue.EndToStart to TodoState.DONE ->
                    Triple(colorScheme.error, Icons.Default.Delete, colorScheme.onError)

                SwipeToDismissBoxValue.EndToStart to TodoState.SNOOZED,
                SwipeToDismissBoxValue.EndToStart to TodoState.ACTIVE ->
                    Triple(colorScheme.primary, Icons.Default.Check, colorScheme.onPrimary)

                SwipeToDismissBoxValue.StartToEnd to TodoState.DONE,
                SwipeToDismissBoxValue.StartToEnd to TodoState.SNOOZED ->
                    Triple(colorScheme.secondary, Icons.Default.Refresh, colorScheme.onSecondary)

                SwipeToDismissBoxValue.StartToEnd to TodoState.ACTIVE ->
                    Triple(
                        colorScheme.tertiary,
                        Icons.Default.Notifications,
                        colorScheme.onTertiary
                    )

                else -> Triple(Color.Transparent, null, Color.Transparent)
            }
            val alignment = when (direction) {
                SwipeToDismissBoxValue.EndToStart -> Alignment.CenterEnd
                else -> Alignment.CenterStart
            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(backgroundColor)
                    .padding(horizontal = 16.dp),
                contentAlignment = alignment
            ) {
                icon?.let {
                    Icon(
                        it,
                        contentDescription = null,
                        tint = iconTint
                    )
                }
            }
        },
        enableDismissFromStartToEnd = true
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(horizontal = 16.dp, vertical = 16.dp)
        ) {
            val colorScheme = MaterialTheme.colorScheme
            val (stateIcon, stateIconTint) = when {
                todo.state == TodoState.DONE -> Icons.Filled.CheckCircle to colorScheme.primary
                todo.state == TodoState.SNOOZED -> Icons.Filled.Notifications to colorScheme.tertiary
                todo.snoozeUntil != null -> Icons.Outlined.Notifications to colorScheme.tertiary  // Was snoozed, now active
                else -> Icons.Default.RadioButtonUnchecked to colorScheme.onSurfaceVariant
            }
            Icon(
                imageVector = stateIcon,
                contentDescription = null,
                tint = stateIconTint,
                modifier = Modifier.padding(end = 12.dp)
            )
            Column(modifier = Modifier.fillMaxWidth()) {
                BasicTextField(
                    value = text,
                    onValueChange = { newValue ->
                        if (!newValue.contains('\n')) {
                            text = newValue
                            val edited = if (currentTodo.state == TodoState.ACTIVE) {
                                currentTodo.copy(text = newValue, snoozeUntil = null)
                            } else {
                                currentTodo.copy(text = newValue)
                            }
                            currentOnUpdate(edited, false)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                        .onFocusChanged { focusState ->
                            isFocused = focusState.isFocused
                            if (focusState.isFocused) {
                                hasFocused = true
                                onFocused(todo.id)
                            } else if (hasFocused) {
                                onBlurred(todo.id)
                                if (currentText.isEmpty()) {
                                    currentOnDelete()
                                }
                            }
                        },
                    textStyle = TextStyle(
                        fontSize = 16.sp,
                        color = if (todo.state == TodoState.DONE)
                            MaterialTheme.colorScheme.onSurfaceVariant
                        else
                            MaterialTheme.colorScheme.onSurface,
                        textDecoration = if (todo.state == TodoState.DONE) TextDecoration.LineThrough else TextDecoration.None
                    ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(
                        imeAction = if (isInFastComposeMode && text.isNotEmpty()) ImeAction.Next else ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = {
                            if (text.isNotEmpty()) {
                                onCreateNewTodo()
                            }
                        },
                        onDone = {
                            focusManager.clearFocus()
                        }
                    ),
                    decorationBox = { innerTextField ->
                        if (text.isEmpty()) {
                            Text(
                                text = "Enter todo...",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 16.sp
                            )
                        }
                        innerTextField()
                    }
                )
                if (todo.snoozeUntil != null) {
                    val millis = LocalDateTimeUtil.toEpochMillis(todo.snoozeUntil)
                    Text(
                        text = LocalDateTimeUtil.formatSnoozeTime(millis, context),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun TodoScreenEmptyPreview() {
    LatrTheme {
        TodoScreenContent(
            todos = emptyList(),
            onCreateTodo = {},
            onUpdateTodo = { _, _ -> },
            onDeleteTodo = {},
            onRefresh = {},
            onTodoFocused = {},
            onRequestSnooze = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun TodoScreenWithItemsPreview() {
    LatrTheme {
        TodoScreenContent(
            todos = listOf(
                Todo(id = "1", text = "Buy groceries"),
                Todo(id = "2", text = "Walk the dog", snoozeUntil = "2024-01-15T10:00:00"),
                Todo(id = "3", text = "Finish project report")
            ),
            onCreateTodo = {},
            onUpdateTodo = { _, _ -> },
            onDeleteTodo = {},
            onRefresh = {},
            onTodoFocused = {},
            onRequestSnooze = {}
        )
    }
}

@Preview(showBackground = true, name = "Filter - Active")
@Composable
private fun FilterIconButtonPreview_Active() {
    LatrTheme {
        FilterIconButton(
            selectedFilter = StatusFilter.ACTIVE,
            onFilterSelected = {}
        )
    }
}

@Preview(showBackground = true, name = "Filter - Snoozed")
@Composable
private fun FilterIconButtonPreview_Snoozed() {
    LatrTheme {
        FilterIconButton(
            selectedFilter = StatusFilter.SNOOZED,
            onFilterSelected = {}
        )
    }
}

@Preview(showBackground = true, name = "Filter - Done")
@Composable
private fun FilterIconButtonPreview_Done() {
    LatrTheme {
        FilterIconButton(
            selectedFilter = StatusFilter.DONE,
            onFilterSelected = {}
        )
    }
}

@Preview(showBackground = true, name = "Filter - All")
@Composable
private fun FilterIconButtonPreview_All() {
    LatrTheme {
        FilterIconButton(
            selectedFilter = StatusFilter.ALL,
            onFilterSelected = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun TodoItemPreview() {
    LatrTheme {
        TodoItem(
            todo = Todo(id = "1", text = "Sample todo item"),
            shouldRequestFocus = false,
            onFocused = {},
            onUpdate = { _, _ -> },
            onDelete = {},
            onSnooze = {},
            onCreateNewTodo = {}
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun TodoItemEmptyPreview() {
    LatrTheme {
        TodoItem(
            todo = Todo(id = "1", text = ""),
            shouldRequestFocus = false,
            onFocused = {},
            onBlurred = {},
            onUpdate = { _, _ -> },
            onDelete = {},
            onSnooze = {},
            onCreateNewTodo = {}
        )
    }
}

@Preview(showBackground = true, name = "Todo - Done")
@Composable
private fun TodoItemDonePreview() {
    LatrTheme {
        TodoItem(
            todo = Todo(id = "1", text = "Completed task", state = TodoState.DONE),
            shouldRequestFocus = false,
            onFocused = {},
            onUpdate = { _, _ -> },
            onDelete = {},
            onSnooze = {},
            onCreateNewTodo = {}
        )
    }
}

@Preview(showBackground = true, name = "Todo - Snoozed (within 24h)")
@Composable
private fun TodoItemSnoozedSoonPreview() {
    LatrTheme {
        TodoItem(
            todo = Todo(
                id = "1",
                text = "Snoozed task",
                state = TodoState.SNOOZED,
                snoozeUntil = LocalDateTimeUtil.fromEpochMillis(
                    System.currentTimeMillis() + 2 * 60 * 60 * 1000
                )
            ),
            shouldRequestFocus = false,
            onFocused = {},
            onUpdate = { _, _ -> },
            onDelete = {},
            onSnooze = {},
            onCreateNewTodo = {}
        )
    }
}

@Preview(showBackground = true, name = "Todo - Snoozed (beyond 24h)")
@Composable
private fun TodoItemSnoozedLaterPreview() {
    LatrTheme {
        TodoItem(
            todo = Todo(
                id = "1",
                text = "Snoozed for later",
                state = TodoState.SNOOZED,
                snoozeUntil = LocalDateTimeUtil.fromEpochMillis(
                    System.currentTimeMillis() + 3 * 24 * 60 * 60 * 1000
                )
            ),
            shouldRequestFocus = false,
            onFocused = {},
            onUpdate = { _, _ -> },
            onDelete = {},
            onSnooze = {},
            onCreateNewTodo = {}
        )
    }
}

@Preview(showBackground = true, name = "Todo - Was Snoozed (now active)")
@Composable
private fun TodoItemWasSnoozedPreview() {
    LatrTheme {
        TodoItem(
            todo = Todo(
                id = "1",
                text = "Unsnoozed task",
                state = TodoState.ACTIVE,
                snoozeUntil = LocalDateTimeUtil.fromEpochMillis(
                    System.currentTimeMillis() - 60 * 60 * 1000
                )
            ),
            shouldRequestFocus = false,
            onFocused = {},
            onUpdate = { _, _ -> },
            onDelete = {},
            onSnooze = {},
            onCreateNewTodo = {}
        )
    }
}

@Preview(showBackground = true, name = "Screen - Snoozed Filter")
@Composable
private fun TodoScreenSnoozedPreview() {
    LatrTheme {
        TodoScreenContent(
            todos = listOf(
                Todo(
                    id = "1", text = "Call mom", state = TodoState.SNOOZED,
                    snoozeUntil = "2024-01-20T09:00:00"
                ),
                Todo(
                    id = "2", text = "Review PR", state = TodoState.SNOOZED,
                    snoozeUntil = "2024-01-16T14:00:00"
                ),
            ),
            onCreateTodo = {},
            onUpdateTodo = { _, _ -> },
            onDeleteTodo = {},
            onRefresh = {},
            onTodoFocused = {},
            onRequestSnooze = {},
            initialStatusFilter = StatusFilter.SNOOZED
        )
    }
}

@Preview(showBackground = true, name = "Screen - Done Filter")
@Composable
private fun TodoScreenDonePreview() {
    LatrTheme {
        TodoScreenContent(
            todos = listOf(
                Todo(id = "1", text = "Buy groceries", state = TodoState.DONE),
                Todo(id = "2", text = "Send email", state = TodoState.DONE),
            ),
            onCreateTodo = {},
            onUpdateTodo = { _, _ -> },
            onDeleteTodo = {},
            onRefresh = {},
            onTodoFocused = {},
            onRequestSnooze = {},
            initialStatusFilter = StatusFilter.DONE
        )
    }
}

@Preview(showBackground = true, name = "Screen - Mixed (All Filter)")
@Composable
private fun TodoScreenAllPreview() {
    LatrTheme {
        TodoScreenContent(
            todos = listOf(
                Todo(id = "1", text = "Active task", state = TodoState.ACTIVE),
                Todo(
                    id = "2", text = "Snoozed task", state = TodoState.SNOOZED,
                    snoozeUntil = "2024-01-20T09:00:00"
                ),
                Todo(id = "3", text = "Done task", state = TodoState.DONE),
            ),
            onCreateTodo = {},
            onUpdateTodo = { _, _ -> },
            onDeleteTodo = {},
            onRefresh = {},
            onTodoFocused = {},
            onRequestSnooze = {},
            initialStatusFilter = StatusFilter.ALL
        )
    }
}
