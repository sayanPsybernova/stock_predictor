/**
 * ML Integration Service
 * Connects Node.js backend to Python ML service for enhanced predictions
 *
 * Features:
 * - Health check monitoring
 * - Single stock predictions
 * - Batch predictions for top gainers
 * - Automatic fallback when ML service unavailable
 */

const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_SERVICE_TIMEOUT = 15000; // 15 seconds
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

class MLIntegrationService {
    constructor() {
        this.isAvailable = false;
        this.lastHealthCheck = null;
        this.modelInfo = null;
        this.healthCheckTimer = null;
    }

    /**
     * Initialize the service and start health checks
     */
    async initialize() {
        console.log('🤖 ML Integration Service initializing...');
        await this.checkHealth();

        // Start periodic health checks
        this.healthCheckTimer = setInterval(() => {
            this.checkHealth();
        }, HEALTH_CHECK_INTERVAL);

        console.log(`🤖 ML Service status: ${this.isAvailable ? '✅ Connected' : '❌ Unavailable'}`);
        return this.isAvailable;
    }

    /**
     * Check if ML service is healthy
     */
    async checkHealth() {
        try {
            const response = await axios.get(`${ML_SERVICE_URL}/health`, {
                timeout: 5000
            });

            this.isAvailable = response.data?.status === 'healthy';
            this.lastHealthCheck = new Date();
            this.modelInfo = response.data?.model_info || null;

            if (this.isAvailable && this.modelInfo) {
                console.log(`✅ ML Service healthy - Model v${this.modelInfo.version}`);
            }

            return this.isAvailable;
        } catch (error) {
            this.isAvailable = false;
            console.warn('⚠️ ML Service health check failed:', error.message);
            return false;
        }
    }

    /**
     * Get prediction for a single stock
     * @param {string} symbol - Stock symbol (e.g., 'RELIANCE.NS')
     * @param {boolean} includeFeatures - Whether to include feature breakdown
     * @returns {Object|null} - Prediction result or null if unavailable
     */
    async getStockPrediction(symbol, includeFeatures = false) {
        if (!this.isAvailable) {
            return null;
        }

        try {
            const response = await axios.post(
                `${ML_SERVICE_URL}/api/v1/predict/stock`,
                {
                    symbol,
                    include_features: includeFeatures
                },
                { timeout: ML_SERVICE_TIMEOUT }
            );

            return {
                symbol: response.data.symbol,
                probability: response.data.probability,
                confidence: response.data.confidence,
                predictedClass: response.data.predicted_class,
                reasoning: response.data.reasoning || [],
                features: response.data.features || null,
                mlPowered: true
            };
        } catch (error) {
            console.warn(`⚠️ ML prediction failed for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Get batch predictions for multiple stocks
     * @param {string[]} symbols - Array of stock symbols
     * @param {number} topN - Number of top predictions to return
     * @param {number} minProbability - Minimum probability threshold
     * @returns {Object|null} - Batch predictions or null if unavailable
     */
    async getBatchPredictions(symbols, topN = 10, minProbability = 0.5) {
        if (!this.isAvailable) {
            return null;
        }

        try {
            const response = await axios.post(
                `${ML_SERVICE_URL}/api/v1/predict/batch`,
                {
                    symbols,
                    top_n: topN,
                    min_probability: minProbability
                },
                { timeout: 60000 } // 60 second timeout for batch
            );

            return {
                predictions: response.data.predictions.map(p => ({
                    symbol: p.symbol,
                    probability: p.probability,
                    confidence: p.confidence,
                    predictedClass: p.predicted_class,
                    reasoning: p.reasoning || []
                })),
                modelVersion: response.data.model_version,
                generatedAt: response.data.generated_at,
                totalAnalyzed: response.data.total_analyzed,
                mlPowered: true
            };
        } catch (error) {
            console.warn('⚠️ ML batch prediction failed:', error.message);
            return null;
        }
    }

    /**
     * Get model metrics
     * @returns {Object|null} - Model metrics or null if unavailable
     */
    async getModelMetrics() {
        if (!this.isAvailable) {
            return null;
        }

        try {
            const response = await axios.get(
                `${ML_SERVICE_URL}/api/v1/model/metrics`,
                { timeout: 10000 }
            );

            return {
                version: response.data.version,
                trainedAt: response.data.trained_at,
                metrics: response.data.metrics,
                featureImportance: response.data.feature_importance
            };
        } catch (error) {
            console.warn('⚠️ Failed to get ML model metrics:', error.message);
            return null;
        }
    }

    /**
     * Trigger model training
     * @param {boolean} force - Force retrain even if recent model exists
     * @returns {Object|null} - Training job info or null if failed
     */
    async triggerTraining(force = false) {
        if (!this.isAvailable) {
            return null;
        }

        try {
            const response = await axios.post(
                `${ML_SERVICE_URL}/api/v1/train`,
                { force },
                { timeout: 10000 }
            );

            return {
                status: response.data.status,
                jobId: response.data.job_id,
                message: response.data.message
            };
        } catch (error) {
            console.warn('⚠️ Failed to trigger ML training:', error.message);
            return null;
        }
    }

    /**
     * Get training job status
     * @param {string} jobId - Training job ID
     * @returns {Object|null} - Job status or null if failed
     */
    async getTrainingStatus(jobId) {
        if (!this.isAvailable) {
            return null;
        }

        try {
            const response = await axios.get(
                `${ML_SERVICE_URL}/api/v1/train/status/${jobId}`,
                { timeout: 10000 }
            );

            return {
                status: response.data.status,
                progress: response.data.progress,
                message: response.data.message,
                metrics: response.data.metrics,
                error: response.data.error
            };
        } catch (error) {
            console.warn('⚠️ Failed to get training status:', error.message);
            return null;
        }
    }

    /**
     * Convert ML probability to score (0-100)
     * @param {number} probability - Probability from ML model (0-1)
     * @returns {number} - Score (0-100)
     */
    probabilityToScore(probability) {
        return Math.round(probability * 100);
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            available: this.isAvailable,
            lastHealthCheck: this.lastHealthCheck,
            modelInfo: this.modelInfo,
            serviceUrl: ML_SERVICE_URL
        };
    }

    /**
     * Stop health check timer
     */
    shutdown() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
}

// Export singleton instance
const mlService = new MLIntegrationService();
module.exports = mlService;
