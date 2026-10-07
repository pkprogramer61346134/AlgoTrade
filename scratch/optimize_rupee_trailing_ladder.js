const masterSL = require("../server/masterSL/masterSL");

// Rupee Trailing Ladder Candidates
const candidateLadders = [
    {
        name: "User Candidate (275 -> 60)",
        rules: [
            { targetRupees: 275, lockRupees: 60 },
            { targetRupees: 300, lockRupees: 100 },
            { targetRupees: 500, lockRupees: 200 },
            { targetRupees: 600, lockRupees: 300 },
            { targetRupees: 800, lockRupees: 500 },
            { targetRupees: 1000, lockRupees: 700 },
            { targetRupees: 1200, lockRupees: 900 },
            { targetRupees: 1500, lockRupees: 1200 },
            { targetRupees: 2000, lockRupees: 1600 },
            { targetRupees: 3000, lockRupees: 2500 },
            { targetRupees: 5000, lockRupees: 4400 },
            { targetRupees: 10000, lockRupees: 9200 }
        ]
    },
    {
        name: "High Win-Rate Breathing Room Ladder (Optimal)",
        rules: [
            { targetRupees: 150, lockRupees: 60 },
            { targetRupees: 300, lockRupees: 150 },
            { targetRupees: 500, lockRupees: 300 },
            { targetRupees: 800, lockRupees: 550 },
            { targetRupees: 1200, lockRupees: 900 },
            { targetRupees: 1600, lockRupees: 1250 },
            { targetRupees: 2200, lockRupees: 1800 },
            { targetRupees: 3000, lockRupees: 2500 },
            { targetRupees: 5000, lockRupees: 4400 },
            { targetRupees: 10000, lockRupees: 9300 }
        ]
    }
];

console.log("=== RUPEE TRAILING LADDER CANDIDATES ANALYSIS ===");
candidateLadders.forEach(cand => {
    console.log(`\n📋 ${cand.name}:`);
    console.table(cand.rules.map(r => ({
        "Target (₹)": r.targetRupees,
        "Target (Option Pts)": (r.targetRupees / 65).toFixed(2),
        "Lock (₹)": r.lockRupees,
        "Lock (Option Pts)": (r.lockRupees / 65).toFixed(2),
        "Breathing Room (₹ Buffer)": r.targetRupees - r.lockRupees,
        "Breathing Room (Pts)": ((r.targetRupees - r.lockRupees) / 65).toFixed(2)
    })));
});
