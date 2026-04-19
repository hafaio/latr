package io.hafa.latr.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

class SnoozeTimeCalculatorTest {

    private val zone = ZoneId.of("America/New_York")
    private val morningMinutes = 480  // 8:00 AM
    private val eveningMinutes = 1200 // 8:00 PM

    private fun optionsAt(dayOfWeek: DayOfWeek, hour: Int): List<SnoozeOption> {
        // Find the next occurrence of the given day from a known Monday
        val baseDate = LocalDate.of(2026, 3, 30) // Monday
        val targetDate = if (dayOfWeek == DayOfWeek.MONDAY) baseDate
        else baseDate.with(TemporalAdjusters.next(dayOfWeek))
        val dateTime = LocalDateTime.of(targetDate, LocalTime.of(hour, 0))
        val instant = dateTime.atZone(zone).toInstant()
        return SnoozeTimeCalculator.getSnoozeOptions(
            now = instant,
            lastCustomTime = null,
            morningMinutes = morningMinutes,
            eveningMinutes = eveningMinutes,
            zone = zone
        )
    }

    private fun List<SnoozeOption>.hasType(type: Class<out SnoozeOption>): Boolean =
        any { type.isInstance(it) }

    private fun List<SnoozeOption>.labels(): List<String> = map { it.label }

    // --- Monday through Thursday: "This Saturday" + "Next Monday" ---

    @Test
    fun `Monday before morning shows ThisSaturday and NextMonday`() {
        val options = optionsAt(DayOfWeek.MONDAY, 6)
        assertTrue(options.hasType(SnoozeOption.ThisWeekend::class.java))
        assertTrue(options.hasType(SnoozeOption.NextWeek::class.java))
        assertTrue(!options.hasType(SnoozeOption.ThisMonday::class.java))
        assertTrue(!options.hasType(SnoozeOption.ThisSunday::class.java))
    }

    @Test
    fun `Wednesday after morning shows ThisSaturday and NextMonday`() {
        val options = optionsAt(DayOfWeek.WEDNESDAY, 14)
        assertTrue(options.hasType(SnoozeOption.ThisWeekend::class.java))
        assertTrue(options.hasType(SnoozeOption.NextWeek::class.java))
    }

    @Test
    fun `Thursday after evening shows ThisSaturday and NextMonday`() {
        val options = optionsAt(DayOfWeek.THURSDAY, 21)
        assertTrue(options.hasType(SnoozeOption.ThisWeekend::class.java))
        assertTrue(options.hasType(SnoozeOption.NextWeek::class.java))
    }

    // --- Friday: "This Saturday" before morning, "This Sunday" after morning ---

    @Test
    fun `Friday before morning shows ThisSaturday`() {
        val options = optionsAt(DayOfWeek.FRIDAY, 6)
        assertTrue(options.hasType(SnoozeOption.ThisWeekend::class.java))
        assertTrue(!options.hasType(SnoozeOption.ThisSunday::class.java))
    }

    @Test
    fun `Friday after morning shows ThisSunday instead of ThisSaturday`() {
        val options = optionsAt(DayOfWeek.FRIDAY, 14)
        assertTrue(options.hasType(SnoozeOption.ThisSunday::class.java))
        assertTrue(!options.hasType(SnoozeOption.ThisWeekend::class.java))
    }

    @Test
    fun `Friday after morning Tomorrow does not conflict with ThisSunday`() {
        val options = optionsAt(DayOfWeek.FRIDAY, 14)
        val tomorrow = options.filterIsInstance<SnoozeOption.Tomorrow>().single()
        val thisSunday = options.filterIsInstance<SnoozeOption.ThisSunday>().single()
        // Tomorrow should be Saturday, ThisSunday should be Sunday
        val tomorrowDate = Instant.ofEpochMilli(tomorrow.epochMillis)
            .atZone(zone).toLocalDate()
        val sundayDate = Instant.ofEpochMilli(thisSunday.epochMillis)
            .atZone(zone).toLocalDate()
        assertTrue(tomorrowDate.dayOfWeek == DayOfWeek.SATURDAY)
        assertTrue(sundayDate.dayOfWeek == DayOfWeek.SUNDAY)
        assertTrue(tomorrowDate != sundayDate)
    }

    // --- Saturday: "This Monday" + "Next Saturday", no "Next Monday" ---

    @Test
    fun `Saturday before morning shows ThisMonday and NextWeekend`() {
        val options = optionsAt(DayOfWeek.SATURDAY, 6)
        assertTrue(options.hasType(SnoozeOption.ThisMonday::class.java))
        assertTrue(options.hasType(SnoozeOption.NextWeekend::class.java))
        assertTrue(!options.hasType(SnoozeOption.NextWeek::class.java))
    }

    @Test
    fun `Saturday after morning shows ThisMonday and NextWeekend`() {
        val options = optionsAt(DayOfWeek.SATURDAY, 14)
        assertTrue(options.hasType(SnoozeOption.ThisMonday::class.java))
        assertTrue(options.hasType(SnoozeOption.NextWeekend::class.java))
        assertTrue(!options.hasType(SnoozeOption.NextWeek::class.java))
    }

