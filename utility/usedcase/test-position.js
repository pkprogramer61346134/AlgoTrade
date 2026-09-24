const { DhanPosition } = require("../dhan-position");

async function test() {
    try {
        const position = new DhanPosition();
        const result = await position.getPosition();
        console.log("Position Result:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

test();