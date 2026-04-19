package io.hafa.latr.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NextWeek
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Nightlight
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Weekend
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import io.hafa.latr.ui.theme.LatrTheme
import io.hafa.latr.util.LocalDateTimeUtil
import io.hafa.latr.util.SnoozeOption
import io.hafa.latr.util.SnoozeTimeCalculator
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

private sealed class CustomPickerState {
    data object Hidden : CustomPickerState()
    data object ShowingDatePicker : CustomPickerState()
    data class ShowingTimePicker(val selectedDate: LocalDate) : CustomPickerState()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SnoozeBottomSheet(
    onDismiss: () -> Unit,
    onSnoozeSelected: (isoDateTime: String) -> Unit,
    onCustomTimeSelected: (isoDateTime: String) -> Unit,
    lastCustomSnoozeTime: String?,
    modifier: Modifier = Modifier,
    morningMinutes: Int = 480,
    eveningMinutes: Int = 1200,
    onSetPreferredTime: (Int) -> Unit = {},
    now: Instant = Instant.now()
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val options = remember(now, lastCustomSnoozeTime, morningMinutes, eveningMinutes) {
        SnoozeTimeCalculator.getSnoozeOptions(
            now,
            lastCustomSnoozeTime,
            morningMinutes,
            eveningMinutes
        )
    }

    var customPickerState by remember { mutableStateOf<CustomPickerState>(CustomPickerState.Hidden) }
    val setPickerState = { state: CustomPickerState -> customPickerState = state }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = null,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp)
        ) {
            options.forEach { option ->
                SnoozeOptionItem(
                    option = option,
                    onClick = {
                        when (option) {
                            is SnoozeOption.Custom -> {
                                setPickerState(CustomPickerState.ShowingDatePicker)
                            }

                            else -> {
                                onSnoozeSelected(LocalDateTimeUtil.fromEpochMillis(option.epochMillis))
                                onDismiss()
                            }
                        }
                    }
                )
            }
        }
    }

    when (val state = customPickerState) {
        CustomPickerState.Hidden -> { /* nothing */
        }

        CustomPickerState.ShowingDatePicker -> {
            DatePickerSheet(
                onDismiss = { setPickerState(CustomPickerState.Hidden) },
                onDateSelected = { date ->
                    setPickerState(CustomPickerState.ShowingTimePicker(date))
                },
                morningMinutes = morningMinutes,
                eveningMinutes = eveningMinutes,
                onDateAndTimeSelected = { epochMillis ->
                    val isoDateTime = LocalDateTimeUtil.fromEpochMillis(epochMillis)
                    onCustomTimeSelected(isoDateTime)
                    onSnoozeSelected(isoDateTime)
                    onDismiss()
                }
            )
        }

        is CustomPickerState.ShowingTimePicker -> {
            TimePickerSheet(
                selectedDate = state.selectedDate,
                morningMinutes = morningMinutes,
                onSetPreferredTime = onSetPreferredTime,
                onDismiss = { setPickerState(CustomPickerState.Hidden) },
                onConfirm = { epochMillis ->
                    val isoDateTime = LocalDateTimeUtil.fromEpochMillis(epochMillis)
                    onCustomTimeSelected(isoDateTime)
                    onSnoozeSelected(isoDateTime)
                    onDismiss()
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DatePickerSheet(
    onDismiss: () -> Unit,
    onDateSelected: (LocalDate) -> Unit,
    morningMinutes: Int,
    eveningMinutes: Int,
    onDateAndTimeSelected: (epochMillis: Long) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = null
    ) {
        DatePickerSheetContent(
            onDateSelected = onDateSelected,
            morningMinutes = morningMinutes,
            eveningMinutes = eveningMinutes,
            onDateAndTimeSelected = onDateAndTimeSelected
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DatePickerSheetContent(
    onDateSelected: (LocalDate) -> Unit,
    morningMinutes: Int,
    eveningMinutes: Int,
    onDateAndTimeSelected: (epochMillis: Long) -> Unit
) {
    val today = LocalDate.now()
    val datePickerState = rememberDatePickerState(
        initialSelectedDateMillis = today.atStartOfDay(ZoneId.systemDefault())
            .toInstant().toEpochMilli(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                val date = Instant.ofEpochMilli(utcTimeMillis)
                    .atZone(ZoneId.of("UTC")).toLocalDate()
                return !date.isBefore(today)
            }
        }
    )

    val selectedDate = datePickerState.selectedDateMillis?.let { millis ->
        Instant.ofEpochMilli(millis).atZone(ZoneId.of("UTC")).toLocalDate()
    }
    val isToday = selectedDate == today
    val now = LocalTime.now()
    val morningTime = LocalTime.of(morningMinutes / 60, morningMinutes % 60)
    val eveningTime = LocalTime.of(eveningMinutes / 60, eveningMinutes % 60)
    val morningEnabled = selectedDate != null && !(isToday && !morningTime.isAfter(now))
    val eveningEnabled = selectedDate != null && !(isToday && !eveningTime.isAfter(now))

    Column(
        modifier = Modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Pick a date", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))

        DatePicker(state = datePickerState, showModeToggle = false, title = null)

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            TextButton(
                onClick = {
                    selectedDate?.let { date ->
                        val dateTime = LocalDateTime.of(date, morningTime)
                        onDateAndTimeSelected(
                            dateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                        )
                    }
                },
                enabled = morningEnabled,
                modifier = Modifier.weight(1f)
            ) {
                Text("Morning")
            }

            TextButton(
                onClick = {
                    selectedDate?.let { date ->
                        val dateTime = LocalDateTime.of(date, eveningTime)
                        onDateAndTimeSelected(
                            dateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                        )
                    }
                },
                enabled = eveningEnabled,
                modifier = Modifier.weight(1f)
            ) {
                Text("Evening")
            }

            TextButton(
                onClick = {
                    selectedDate?.let { onDateSelected(it) }
                },
                enabled = selectedDate != null,
                modifier = Modifier.weight(1f)
            ) {
                Text("Custom")
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerSheet(
    selectedDate: LocalDate,
    morningMinutes: Int = 480,
    onSetPreferredTime: (Int) -> Unit = {},
    onDismiss: () -> Unit,
    onConfirm: (epochMillis: Long) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = null
    ) {
        TimePickerSheetContent(
            selectedDate = selectedDate,
            morningMinutes = morningMinutes,
            onSetPreferredTime = onSetPreferredTime,
            onDismiss = onDismiss,
            onConfirm = onConfirm
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerSheetContent(
    selectedDate: LocalDate,
    morningMinutes: Int = 480,
    onSetPreferredTime: (Int) -> Unit = {},
    onDismiss: () -> Unit,
    onConfirm: (epochMillis: Long) -> Unit
) {
    val isToday = selectedDate == LocalDate.now()
    val defaultHour = if (isToday) LocalTime.now().hour else morningMinutes / 60
    val defaultMinute = if (isToday) LocalTime.now().minute else morningMinutes % 60

    val timePickerState = rememberTimePickerState(
        initialHour = defaultHour,
        initialMinute = defaultMinute
    )

    // Validation: if today, time must be in future
    val isTimeValid = remember(timePickerState.hour, timePickerState.minute) {
        if (!isToday) return@remember true
        val selectedTime = LocalTime.of(timePickerState.hour, timePickerState.minute)
        selectedTime.isAfter(LocalTime.now())
    }

    // Determine which preferred time this would set
    val selectedTotalMinutes = timePickerState.hour * 60 + timePickerState.minute
    val isMorning = timePickerState.hour < 12
    val preferredLabel = if (isMorning) "Morning" else "Evening"
    Column(
        modifier = Modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Pick a time", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))

        TimePicker(state = timePickerState)

        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { onSetPreferredTime(selectedTotalMinutes) }) {
                Text("Set as $preferredLabel")
            }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text("Cancel") }
            TextButton(
                onClick = {
                    val dateTime = LocalDateTime.of(
                        selectedDate,
                        LocalTime.of(timePickerState.hour, timePickerState.minute)
                    )
                    onConfirm(dateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli())
                },
                enabled = isTimeValid
            ) { Text("Confirm") }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun SnoozeOptionItem(
    option: SnoozeOption,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val formattedTime = remember(option.epochMillis) {
        if (option.epochMillis > 0) {
            LocalDateTimeUtil.formatSnoozeTime(option.epochMillis, context)
        } else null
    }

    ListItem(
        headlineContent = { Text(option.label) },
        leadingContent = {
            Icon(
                imageVector = option.icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingContent = formattedTime?.let {
            {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

private val SnoozeOption.icon: ImageVector
    get() = when (this) {
        is SnoozeOption.InALittleWhile -> Icons.Default.Schedule
        is SnoozeOption.ThisMorning -> Icons.Default.LightMode
        is SnoozeOption.LaterToday -> Icons.Default.Nightlight
        is SnoozeOption.Tomorrow -> Icons.Default.Today
        is SnoozeOption.LaterTomorrow -> Icons.Default.Nightlight
        is SnoozeOption.ThisWeekend -> Icons.Default.Weekend
        is SnoozeOption.ThisSunday -> Icons.Default.Weekend
        is SnoozeOption.ThisMonday -> Icons.AutoMirrored.Filled.NextWeek
        is SnoozeOption.ThisTuesday -> Icons.Default.Today
        is SnoozeOption.NextWeekend -> Icons.Default.Weekend
        is SnoozeOption.NextWeek -> Icons.AutoMirrored.Filled.NextWeek
        is SnoozeOption.Last -> Icons.Default.History
        is SnoozeOption.Custom -> Icons.Default.CalendarMonth
    }

@Preview(showBackground = true, name = "Morning - 6am weekday")
@Composable
private fun SnoozeBottomSheetPreview_Morning() {
    val morningWeekday = LocalDateTime.of(2024, 1, 15, 6, 0) // Monday 6am
        .atZone(ZoneId.systemDefault())
        .toInstant()

    LatrTheme {
        SnoozeOptionsPreviewContent(
            now = morningWeekday,
            lastCustomSnoozeTime = null
        )
    }
}

@Preview(showBackground = true, name = "Afternoon - 2pm weekday")
@Composable
private fun SnoozeBottomSheetPreview_Afternoon() {
    val afternoonWeekday = LocalDateTime.of(2024, 1, 15, 14, 0) // Monday 2pm
        .atZone(ZoneId.systemDefault())
        .toInstant()

    LatrTheme {
        SnoozeOptionsPreviewContent(
            now = afternoonWeekday,
            lastCustomSnoozeTime = null
        )
    }
}

@Preview(showBackground = true, name = "Evening - 9pm weekday")
@Composable
private fun SnoozeBottomSheetPreview_Evening() {
    val eveningWeekday = LocalDateTime.of(2024, 1, 15, 21, 0) // Monday 9pm
        .atZone(ZoneId.systemDefault())
        .toInstant()

    LatrTheme {
        SnoozeOptionsPreviewContent(
            now = eveningWeekday,
            lastCustomSnoozeTime = null
        )
    }
}

@Preview(showBackground = true, name = "Weekend - Saturday")
@Composable
private fun SnoozeBottomSheetPreview_Weekend() {
    val saturday = LocalDateTime.of(2024, 1, 20, 10, 0) // Saturday 10am
        .atZone(ZoneId.systemDefault())
        .toInstant()

    LatrTheme {
        SnoozeOptionsPreviewContent(
            now = saturday,
            lastCustomSnoozeTime = null
        )
    }
}

@Preview(showBackground = true, name = "With Last option")
@Composable
private fun SnoozeBottomSheetPreview_WithLast() {
    val afternoonWeekday = LocalDateTime.of(2024, 1, 15, 14, 0) // Monday 2pm
        .atZone(ZoneId.systemDefault())
        .toInstant()

    val lastCustomTime = LocalDateTime.of(2024, 1, 18, 9, 30).toString() // Thursday 9:30am

    LatrTheme {
        SnoozeOptionsPreviewContent(
            now = afternoonWeekday,
            lastCustomSnoozeTime = lastCustomTime
        )
    }
}

@Composable
private fun SnoozeOptionsPreviewContent(
    now: Instant,
    lastCustomSnoozeTime: String?
) {
    val options = SnoozeTimeCalculator.getSnoozeOptions(now, lastCustomSnoozeTime)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp)
    ) {
        options.forEach { option ->
            SnoozeOptionItem(
                option = option,
                onClick = {}
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true, name = "Date Picker Sheet")
@Composable
private fun DatePickerSheetPreview() {
    LatrTheme {
        DatePickerSheetContent(
            onDateSelected = {},
            morningMinutes = 480,
            eveningMinutes = 1200,
            onDateAndTimeSelected = {}
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true, name = "Time Picker Sheet")
@Composable
private fun TimePickerSheetPreview() {
    LatrTheme {
        TimePickerSheetContent(
            selectedDate = LocalDate.now().plusDays(1),
            onDismiss = {},
            onConfirm = {}
        )
    }
}
