package io.hafa.latr.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TodoDao {
    @Query("SELECT * FROM todos WHERE deleted = 0 ORDER BY createdAt DESC")
    fun getAllTodos(): Flow<List<Todo>>

    @Query("SELECT * FROM todos WHERE deleted = 0")
    suspend fun getLiveSnapshot(): List<Todo>

    /** Includes tombstones — only the sign-in merge wants those. */
    @Query("SELECT * FROM todos")
    suspend fun getAllSnapshot(): List<Todo>

    @Query("DELETE FROM todos WHERE deleted != 0")
    suspend fun purgeTombstones()

    @Insert
    suspend fun insert(todo: Todo)

    /** Restore has to overwrite the row's tombstone, not insert beside it. */
    @Upsert
    suspend fun upsert(todo: Todo)

    @Update
    suspend fun update(todo: Todo)

    @Delete
    suspend fun delete(todo: Todo)

    @Query("DELETE FROM todos WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM todos WHERE text = '' AND deleted = 0 AND id != :exceptId")
    suspend fun getEmptyTodosExcept(exceptId: String): List<Todo>

    @Query("SELECT * FROM todos WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): Todo?

    // deleted = 0: a tombstone keeps its text, so an empty one would be reaped here too.
    @Query("DELETE FROM todos WHERE text = '' AND deleted = 0 AND id != :exceptId")
    suspend fun deleteEmptyTodosExcept(exceptId: String)

    @Insert
    suspend fun insertAll(todos: List<Todo>)

    @Query("DELETE FROM todos")
    suspend fun deleteAll()

    @Transaction
    suspend fun replaceAll(todos: List<Todo>) {
        deleteAll()
        insertAll(todos)
    }
}
