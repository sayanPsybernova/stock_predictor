const { mean, standardDeviation } = require("simple-statistics");
const { SimpleLinearRegression } = require("ml-regression");
const ARIMA = require("arima");

/**
 * Monte Carlo Simulation for price path projection.
 * @param {number} startPrice - The starting price of the asset.
 * @param {number} drift - The drift (average daily return).
 * @param {number} volatility - The volatility (standard deviation of daily returns).
 * @param {number} numSteps - The number of steps (days) to simulate.
 * @param {number} numSimulations - The number of simulations to run.
 * @returns {Array<Array<number>>} An array of simulated price paths.
 */
function monteCarloSimulation(
  startPrice,
  drift,
  volatility,
  numSteps,
  numSimulations
) {
  const simulations = [];
  for (let i = 0; i < numSimulations; i++) {
    const path = [startPrice];
    // FIX: Changed j < numSteps to j <= numSteps to create correct number of steps
    for (let j = 1; j <= numSteps; j++) {
      const z = standardNormalRandom(); // Standard normal random variable
      const dailyReturn = Math.exp(drift + volatility * z);
      path.push(path[j - 1] * dailyReturn);
    }
    simulations.push(path);
  }
  return simulations;
}

// Box-Muller transform to get a standard normal random number
function standardNormalRandom() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Projects future returns using a simple linear regression model.
 * @param {number[]} prices - Array of historical closing prices.
 * @param {number} days - Number of days to project forward.
 * @returns {object} The projected return range { lower, upper }.
 */
function linearRegressionProjection(prices, days) {
  if (!prices || prices.length < 2) {
    return { lower: -0.05, upper: 0.05 };
  }

  const x = prices.map((_, i) => i);
  const regression = new SimpleLinearRegression(x, prices);
  const lastDayIndex = prices.length - 1;

  const predictions = [];
  for (let i = 1; i <= days; i++) {
    predictions.push(regression.predict(lastDayIndex + i));
  }

  const lastPrice = prices[lastDayIndex];
  const finalPredictedPrice = predictions[predictions.length - 1];

  const predictedReturn = (finalPredictedPrice - lastPrice) / lastPrice;

  // FIX: Calculate actual error bounds based on regression residuals
  const residuals = prices.map((p, i) => p - regression.predict(i));
  const stdError = standardDeviation(residuals) / lastPrice;
  // Use 2 standard errors for ~95% confidence interval
  const errorMargin = Math.max(stdError * 2, 0.01); // Minimum 1% error margin

  return {
    lower: predictedReturn - errorMargin,
    upper: predictedReturn + errorMargin,
  };
}

/**
 * Projects future returns using an ARIMA model.
 * @param {number[]} prices - Array of historical closing prices.
 * @param {number} days - Number of days to project forward.
 * @returns {object} The projected return range { lower, upper }.
 */
function arimaProjection(prices, days) {
  if (!prices || prices.length < 30) {
    // Not enough data for ARIMA
    return { lower: -0.05, upper: 0.05 };
  }

  try {
    const arima = new ARIMA({ p: 2, d: 1, q: 2, verbose: false }).train(prices);
    const [predictions, errors] = arima.predict(days);

    const lastPrice = prices[prices.length - 1];
    const finalPrediction = predictions[days - 1];
    const finalError = errors[days - 1];

    // Validate predictions
    if (isNaN(finalPrediction) || isNaN(finalError)) {
      throw new Error("ARIMA produced invalid predictions");
    }

    return {
      lower: (finalPrediction - finalError - lastPrice) / lastPrice,
      upper: (finalPrediction + finalError - lastPrice) / lastPrice,
    };
  } catch (e) {
    console.error("ARIMA failed:", e.message);
    // FIX: Return estimate based on historical volatility instead of hardcoded values
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const historicalVol =
      returns.length > 0 ? standardDeviation(returns) : 0.02;
    const scaledVol = historicalVol * Math.sqrt(days);
    return {
      lower: -scaledVol,
      upper: scaledVol,
    };
  }
}

/**
 * Perform quantitative analysis using an ensemble of models.
 * @param {Array<Object>} historicalData - Array of historical data objects.
 * @param {number} projectionDays - The number of days to project (e.g., 5, 30, 180).
 * @returns {object} An object containing the quantitative analysis results.
 */
