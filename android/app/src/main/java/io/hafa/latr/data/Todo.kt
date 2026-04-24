package io.hafa.latr.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.FieldValue
import java.util.UUID

enum class TodoState { ACTIVE, DONE, SNOOZED }

@Entity(tableName = "todos")
data class Todo(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val text: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val modifiedAt: Long = System.currentTimeMillis(),
    val serverModifiedAt: Long = 0,
    val state: TodoState = TodoState.ACTIVE,
    val snoozeUntil: String? = null,
    val pinned: Boolean = false,
    val deleted: Boolean = false,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "text" to text,
        "createdAt" to createdAt,
        "modifiedAt" to modifiedAt,
        "serverModifiedAt" to FieldValue.serverTimestamp(),
        "state" to state.name,
        "snoozeUntil" to snoozeUntil,
        "pinned" to pinned,
        "deleted" to deleted,
    )

    companion object {
        fun fromMap(id: String, data: Map<String, Any?>): Todo {
            val modifiedAt = data["modifiedAt"] as? Long ?: System.currentTimeMillis()
            val serverTs = data["serverModifiedAt"]
            val serverModifiedAt = when (serverTs) {
                is com.google.firebase.Timestamp -> serverTs.toDate().time
                is Long -> serverTs
                else -> modifiedAt
            }
            return Todo(
                id = id,
                text = data["text"] as? String ?: "",
                createdAt = data["createdAt"] as? Long ?: System.currentTimeMillis(),
                modifiedAt = modifiedAt,
                serverModifiedAt = serverModifiedAt,
                state = (data["state"] as? String)
                    ?.let { name -> TodoState.entries.firstOrNull { it.name == name } }
                    ?: TodoState.ACTIVE,
                snoozeUntil = data["snoozeUntil"] as? String,
                pinned = data["pinned"] as? Boolean ?: false,
                deleted = data["deleted"] as? Boolean ?: false,
            )
        }
    }
}
