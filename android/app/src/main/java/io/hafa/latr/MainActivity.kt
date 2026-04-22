package io.hafa.latr

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import io.hafa.latr.ui.TodoScreen
import io.hafa.latr.ui.TodoViewModel
import io.hafa.latr.ui.TodoViewModelFactory
import io.hafa.latr.ui.theme.LatrTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LatrTheme {
                val app = application as LatrApplication
                val viewModel: TodoViewModel = viewModel(
                    factory = TodoViewModelFactory(app.storeHolder, app.userPreferences)
                )
                TodoScreen(
                    viewModel = viewModel,
                    authManager = app.authManager,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}
