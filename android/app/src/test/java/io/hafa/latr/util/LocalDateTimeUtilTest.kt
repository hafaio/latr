package io.hafa.latr.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class LocalDateTimeUtilTest {

    private val utc = ZoneId.of("UTC")

    @Test
    fun `epoch to ISO to epoch roundtrips at whole-second precision`() {
        // 2026-04-24T12:34:56Z
        val epoch = LocalDateTime.of(2026, 4, 24, 12, 34, 56)
            .atZone(utc).toInstant().toEpochMilli()
        val iso = LocalDateTimeUtil.fromEpochMillis(epoch, utc)
        assertEquals(epoch, LocalDateTimeUtil.toEpochMillis(iso, utc))
    }

    @Test
    fun `fromEpochMillis emits the expected ISO-local string`() {
        val epoch = LocalDateTime.of(2026, 4, 24, 9, 0, 0)
            .atZone(utc).toInstant().toEpochMilli()
        assertEquals("2026-04-24T09:00", LocalDateTimeUtil.fromEpochMillis(epoch, utc))
    }

    @Test
    fun `toEpochMillis parses the ISO-local string produced by fromEpochMillis`() {
        val iso = "2026-04-24T09:30:15"
        val epoch = LocalDateTimeUtil.toEpochMillis(iso, utc)
        // Reformatting should yield an equivalent ISO (second precision).
        assertEquals(
            epoch,
            LocalDateTimeUtil.toEpochMillis(
                LocalDateTimeUtil.fromEpochMillis(epoch, utc),
                utc,
            ),
        )
    }

    @Test
    fun `now returns a parseable ISO-local string`() {
        val nowIso = LocalDateTimeUtil.now()
        // Should not throw; LocalDateTime.parse is strict about the format.
        LocalDateTime.parse(nowIso)
    }
}