function performQuantitativeAnalysis(historicalData, projectionDays) {
  if (!historicalData || historicalData.length < 50) {
    return {
      expectedReturn: 0,
      expectedReturnRange: { lower: "N/A", upper: "N/A" },
      probability: { positive: "N/A", negative: "N/A" },
      confidence: 0,
      riskLevel: "Unknown",
      explanation: ["Insufficient historical data for analysis."],
    };
  }

  const closingPrices = historicalData
    .map((d) => d.close)
    .filter((p) => p != null && !isNaN(p));
  const returns = [];
  for (let i = 1; i < closingPrices.length; i++) {
    returns.push(
      (closingPrices[i] - closingPrices[i - 1]) / closingPrices[i - 1]
    );
  }

  const drift = mean(returns);
  const volatility = standardDeviation(returns);
  const lastPrice = closingPrices[closingPrices.length - 1];

  // 1. Monte Carlo Simulation
  const mcSimulations = monteCarloSimulation(
    lastPrice,
    drift,
    volatility,
    projectionDays,
    10000
  );
  const mcEndPrices = mcSimulations.map((sim) => sim[sim.length - 1]);
  const mcMeanReturn = (mean(mcEndPrices) - lastPrice) / lastPrice;
  const mcStdDevReturn = standardDeviation(
    mcEndPrices.map((p) => (p - lastPrice) / lastPrice)
  );

  const mcRange = {
    lower: mcMeanReturn - mcStdDevReturn,
    upper: mcMeanReturn + mcStdDevReturn,
  };

  // 2. Linear Regression Projection
  const lrRange = linearRegressionProjection(
    closingPrices.slice(-100),
    projectionDays
  );

  // 3. ARIMA Projection
  const arimaRange = arimaProjection(closingPrices.slice(-100), projectionDays);

  // Ensemble the models with weighting
  const models = [
    { name: "Monte Carlo", range: mcRange, weight: 0.5 },
    { name: "Linear Regression", range: lrRange, weight: 0.25 },
    { name: "ARIMA", range: arimaRange, weight: 0.25 },
  ];

  let weightedLower = 0;
  let weightedUpper = 0;
  models.forEach((m) => {
    weightedLower += m.range.lower * m.weight;
    weightedUpper += m.range.upper * m.weight;
  });

  const expectedReturnRange = {
    lower: weightedLower,
    upper: weightedUpper,
  };

  // Calculate other metrics
  const positiveSims = mcEndPrices.filter((p) => p > lastPrice).length;
  const probability = positiveSims / mcEndPrices.length;

  // FIX: Improved confidence formula with proper scaling and clamping
  const disagreement =
    Math.abs(mcRange.upper - lrRange.upper) +
    Math.abs(mcRange.lower - lrRange.lower);
  const annualizedVol = volatility * Math.sqrt(252);
  // Normalize disagreement and volatility to 0-1 scale
  const normalizedDisagreement = Math.min(disagreement / 0.3, 1); // Cap at 30% disagreement
  const normalizedVolatility = Math.min(annualizedVol / 0.5, 1); // Cap at 50% annual volatility
  // Calculate confidence: start at 100, penalize for disagreement and volatility
  const rawConfidence =
    100 * (1 - normalizedDisagreement * 0.4 - normalizedVolatility * 0.3);
  const confidence = Math.max(5, Math.min(95, rawConfidence)); // Clamp between 5-95

  let riskLevel = "Low";
  if (volatility * Math.sqrt(projectionDays) > 0.15) riskLevel = "High";
  else if (volatility * Math.sqrt(projectionDays) > 0.08) riskLevel = "Medium";

  return {
    expectedReturn: (expectedReturnRange.lower + expectedReturnRange.upper) / 2,
    expectedReturnRange: {
      lower: (expectedReturnRange.lower * 100).toFixed(2) + "%",
      upper: (expectedReturnRange.upper * 100).toFixed(2) + "%",
    },
    probability: {
      positive: (probability * 100).toFixed(1) + "%",
      negative: ((1 - probability) * 100).toFixed(1) + "%",
    },
    confidence: Math.round(confidence),
    riskLevel: riskLevel,
    explanation: [
      `Based on an ensemble of ${models.length} models over ${projectionDays} trading days.`,
      `Monte Carlo simulation (10,000 runs) projects returns between ${(
        mcRange.lower * 100
      ).toFixed(1)}% and ${(mcRange.upper * 100).toFixed(1)}%.`,
      `Linear regression trend suggests ${
        lrRange.lower > 0
          ? "upward"
          : lrRange.upper < 0
          ? "downward"
          : "neutral"
      } momentum.`,
      `Annualized volatility is ${(annualizedVol * 100).toFixed(
        1
      )}%, indicating ${riskLevel.toLowerCase()} risk.`,
      `Model confidence: ${Math.round(
        confidence
      )}% (based on model agreement and volatility).`,
    ],
  };
}

module.exports = {
  performQuantitativeAnalysis,
};
