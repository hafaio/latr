package io.hafa.latr.util

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

sealed class SnoozeOption(val label: String, val epochMillis: Long) {
    class InALittleWhile(epochMillis: Long) : SnoozeOption("In a little while", epochMillis)
    class ThisMorning(epochMillis: Long) : SnoozeOption("This morning", epochMillis)
    class LaterToday(epochMillis: Long) : SnoozeOption("Later today", epochMillis)
    class Tomorrow(epochMillis: Long) : SnoozeOption("Tomorrow", epochMillis)
    class LaterTomorrow(epochMillis: Long) : SnoozeOption("Later tomorrow", epochMillis)
    class ThisWeekend(epochMillis: Long) : SnoozeOption("This Saturday", epochMillis)
    class ThisSunday(epochMillis: Long) : SnoozeOption("This Sunday", epochMillis)
    class ThisMonday(epochMillis: Long) : SnoozeOption("This Monday", epochMillis)
    class ThisTuesday(epochMillis: Long) : SnoozeOption("This Tuesday", epochMillis)
    class NextWeekend(epochMillis: Long) : SnoozeOption("Next Saturday", epochMillis)
    class NextWeek(epochMillis: Long) : SnoozeOption("Next Monday", epochMillis)
    class Last(epochMillis: Long) : SnoozeOption("Last", epochMillis)
    data object Custom : SnoozeOption("Custom", 0)
}

object SnoozeTimeCalculator {

    fun getSnoozeOptions(
        now: Instant,
        lastCustomTime: String?,
        morningMinutes: Int = 480,
        eveningMinutes: Int = 1200,
        zone: ZoneId = ZoneId.systemDefault()
    ): List<SnoozeOption> {
        val localNow = LocalDateTime.ofInstant(now, zone)
        val options = mutableListOf<SnoozeOption>()

        val morningHour = morningMinutes / 60
        val morningMinute = morningMinutes % 60
        val eveningHour = eveningMinutes / 60
        val eveningMinute = eveningMinutes % 60

        // "In a little while" - Always shown, 3 hours from now
        val inALittleWhile = localNow.plusHours(3)
        options.add(SnoozeOption.InALittleWhile(inALittleWhile.toEpochMillis(zone)))

        val currentHour = localNow.hour
        val dayOfWeek = localNow.dayOfWeek
        val isWeekend = dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY

        // "This morning" - before morning time only, target morning time same day
        if (currentHour < morningHour) {
            val thisMorning = localNow.withHour(morningHour).withMinute(morningMinute)
                .withSecond(0).withNano(0)
            options.add(SnoozeOption.ThisMorning(thisMorning.toEpochMillis(zone)))
        }

        // "Later today" - before evening time only, target evening time same day
        if (currentHour < eveningHour) {
            val laterToday = localNow.withHour(eveningHour).withMinute(eveningMinute)
                .withSecond(0).withNano(0)
            options.add(SnoozeOption.LaterToday(laterToday.toEpochMillis(zone)))
        }

        // "Tomorrow" - after morning time only, target morning time next day
        if (currentHour >= morningHour) {
            val tomorrow = localNow.plusDays(1).withHour(morningHour).withMinute(morningMinute)
                .withSecond(0).withNano(0)
            options.add(SnoozeOption.Tomorrow(tomorrow.toEpochMillis(zone)))
        }

        // "Later tomorrow" - after evening time only, target evening time next day
        if (currentHour >= eveningHour) {
            val laterTomorrow = localNow.plusDays(1).withHour(eveningHour).withMinute(eveningMinute)
                .withSecond(0).withNano(0)
            options.add(SnoozeOption.LaterTomorrow(laterTomorrow.toEpochMillis(zone)))
        }

        // Named-day option: context-dependent to avoid redundancy with "Tomorrow"
        val isFridayAfterMorning = dayOfWeek == DayOfWeek.FRIDAY && currentHour >= morningHour
        when {
            !isWeekend && !isFridayAfterMorning -> {
                // Mon-Thu (any time), Fri before morning: "This Saturday"
                val thisSaturday = localNow.with(TemporalAdjusters.next(DayOfWeek.SATURDAY))
                    .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
                options.add(SnoozeOption.ThisWeekend(thisSaturday.toEpochMillis(zone)))
            }
            isFridayAfterMorning -> {
                // Fri after morning: "This Sunday" (Tomorrow covers Saturday)
                val thisSunday = localNow.with(TemporalAdjusters.next(DayOfWeek.SUNDAY))
                    .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
                options.add(SnoozeOption.ThisSunday(thisSunday.toEpochMillis(zone)))
            }
            dayOfWeek == DayOfWeek.SATURDAY -> {
                // Saturday: "This Monday"
                val thisMonday = localNow.with(TemporalAdjusters.next(DayOfWeek.MONDAY))
                    .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
                options.add(SnoozeOption.ThisMonday(thisMonday.toEpochMillis(zone)))
            }
            dayOfWeek == DayOfWeek.SUNDAY && currentHour < morningHour -> {
                // Sunday before morning: "This Monday"
                val thisMonday = localNow.with(TemporalAdjusters.next(DayOfWeek.MONDAY))
                    .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
                options.add(SnoozeOption.ThisMonday(thisMonday.toEpochMillis(zone)))
            }
            dayOfWeek == DayOfWeek.SUNDAY && currentHour >= morningHour -> {
                // Sunday after morning: "This Tuesday" (Tomorrow covers Monday)
                val thisTuesday = localNow.with(TemporalAdjusters.next(DayOfWeek.TUESDAY))
                    .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
                options.add(SnoozeOption.ThisTuesday(thisTuesday.toEpochMillis(zone)))
            }
        }

        // "Next weekend" - Weekends only, target next Saturday morning time
        if (isWeekend) {
            val nextSaturday = if (dayOfWeek == DayOfWeek.SATURDAY) {
                localNow.plusWeeks(1).withHour(morningHour).withMinute(morningMinute)
                    .withSecond(0).withNano(0)
            } else {
                // Sunday - next Saturday
                localNow.with(TemporalAdjusters.next(DayOfWeek.SATURDAY))
                    .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
            }
            options.add(SnoozeOption.NextWeekend(nextSaturday.toEpochMillis(zone)))
        }

        // "Next Monday" - Weekdays only (weekends use ThisMonday/ThisTuesday instead)
        if (!isWeekend) {
            val nextMonday = localNow.with(TemporalAdjusters.next(DayOfWeek.MONDAY))
                .withHour(morningHour).withMinute(morningMinute).withSecond(0).withNano(0)
            options.add(SnoozeOption.NextWeek(nextMonday.toEpochMillis(zone)))
        }

        // "Last" - Only if custom was used this session
        if (lastCustomTime != null) {
            val lastDateTime = LocalDateTime.parse(lastCustomTime)
            val lastEpochMillis = lastDateTime.toEpochMillis(zone)
            options.add(SnoozeOption.Last(lastEpochMillis))
        }

        // "Custom" - Always shown
        options.add(SnoozeOption.Custom)

        return options
    }

    private fun LocalDateTime.toEpochMillis(zone: ZoneId): Long {
        return this.atZone(zone).toInstant().toEpochMilli()
    }
}