    // --- Sunday: "This Monday" before morning, "This Tuesday" after morning ---

    @Test
    fun `Sunday before morning shows ThisMonday`() {
        val options = optionsAt(DayOfWeek.SUNDAY, 6)
        assertTrue(options.hasType(SnoozeOption.ThisMonday::class.java))
        assertTrue(!options.hasType(SnoozeOption.ThisTuesday::class.java))
    }

    @Test
    fun `Sunday after morning shows ThisTuesday instead of ThisMonday`() {
        val options = optionsAt(DayOfWeek.SUNDAY, 14)
        assertTrue(options.hasType(SnoozeOption.ThisTuesday::class.java))
        assertTrue(!options.hasType(SnoozeOption.ThisMonday::class.java))
    }

    @Test
    fun `Sunday after morning Tomorrow does not conflict with ThisTuesday`() {
        val options = optionsAt(DayOfWeek.SUNDAY, 14)
        val tomorrow = options.filterIsInstance<SnoozeOption.Tomorrow>().single()
        val thisTuesday = options.filterIsInstance<SnoozeOption.ThisTuesday>().single()
        val tomorrowDate = Instant.ofEpochMilli(tomorrow.epochMillis)
            .atZone(zone).toLocalDate()
        val tuesdayDate = Instant.ofEpochMilli(thisTuesday.epochMillis)
            .atZone(zone).toLocalDate()
        assertTrue(tomorrowDate.dayOfWeek == DayOfWeek.MONDAY)
        assertTrue(tuesdayDate.dayOfWeek == DayOfWeek.TUESDAY)
        assertTrue(tomorrowDate != tuesdayDate)
    }

    // --- Anti-redundancy invariant: Tomorrow and named-day options never target the same day ---

    @Test
    fun `Tomorrow never targets the same day as a named-day option`() {
        val namedDayTypes = setOf(
            SnoozeOption.ThisWeekend::class.java,
            SnoozeOption.ThisSunday::class.java,
            SnoozeOption.ThisMonday::class.java,
            SnoozeOption.ThisTuesday::class.java,
            SnoozeOption.NextWeek::class.java,
        )
        for (dow in DayOfWeek.entries) {
            for (hour in listOf(6, 10, 21)) { // before morning, midday, after evening
                val options = optionsAt(dow, hour)
                val tomorrow = options.filterIsInstance<SnoozeOption.Tomorrow>().firstOrNull()
                    ?: continue // Tomorrow not shown, no conflict possible
                val tomorrowDate = Instant.ofEpochMilli(tomorrow.epochMillis)
                    .atZone(zone).toLocalDate()
                val namedDayOptions = options.filter { namedDayTypes.any { type -> type.isInstance(it) } }
                for (namedDay in namedDayOptions) {
                    val namedDate = Instant.ofEpochMilli(namedDay.epochMillis)
                        .atZone(zone).toLocalDate()
                    assertTrue(
                        "On $dow at $hour:00, Tomorrow ($tomorrowDate) conflicts with ${namedDay.label} ($namedDate)",
                        tomorrowDate != namedDate
                    )
                }
            }
        }
    }

    // --- Unchanged behavior: time-of-day options ---

    @Test
    fun `InALittleWhile is always shown`() {
        for (dow in DayOfWeek.entries) {
            for (hour in listOf(6, 10, 21)) {
                assertTrue(optionsAt(dow, hour).hasType(SnoozeOption.InALittleWhile::class.java))
            }
        }
    }

    @Test
    fun `ThisMorning shown before morning only`() {
        assertTrue(optionsAt(DayOfWeek.MONDAY, 6).hasType(SnoozeOption.ThisMorning::class.java))
        assertTrue(!optionsAt(DayOfWeek.MONDAY, 10).hasType(SnoozeOption.ThisMorning::class.java))
    }

    @Test
    fun `Tomorrow shown after morning only`() {
        assertTrue(!optionsAt(DayOfWeek.MONDAY, 6).hasType(SnoozeOption.Tomorrow::class.java))
        assertTrue(optionsAt(DayOfWeek.MONDAY, 10).hasType(SnoozeOption.Tomorrow::class.java))
    }

    @Test
    fun `Custom is always shown`() {
        for (dow in DayOfWeek.entries) {
            assertTrue(optionsAt(dow, 10).hasType(SnoozeOption.Custom::class.java))
        }
    }

    // --- Weekend: no NextMonday ---

    @Test
    fun `weekends never show NextMonday`() {
        for (hour in listOf(6, 10, 21)) {
            assertTrue(!optionsAt(DayOfWeek.SATURDAY, hour).hasType(SnoozeOption.NextWeek::class.java))
            assertTrue(!optionsAt(DayOfWeek.SUNDAY, hour).hasType(SnoozeOption.NextWeek::class.java))
        }
    }

    @Test
    fun `weekdays always show NextMonday`() {
        for (dow in listOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY)) {
            assertTrue(optionsAt(dow, 10).hasType(SnoozeOption.NextWeek::class.java))
        }
    }
}
