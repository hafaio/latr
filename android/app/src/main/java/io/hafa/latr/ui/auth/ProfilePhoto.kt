package io.hafa.latr.ui.auth

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal in-memory cache keyed by URL so we don't re-download on every
 * composition. Profile photos are small and rare — no eviction needed.
 */
private val photoCache = mutableMapOf<String, ImageBitmap>()

@Composable
fun ProfilePhoto(
    url: String?,
    size: Dp,
    modifier: Modifier = Modifier
) {
    var bitmap by remember(url) { mutableStateOf(url?.let { photoCache[it] }) }

    LaunchedEffect(url) {
        if (url == null || bitmap != null) return@LaunchedEffect
        val loaded = withContext(Dispatchers.IO) {
            runCatching {
                (URL(url).openConnection() as HttpURLConnection).run {
                    doInput = true
                    connect()
                    inputStream.use { BitmapFactory.decodeStream(it)?.asImageBitmap() }
                }
            }.getOrNull()
        }
        if (loaded != null) {
            photoCache[url] = loaded
            bitmap = loaded
        }
    }

    val shaped = modifier.size(size).clip(CircleShape)
    val current = bitmap
    if (current != null) {
        Image(
            bitmap = current,
            contentDescription = null,
            modifier = shaped,
            contentScale = ContentScale.Crop
        )
    } else {
        Icon(
            imageVector = Icons.Default.Person,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = shaped
        )
    }
}
