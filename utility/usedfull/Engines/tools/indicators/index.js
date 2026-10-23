const { loadCandleFile, loadAllCandlesFromDir } = require('./utils/dataLoader');

// Market Context
const { getPreviousDayLevels } = require('./market_context/previous_day_levels');
const { getPreviousWeekLevels } = require('./market_context/previous_week_levels');
const { getPreviousMonthLevels } = require('./market_context/previous_month_levels');
const { calculatePivotPoints } = require('./market_context/pivot_points');
const { getOpeningRange } = require('./market_context/opening_range');
const { analyzeIndiaVix } = require('./market_context/india_vix');

// Trend
const { calculateEMA } = require('./trend/ema');
const { calculateSMA } = require('./trend/sma');
const { calculateVWAP } = require('./trend/vwap');
const { calculateSupertrend } = require('./trend/supertrend');
const { calculateADX } = require('./trend/adx');
const { calculateDirectionalIndicators } = require('./trend/di');

// Fibonacci (Newly Added)
const { calculateFibonacci, isInGoldenZone } = require('./trend/fibonacci');

// Price Action
const { analyzeMarketStructure } = require('./price_action/market_structure');
const { identifySwings } = require('./price_action/higher_high_lower_high');
const { detectBreakout } = require('./price_action/breakout');
const { detectRetest } = require('./price_action/retest');
const { findSupportResistance } = require('./price_action/support_resistance');
const { analyzeGap } = require('./price_action/gap_analysis');
const { evaluateCandleStrength } = require('./price_action/candle_strength');
const { analyzeWicks } = require('./price_action/wick_analysis');
const { detectCandlestickPatterns } = require('./price_action/candlestick_patterns');
const { detectTrendlineBreakout } = require('./price_action/trendline');
const LiquiditySweepStrategy = require('./price_action/liquidity_sweep');

// Momentum
const { calculateRSI } = require('./momentum/rsi');
const { detectRSIDivergence } = require('./momentum/rsi_divergence');
const { calculateMACD } = require('./momentum/macd');
const { analyzeMACDHistogram } = require('./momentum/macd_histogram');
const { calculateStochasticRSI } = require('./momentum/stochastic_rsi');
const { calculateROC } = require('./momentum/roc');

// Volatility
const { calculateATR } = require('./volatility/atr');
const { calculateBollingerBands } = require('./volatility/bollinger_bands');
const { calculateBollingerWidth } = require('./volatility/bollinger_width');
const { calculateKeltnerChannels } = require('./volatility/keltner_channel');
const { calculateDonchianChannels } = require('./volatility/donchian_channel');

// Volume
const { getVolumeMetrics } = require('./volume/volume');
const { calculateRelativeVolume } = require('./volume/relative_volume');
const { calculateVolumeEMA } = require('./volume/volume_ema');
const { detectVolumeSpike } = require('./volume/volume_spike');
const { calculateOBV } = require('./volume/obv');
const { calculateVolumeDelta } = require('./volume/volume_delta');

// Options Chain
const { getTotalCallOI } = require('./options_chain/call_oi');
const { getTotalPutOI } = require('./options_chain/put_oi');
const { getChangeInOI } = require('./options_chain/change_in_oi');
const { getTotalCallVolume } = require('./options_chain/call_volume');
const { getTotalPutVolume } = require('./options_chain/put_volume');
const { calculatePCR } = require('./options_chain/pcr');
const { getATMImpliedVolatility } = require('./options_chain/implied_volatility');
const { calculateIVRank } = require('./options_chain/iv_rank');
const { calculateIVPercentile } = require('./options_chain/iv_percentile');
const { calculateMaxPain } = require('./options_chain/max_pain');
const { getOISupport } = require('./options_chain/oi_support');
const { getOIResistance } = require('./options_chain/oi_resistance');
const { isLongBuildup } = require('./options_chain/long_build_up');
const { isShortBuildup } = require('./options_chain/short_build_up');
const { isShortCovering } = require('./options_chain/short_covering');
const { isLongUnwinding } = require('./options_chain/long_unwinding');

// Market Depth
const { getBestBidPrice } = require('./market_depth/best_bid');
const { getBestAskPrice } = require('./market_depth/best_ask');
const { getTotalBidQuantity } = require('./market_depth/bid_quantity');
const { getTotalAskQuantity } = require('./market_depth/ask_quantity');
const { calculateBidAskSpread } = require('./market_depth/bid_ask_spread');
const { calculateDepthImbalance } = require('./market_depth/depth_imbalance');
const { getTop5Depth } = require('./market_depth/top5_depth');
const { calculateLiquidityScore } = require('./market_depth/liquidity_score');
const { estimateSlippage } = require('./market_depth/slippage_estimate');

