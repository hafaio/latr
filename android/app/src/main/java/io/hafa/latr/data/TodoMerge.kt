package io.hafa.latr.data

/** What the sign-in merge writes: rows to push up, and local rows to drop. */
data class MergePlan(
    val toPush: List<Todo>,
    val toDropLocalIds: List<String>,
)

/**
 * Decide what the sign-in merge writes. A local row (or tombstone) newer than
 * its remote twin is pushed; a remote tombstone kills the local row.
 *
 * [remote] must be the *unfiltered* collection, tombstones included.
 */
fun planMerge(local: List<Todo>, remote: Map<String, Todo>): MergePlan {
    val toPush = mutableListOf<Todo>()
    val toDropLocalIds = mutableListOf<String>()
    for (l in local) {
        val r = remote[l.id]
        if (r == null) {
            // Never synced, so a tombstone has nothing to delete.
            if (!l.deleted) toPush.add(l)
        } else if (r.deleted) {
            toDropLocalIds.add(l.id)
        } else if (l.modifiedAt > r.modifiedAt) {
            toPush.add(l)
        }
    }
    return MergePlan(toPush, toDropLocalIds)
}
