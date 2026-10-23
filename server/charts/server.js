
const express = require('express');
const path = require('path');
const { CachedHistoricalData } = require('../../utility/usedfull/cached-historical-data');

const app = express();
const PORT = process.env.PORT || 3000;
const cacheManager = new CachedHistoricalData();

app.use(express.static(__dirname));

// Parse the exchange's date and time as IST.
function parseIndianCandleTime(dateValue, timeValue) {
    const date = String(dateValue).trim();
    const time = String(timeValue).trim().toLowerCase();

    const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const tm = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/);

    if (!dm || !tm) {
        throw new Error(`Invalid candle date/time: ${date} ${time}`);
    }

    const year = Number(dm[1]);
    const month = Number(dm[2]);
    const day = Number(dm[3]);

    let hour = Number(tm[1]);
    const minute = Number(tm[2]);
    const second = Number(tm[3] || 0);
    const ampm = tm[4];

    if (ampm) {
        if (hour < 1 || hour > 12) {
            throw new Error(`Invalid hour: ${time}`);
        }

        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
    }

    if (hour > 23 || minute > 59 || second > 59) {
        throw new Error(`Invalid time: ${time}`);
    }

    const dateCheck = new Date(Date.UTC(year, month - 1, day));

    if (
        dateCheck.getUTCFullYear() !== year ||
        dateCheck.getUTCMonth() !== month - 1 ||
        dateCheck.getUTCDate() !== day
    ) {
        throw new Error(`Invalid date: ${date}`);
    }

    return Math.floor(
        (
            Date.UTC(year, month - 1, day, hour, minute, second)
            - 330 * 60 * 1000
        ) / 1000
    );
}

function getISTTime(unixTime) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).format(new Date(unixTime * 1000));
}

// Existing Fibonacci formula: 0.44, 0.50 and 0.56.
function calculateFibonacci(candle) {
    const high = Number(candle.high);
    const low = Number(candle.low);

    if (
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        high <= low
    ) {
        return null;
    }

    const range = high - low;
    const isGreen = candle.close >= candle.open;

    const levels = isGreen
        ? {
            '0.44': low + range * 0.44,
            '0.5': low + range * 0.50,
            '0.56': low + range * 0.56
        }
        : {
            '0.44': high - range * 0.44,
            '0.5': high - range * 0.50,
            '0.56': high - range * 0.56
        };

    for (const key of Object.keys(levels)) {
        levels[key] = Number(levels[key].toFixed(2));
    }

    return {
        time: candle.time,
        isGreen,
        levels
    };
}

// Find a 5-minute candle by its IST start time.
function findCandleAt(dayCandles, hhmm) {
    return dayCandles.find(
        candle => getISTTime(candle.time) === hhmm
    ) || null;
}

// 10:45 AM Fibonacci, calculated from the 10:45 candle.
function calculateTenFortyFiveFib(dayCandles, date, dayEndTime) {
    const candle = findCandleAt(dayCandles, '10:45');

    if (!candle) return null;

    const fib = calculateFibonacci(candle);
    if (!fib) return null;

    return {
        ...fib,
        date,
        dayEndTime,
        sourceCandle: {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }
    };
}

// Combine the six 5-minute candles starting from
// 12:15, 12:20, 12:25, 12:30, 12:35 and 12:40.
// The candle starting at 12:45 is not included.
function calculateThirtyMinuteFib(dayCandles, date) {
    const expectedTimes = [
        '12:15',
        '12:20',
        '12:25',
        '12:30',
        '12:35',
        '12:40'
    ];

    const selected = expectedTimes.map(time =>
        findCandleAt(dayCandles, time)
    );

    // Do not calculate from incomplete data.
    if (selected.some(candle => !candle)) {
        return null;
    }

    // Ensure six unique, consecutive 5-minute candles.
    for (let i = 1; i < selected.length; i++) {
        if (selected[i].time - selected[i - 1].time !== 300) {
            return null;
        }
    }

    const first = selected[0];
    const last = selected[selected.length - 1];

    const combinedCandle = {
        time: first.time,
        open: first.open,
        high: Math.max(...selected.map(candle => candle.high)),
        low: Math.min(...selected.map(candle => candle.low)),
        close: last.close
    };

    const fib = calculateFibonacci(combinedCandle);
    if (!fib) return null;

    return {
        ...fib,
        date,
        startTime: first.time,
        endTime: last.time + 300,
        sourceCandle: combinedCandle,
        sourceCount: selected.length
    };
}

// Combine the three 5-minute candles starting from
// 15:15, 15:20 and 15:25.
// The interval ends at 15:30.
function calculateFifteenMinuteFib(dayCandles, date) {
    const expectedTimes = [
        '15:15',
        '15:20',
        '15:25'
    ];

    const selected = expectedTimes.map(time =>
        findCandleAt(dayCandles, time)
    );

    // Do not calculate from incomplete data.
    if (selected.some(candle => !candle)) {
        return null;
    }

    // Ensure three unique, consecutive 5-minute candles.
    for (let i = 1; i < selected.length; i++) {
        if (selected[i].time - selected[i - 1].time !== 300) {
            return null;
        }
    }

    const first = selected[0];
    const last = selected[selected.length - 1];

    const combinedCandle = {
        time: first.time,
        open: first.open,
        high: Math.max(...selected.map(candle => candle.high)),
        low: Math.min(...selected.map(candle => candle.low)),
        close: last.close
    };

    // Use the same Green/Red Fibonacci formula.
    const fib = calculateFibonacci(combinedCandle);
    if (!fib) return null;

    return {
        ...fib,
        date,
        startTime: first.time,
        endTime: last.time + 300,
        sourceCandle: combinedCandle,
        sourceCount: selected.length
    };
}

