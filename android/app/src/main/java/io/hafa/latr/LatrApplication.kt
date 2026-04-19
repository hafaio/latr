package io.hafa.latr

import android.app.Application
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import io.hafa.latr.data.FirestoreSync
import io.hafa.latr.data.TodoDatabase
import io.hafa.latr.data.TodoRepository
import io.hafa.latr.data.UserPreferences
import io.hafa.latr.ui.auth.AuthManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class LatrApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob())

    val database: TodoDatabase by lazy { TodoDatabase.getDatabase(this) }
    val todoDao by lazy { database.todoDao() }
    val userPreferences by lazy { UserPreferences(this) }

    val authManager: AuthManager? by lazy {
        val clientId = getFirebaseWebClientId()
        if (clientId == null) {
            Log.w(TAG, "default_web_client_id not found; auth disabled")
            return@lazy null
        }
        AuthManager(this, applicationScope, clientId)
    }

    val repository: TodoRepository by lazy {
        val sync = try {
            FirestoreSync(FirebaseAuth.getInstance(), applicationScope)
        } catch (_: Exception) {
            null
        }
        TodoRepository(todoDao, sync)
    }

    override fun onCreate() {
        super.onCreate()
        val am = authManager ?: return
        val repo = repository
        applicationScope.launch {
            am.currentUser.collect { user ->
                if (user != null) {
                    Log.d(TAG, "Auth state: signed in as ${user.uid}")
                    repo.onSignedIn()
                } else {
                    Log.d(TAG, "Auth state: signed out")
                    repo.onSignedOut()
                }
            }
        }
    }

    private fun getFirebaseWebClientId(): String? = try {
        val id = resources.getIdentifier("default_web_client_id", "string", packageName)
        if (id != 0) getString(id) else null
    } catch (_: Exception) {
        null
    }

    companion object {
        private const val TAG = "LatrApplication"
    }
}
