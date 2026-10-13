
const PositionChecker = require("./dhan-position");

async function main() {
    try {
        const checker = new PositionChecker();
        const result = await checker.checkPosition();

        console.log(result);
    } catch (error) {
        console.error("POSITION CHECK FAILED:", error.message);
        process.exitCode = 1;
    }
}

main();
