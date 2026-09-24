const { selectBestStrike } = require("../usedfull/select-best-strike");

async function test() {
    try {
        console.log("================ TEST 1: NIFTY 50 (SecurityID: 13, LotSize: 65) ================");
        const niftyCE = await selectBestStrike({
            securityId: 13,
            exchangeSegment: "IDX_I",
            optionType: "CE",
            lots: 1,
            lotSize: 65,
            amountPercent: "100%"
        });
        console.log("Nifty 50 Result:", JSON.stringify(niftyCE, null, 2));

        console.log("\n================ TEST 2: BANK NIFTY (SecurityID: 25, LotSize: 15) ================");
        const bankNiftyCE = await selectBestStrike({
            securityId: 25,
            exchangeSegment: "IDX_I",
            optionType: "CE",
            lots: 1,
            lotSize: 15,
            amountPercent: "100%"
        });
        console.log("Bank Nifty Result:", JSON.stringify(bankNiftyCE, null, 2));

    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();
