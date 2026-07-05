# Credential Manager discovers its Play Services provider via Class.forName
# (manifest metadata), which R8 can't see — without this keep, the provider is
# stripped/renamed and getCredential() fails at runtime, silently breaking
# Google sign-in in release builds. Rule is verbatim from the Credential
# Manager docs (developer.android.com/identity/sign-in/credential-manager).
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}

# Readable stack traces in release logcat (R8 still renames symbols; the
# generated mapping.txt deobfuscates fully).
-keepattributes SourceFile,LineNumberTable