function calculateSignals(candles) {
    const grouped = {};

    for (const candle of candles) {
        if (!grouped[candle.date]) grouped[candle.date] = [];
        grouped[candle.date].push(candle);
    }

    const firstCandleFibs = [];
    const secondRedCandleFibs = [];
    const tenFortyFiveFibs = [];
    const thirtyMinuteFibs = [];
    const fifteenMinuteFibs = [];
    const signals = [];

    for (const date of Object.keys(grouped).sort()) {
        const dayCandles = grouped[date].sort(
            (a, b) => a.time - b.time
        );

        if (!dayCandles.length) continue;

        const dayEndTime = dayCandles[dayCandles.length - 1].time;

        // 1. Existing opening Fibonacci.
        const firstFib = calculateFibonacci(dayCandles[0]);

        if (firstFib) {
            firstCandleFibs.push({
                ...firstFib,
                date,
                dayEndTime
            });
        }

        // 2. Existing first red candle after the opening candle.
        let secondFib = null;
        let secondFibIndex = -1;

        for (let i = 1; i < dayCandles.length; i++) {
            const candle = dayCandles[i];

            if (candle.close < candle.open) {
                secondFib = calculateFibonacci(candle);

                if (secondFib) {
                    secondFibIndex = i;
                    break;
                }
            }
        }

        if (secondFib && secondFibIndex >= 0) {
            secondRedCandleFibs.push({
                ...secondFib,
                date,
                dayEndTime
            });

            // Existing BUY rule remains unchanged.
            const triggerLevel = secondFib.levels['0.56'];

            for (let i = secondFibIndex + 1; i < dayCandles.length; i++) {
                const candle = dayCandles[i];

                if (candle.close < triggerLevel) {
                    signals.push({
                        date,
                        time: candle.time,
                        price: candle.close,
                        triggerLevel,
                        dayEndTime,
                        type: 'BUY',
                        label: 'BUY'
                    });

                    break;
                }
            }
        }

        // 3. 10:45 Fibonacci.
        const tenFortyFiveFib = calculateTenFortyFiveFib(
            dayCandles,
            date,
            dayEndTime
        );

        if (tenFortyFiveFib) {
            tenFortyFiveFibs.push(tenFortyFiveFib);
        }

        // 4. Existing 12:15–12:45 combined 30-minute Fibonacci.
        const thirtyMinuteFib = calculateThirtyMinuteFib(
            dayCandles,
            date
        );

        if (thirtyMinuteFib) {
            thirtyMinuteFibs.push(thirtyMinuteFib);
        }

        // 5. New 15:15–15:30 combined 15-minute Fibonacci.
        const fifteenMinuteFib = calculateFifteenMinuteFib(
            dayCandles,
            date
        );

        if (fifteenMinuteFib) {
            fifteenMinuteFibs.push(fifteenMinuteFib);
        }
    }

    return {
        firstCandleFibs,
        secondRedCandleFibs,
        tenFortyFiveFibs,
        thirtyMinuteFibs,
        fifteenMinuteFibs,
        signals
    };
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/nifty', async (req, res) => {
    try {
        const result = await cacheManager.getCandleData({
            securityId: '13',
            exchangeSegment: 'IDX_I',
            instrument: 'INDEX',
            interval: '5',
            count: 800
        });

        if (
            !result ||
            result.status !== 'success' ||
            !Array.isArray(result.data)
        ) {
            return res.status(502).json({
                error: 'Historical candle data unavailable',
                details: result?.message || null
            });
        }

        const candles = result.data
            .map(c => ({
                time: parseIndianCandleTime(c.date, c.time),
                date: String(c.date).trim(),
                open: Number(c.open ?? c.candleOpen),
                high: Number(c.high ?? c.candleHigh),
                low: Number(c.low ?? c.candleLow),
                close: Number(c.close ?? c.candleClose)
            }))
            .filter(c =>
                Number.isFinite(c.time) &&
                [c.open, c.high, c.low, c.close].every(Number.isFinite)
            )
            .sort((a, b) => a.time - b.time);

        const uniqueCandles = Array.from(
            new Map(candles.map(c => [c.time, c])).values()
        );

        if (!uniqueCandles.length) {
            return res.status(404).json({
                error: 'No valid historical candles'
            });
        }

        const calculated = calculateSignals(uniqueCandles);

        res.json({
            candles: uniqueCandles,
            firstCandleFibs: calculated.firstCandleFibs,
            secondRedCandleFibs: calculated.secondRedCandleFibs,
            tenFortyFiveFibs: calculated.tenFortyFiveFibs,
            thirtyMinuteFibs: calculated.thirtyMinuteFibs,
            fifteenMinuteFibs: calculated.fifteenMinuteFibs,
            signals: calculated.signals
        });
    } catch (error) {
        console.error('NIFTY historical data error:', error);

        res.status(500).json({
            error: 'Could not process historical candles',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`NIFTY chart running on port ${PORT}`);
});
