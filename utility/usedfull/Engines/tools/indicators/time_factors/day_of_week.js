/**
 * Identifies Day of Week (Monday, Tuesday, Wednesday, Thursday, Friday)
 * @param {string|Date} dateInput - "YYYY-MM-DD" or Date object
 */
function getDayOfWeek(dateInput) {
    const d = new Date(dateInput);
    const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const dayName = days[d.getDay()];
    return { dayName, dayIndex: d.getDay() };
}

module.exports = { getDayOfWeek };
