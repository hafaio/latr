package io.hafa.latr.ui.auth

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
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

    suspend fun signInWithGoogle(): Result<FirebaseUser> = runCatching {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        val result = credentialManager.getCredential(context, request)
        val googleIdToken = GoogleIdTokenCredential.createFrom(result.credential.data)
        val firebaseCredential = GoogleAuthProvider.getCredential(googleIdToken.idToken, null)
        auth.signInWithCredential(firebaseCredential).await().user!!
    }.onFailure { Log.e(TAG, "Google sign-in failed", it) }

    fun signOut() {
        auth.signOut()
    }

    /**
     * Delete the currently signed-in Firebase Auth user. This also triggers a
     * sign-out via the auth state listener. The caller is responsible for
     * cleaning up any remote data (Firestore, etc.) BEFORE calling this — once
     * the user is deleted, Firestore writes will be rejected.
     */
    suspend fun deleteCurrentUser(): Result<Unit> = runCatching {
        auth.currentUser?.delete()?.await()
        Unit
    }.onFailure { Log.e(TAG, "Delete user failed", it) }

    companion object {
        private const val TAG = "AuthManager"
    }
}