// External Market
const { analyzeGiftNifty } = require('./external_market/gift_nifty');
const { analyzeBankNiftyCorrelation } = require('./external_market/bank_nifty');
const { analyzeFinNiftyCorrelation } = require('./external_market/fin_nifty');
const { analyzeUsdInrImpact } = require('./external_market/usd_inr');
const { analyzeCrudeOilImpact } = require('./external_market/crude_oil');
const { analyzeGlobalSentiment } = require('./external_market/global_indices');

// Institutional
const { analyzeFIICashFlow } = require('./institutional/fii_cash_flow');
const { analyzeDIICashFlow } = require('./institutional/dii_cash_flow');
const { analyzeFIIFuturesPositions } = require('./institutional/fii_futures_position');

// Time Factors
const { getTradingSessionWindow } = require('./time_factors/time_of_day');
const { getDayOfWeek } = require('./time_factors/day_of_week');
const { isExpiryDay } = require('./time_factors/expiry_day');
const { getDaysToExpiry } = require('./time_factors/days_to_expiry');
const { calculateDistanceFromATM } = require('./time_factors/distance_from_atm');

module.exports = {
    // DataLoader
    loadCandleFile,
    loadAllCandlesFromDir,

    // Market Context
    marketContext: {
        getPreviousDayLevels,
        getPreviousWeekLevels,
        getPreviousMonthLevels,
        calculatePivotPoints,
        getOpeningRange,
        analyzeIndiaVix
    },

    // Trend
    trend: {
        calculateEMA,
        calculateSMA,
        calculateVWAP,
        calculateSupertrend,
        calculateADX,
        calculateDirectionalIndicators,
        calculateFibonacci,      // <-- Added here
        isNearFibLevel,          // <-- Added here
        isInGoldenZone
    },

    // Price Action
    priceAction: {
        analyzeMarketStructure,
        identifySwings,
        detectBreakout,
        detectRetest,
        findSupportResistance,
        analyzeGap,
        evaluateCandleStrength,
        analyzeWicks,
        detectCandlestickPatterns,
        detectTrendlineBreakout,
        calculateLiquiditySweep: LiquiditySweepStrategy.calculateLiquiditySweepIndicator
    },

    // Momentum
    momentum: {
        calculateRSI,
        detectRSIDivergence,
        calculateMACD,
        analyzeMACDHistogram,
        calculateStochasticRSI,
        calculateROC
    },

    // Volatility
    volatility: {
        calculateATR,
        calculateBollingerBands,
        calculateBollingerWidth,
        calculateKeltnerChannels,
        calculateDonchianChannels
    },

    // Volume
    volume: {
        getVolumeMetrics,
        calculateRelativeVolume,
        calculateVolumeEMA,
        detectVolumeSpike,
        calculateOBV,
        calculateVolumeDelta
    },

    // Options Chain
    optionsChain: {
        getTotalCallOI,
        getTotalPutOI,
        getChangeInOI,
        getTotalCallVolume,
        getTotalPutVolume,
        calculatePCR,
        getATMImpliedVolatility,
        calculateIVRank,
        calculateIVPercentile,
        calculateMaxPain,
        getOISupport,
        getOIResistance,
        isLongBuildup,
        isShortBuildup,
        isShortCovering,
        isLongUnwinding
    },

    // Market Depth
    marketDepth: {
        getBestBidPrice,
        getBestAskPrice,
        getTotalBidQuantity,
        getTotalAskQuantity,
        calculateBidAskSpread,
        calculateDepthImbalance,
        getTop5Depth,
        calculateLiquidityScore,
        estimateSlippage
    },

    // External Market
    externalMarket: {
        analyzeGiftNifty,
        analyzeBankNiftyCorrelation,
        analyzeFinNiftyCorrelation,
        analyzeUsdInrImpact,
        analyzeCrudeOilImpact,
        analyzeGlobalSentiment
    },

    // Institutional
    institutional: {
        analyzeFIICashFlow,
        analyzeDIICashFlow,
        analyzeFIIFuturesPositions
    },

    // Time Factors
    timeFactors: {
        getTradingSessionWindow,
        getDayOfWeek,
        isExpiryDay,
        getDaysToExpiry,
        calculateDistanceFromATM
    }
};