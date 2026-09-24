const { DhanLivePrice } = require("../dhan-live-price");

const live = new DhanLivePrice();

live.getLivePrice("13", "IDX_I", 5, (candle) => {
    console.log(candle);
});