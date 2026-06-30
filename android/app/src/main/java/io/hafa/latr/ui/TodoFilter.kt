package io.hafa.latr.ui

import io.hafa.latr.data.Todo
import io.hafa.latr.data.TodoState
import io.hafa.latr.util.LocalDateTimeUtil

enum class StatusFilter { ACTIVE, SNOOZED, DONE, ALL }

val TAB_ORDER = listOf(
    StatusFilter.SNOOZED,
    StatusFilter.ACTIVE,
    StatusFilter.DONE,
    StatusFilter.ALL,
)
const val DEFAULT_TAB = 1 // ACTIVE

/**
 * Pure filter + sort + search over a todo list. Extracted from the Compose
 * layer so the logic can be unit-tested without instrumentation.
 *
 * Sort keys by filter:
 *  - ACTIVE:  pinned todos first, then descending by snoozeUntil (if set)
 *             else modifiedAt (so recently-unsnoozed items surface to the top).
 *  - SNOOZED: ascending by snoozeUntil (soonest first).
 *  - DONE / ALL: descending by modifiedAt.
 *
 * Pinning only floats items in the ACTIVE list; every other filter keeps its
 * own ordering (a time-ordered view shouldn't be reshuffled by a pin).
 *
 * When a non-blank searchQuery is supplied the result is re-ranked by the
 * number of word-boundary prefix matches across whitespace-split terms.
 */
fun List<Todo>.filterAndSort(
    filter: StatusFilter,
    searchQuery: String,
): List<Todo> =
    filter { todo ->
        when (filter) {
            StatusFilter.ALL -> true
            StatusFilter.ACTIVE -> todo.state == TodoState.ACTIVE
            StatusFilter.SNOOZED -> todo.state == TodoState.SNOOZED
            StatusFilter.DONE -> todo.state == TodoState.DONE
        }
    }
    .sortedWith(
        // Pinned floats to the top of ACTIVE only. The primary key is a
        // constant `false` for every other filter, so `sortedWith` (stable)
        // leaves their secondary ordering byte-for-byte unchanged.
        compareByDescending<Todo> { filter == StatusFilter.ACTIVE && it.pinned }
            .thenBy { todo ->
                when (filter) {
                    StatusFilter.ACTIVE -> -(
                        todo.snoozeUntil?.let { LocalDateTimeUtil.toEpochMillis(it) }
                            ?: todo.modifiedAt
                    )

                    StatusFilter.SNOOZED -> todo.snoozeUntil?.let {
                        LocalDateTimeUtil.toEpochMillis(it)
                    } ?: Long.MAX_VALUE

                    else -> -todo.modifiedAt
                }
            }
            // Secondary key for ACTIVE: among rows with the same primary key
            // (e.g. unsnoozed rows sharing an unsnooze time) the most recently
            // modified sorts first. Constant for other filters, so their order
            // is unchanged.
            .thenByDescending { todo ->
                if (filter == StatusFilter.ACTIVE) todo.modifiedAt else 0L
            }
    )
    .let { sorted ->
        if (searchQuery.isBlank()) {
            sorted
        } else {
            val searchPatterns =
                searchQuery.split("\\s+".toRegex())
                    .filter { it.isNotBlank() }
                    .map { "\\b${Regex.escape(it.lowercase())}".toRegex() }
            sorted
                .map { todo ->
                    val todoTextLower = todo.text.lowercase()
                    val matchCount = searchPatterns.count { pattern ->
                        pattern.containsMatchIn(todoTextLower)
                    }
                    todo to matchCount
                }
                .filter { (_, matchCount) -> matchCount > 0 }
                .sortedByDescending { (_, matchCount) -> matchCount }
                .map { (todo, _) -> todo }
        }
    }
