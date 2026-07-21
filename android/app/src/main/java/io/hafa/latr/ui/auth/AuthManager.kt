package io.hafa.latr.ui.auth

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.tasks.await

class AuthManager(
    private val context: Context,
    scope: CoroutineScope,
    private val serverClientId: String
) {
    private val auth = FirebaseAuth.getInstance()
    private val credentialManager = CredentialManager.create(context)

    val currentUser: StateFlow<FirebaseUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }.stateIn(scope, SharingStarted.Eagerly, auth.currentUser)

    private suspend fun getGoogleCredential(): AuthCredential {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        val result = credentialManager.getCredential(context, request)
        val googleIdToken = GoogleIdTokenCredential.createFrom(result.credential.data)
        return GoogleAuthProvider.getCredential(googleIdToken.idToken, null)
    }

    suspend fun signInWithGoogle(): Result<FirebaseUser> = runCatching {
        auth.signInWithCredential(getGoogleCredential()).await().user!!
    }.onFailure { Log.e(TAG, "Google sign-in failed", it) }

    suspend fun reauthenticateWithGoogle(): Result<Unit> = runCatching {
        val user = auth.currentUser ?: error("no signed-in user to reauthenticate")
        user.reauthenticate(getGoogleCredential()).await()
        Unit
    }.onFailure { Log.e(TAG, "Reauthentication failed", it) }

    fun signOut() {
        auth.signOut()
    }

    /** Delete the current Firebase Auth user (also triggers sign-out). Clean up remote data BEFORE calling. */
    suspend fun deleteCurrentUser(): Result<Unit> = runCatching {
        auth.currentUser?.delete()?.await()
        Unit
    }.onFailure { Log.e(TAG, "Delete user failed", it) }

    companion object {
        private const val TAG = "AuthManager"
    }
}
