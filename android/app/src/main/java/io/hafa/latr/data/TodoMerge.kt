package io.hafa.latr.data

/** What the sign-in merge writes: rows to push up, and local rows to drop. */
data class MergePlan(
    val toPush: List<Todo>,
    val toDropLocalIds: List<String>,
)

/** Plan the sign-in merge: push local rows newer than remote; remote tombstones kill local. [remote] must be unfiltered. */
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
