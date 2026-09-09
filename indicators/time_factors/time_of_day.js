/**
 * Identifies the Trading Session Window based on time of day
 * Windows: OPENING_BELL (09:15-10:00), MIDDAY_CONSOLIDATION (10:00-14:00), CLOSING_MOVE (14:00-15:30)
 * @param {string|Date} timeInput - Time string "9:25:00 AM" or Date object
 */
function getTradingSessionWindow(timeInput) {
    let hours = 9;
    let minutes = 15;

    if (typeof timeInput === 'string') {
        const match = timeInput.match(/(\d+):(\d+)/);
        if (match) {
            hours = parseInt(match[1], 10);
            minutes = parseInt(match[2], 10);
            if (timeInput.toUpperCase().includes("PM") && hours < 12) hours += 12;
            if (timeInput.toUpperCase().includes("AM") && hours === 12) hours = 0;
        }
    } else if (timeInput instanceof Date) {
        hours = timeInput.getHours();
        minutes = timeInput.getMinutes();
    }

    const totalMinutes = (hours * 60) + minutes;

    let window = "OFF_MARKET_HOURS";
    if (totalMinutes >= 555 && totalMinutes < 600) window = "OPENING_BELL";
    else if (totalMinutes >= 600 && totalMinutes < 840) window = "MIDDAY_CONSOLIDATION";
    else if (totalMinutes >= 840 && totalMinutes <= 930) window = "CLOSING_MOVE";

    return { window, totalMinutes };
}

module.exports = { getTradingSessionWindow };
