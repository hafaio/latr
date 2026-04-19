package io.hafa.latr.data

import android.content.Context
import androidx.core.content.edit

class UserPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)

    var morningMinutes: Int
        get() = prefs.getInt("morning_minutes", 480)
        set(value) { prefs.edit { putInt("morning_minutes", value) } }

    var eveningMinutes: Int
        get() = prefs.getInt("evening_minutes", 1200)
        set(value) { prefs.edit { putInt("evening_minutes", value) } }
}
