package io.hafa.latr.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TodoDao {
    @Query("SELECT * FROM todos ORDER BY createdAt DESC")
    fun getAllTodos(): Flow<List<Todo>>

    @Query("SELECT * FROM todos")
    suspend fun getAllSnapshot(): List<Todo>

    @Insert
    suspend fun insert(todo: Todo)

    @Update
    suspend fun update(todo: Todo)

    @Delete
    suspend fun delete(todo: Todo)

    @Query("DELETE FROM todos WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM todos WHERE state = 'SNOOZED' AND snoozeUntil < :now")
    suspend fun getExpiredSnoozed(now: String): List<Todo>

    @Query("SELECT * FROM todos WHERE text = '' AND id != :exceptId")
    suspend fun getEmptyTodosExcept(exceptId: String): List<Todo>

    @Query("SELECT * FROM todos WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): Todo?

    @Query("SELECT * FROM todos WHERE state = 'DONE'")
    suspend fun getDoneTodos(): List<Todo>

    @Query("DELETE FROM todos WHERE state = 'DONE'")
    suspend fun deleteAllDone()

    @Query("DELETE FROM todos WHERE text = '' AND id != :exceptId")
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
