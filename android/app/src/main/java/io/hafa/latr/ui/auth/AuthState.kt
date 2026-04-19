package io.hafa.latr.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember

sealed interface AuthState {
    data object SignedOut : AuthState
    data class SignedIn(
        val displayName: String?,
        val email: String?,
        val photoUrl: String?,
    ) : AuthState
}

val AuthState.isSignedIn: Boolean
    get() = this is AuthState.SignedIn

val AuthState.photoUrl: String?
    get() = (this as? AuthState.SignedIn)?.photoUrl

@Composable
fun rememberAuthState(authManager: AuthManager?): AuthState {
    if (authManager == null) return remember { AuthState.SignedOut }
    val user by authManager.currentUser.collectAsState()
    val current = user
    return if (current != null) {
        AuthState.SignedIn(
            displayName = current.displayName,
            email = current.email,
            photoUrl = current.photoUrl?.toString(),
        )
    } else {
        AuthState.SignedOut
    }
}
