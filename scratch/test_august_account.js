const trades = [
  { date: "2026-08-03 9:15 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-03 10:15 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-04 9:30 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-05 11:50 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-06 9:45 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-07 10:10 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-07 2:05 PM", pnl: -1300, lots: 1 },
  { date: "2026-08-10 9:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-10 10:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-11 9:15 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-12 9:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-13 9:30 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-14 9:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-14 1:55 PM", pnl: -1300, lots: 1 },
  { date: "2026-08-17 9:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-17 3:25 PM", pnl: -1300, lots: 1 },
  { date: "2026-08-18 9:30 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-19 9:15 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-20 9:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-20 9:30 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-20 12:50 PM", pnl: -2600, lots: 2 },
  { date: "2026-08-21 9:20 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-24 9:15 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-24 10:55 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-25 9:50 AM", pnl: -1300, lots: 1 },
  { date: "2026-08-25 2:35 PM", pnl: 3900, lots: 1 },
  { date: "2026-08-26 9:40 AM", pnl: -2600, lots: 2 },
  { date: "2026-08-26 11:50 AM", pnl: 3900, lots: 1 },
  { date: "2026-08-27 9:20 AM", pnl: 7800, lots: 2 },
  { date: "2026-08-28 11:05 AM", pnl: -3900, lots: 3 },
  { date: "2026-08-28 11:20 AM", pnl: 7800, lots: 2 },
  { date: "2026-08-28 3:10 PM", pnl: 11700, lots: 3 },
  { date: "2026-08-31 9:15 AM", pnl: -5200, lots: 4 }
];

let capital = 10000;
let minCapital = capital;
let minDate = "";

console.log("Date | Trade PnL | Capital Balance");
console.log("---------------------------------------");
for (const t of trades) {
  capital += t.pnl;
  if (capital < minCapital) {
    minCapital = capital;
    minDate = t.date;
  }
  console.log(`${t.date.padEnd(20)} | ${t.pnl >= 0 ? '+' : ''}${t.pnl} | ₹${capital}`);
}

console.log("---------------------------------------");
console.log("Final Capital at end of August 2026:", "₹" + capital);
console.log("Lowest Capital Balance point:", "₹" + minCapital, "on", minDate);
