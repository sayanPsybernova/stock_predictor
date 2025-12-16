"""
Daily Auto-Training Scheduler
Automatically retrains the ML model every market day
with latest data from the past 5 years
"""

import asyncio
import schedule
import time
from datetime import datetime, timedelta
from typing import Optional, Callable
import threading
import logging
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.pro_trainer import ProTrader, DailyTrainer, NIFTY50_SYMBOLS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('training_scheduler.log')
    ]
)
logger = logging.getLogger(__name__)


class TrainingScheduler:
    """
    Automated training scheduler with market-aware timing
    Trains model after market hours (after 4 PM IST)
    """

    def __init__(self, training_time: str = "16:30",
                 symbols_count: int = 30,
                 period: str = '5y'):
        """
        Initialize scheduler

        Args:
            training_time: Time to run training (24h format, IST)
            symbols_count: Number of symbols to train on
            period: Historical period for training
        """
        self.training_time = training_time
        self.symbols_count = symbols_count
        self.period = period
        self.daily_trainer = DailyTrainer()
        self.is_running = False
        self._scheduler_thread = None
        self._callbacks = []

        # Training state
        self.last_training = None
        self.next_training = None
        self.training_in_progress = False

    def add_callback(self, callback: Callable):
        """Add callback to be called after training"""
        self._callbacks.append(callback)

    def _notify_callbacks(self, result):
        """Notify all callbacks after training"""
        for callback in self._callbacks:
            try:
                callback(result)
            except Exception as e:
                logger.error(f"Callback error: {e}")

    def _is_market_day(self) -> bool:
        """Check if today is a market day (weekday)"""
        today = datetime.now()
        return today.weekday() < 5  # Monday = 0, Friday = 4

    def _run_training_job(self):
        """Execute the training job"""
        if self.training_in_progress:
            logger.warning("Training already in progress, skipping")
            return

        if not self._is_market_day():
            logger.info("Weekend - skipping training")
            return

        self.training_in_progress = True
        logger.info("=" * 60)
        logger.info("SCHEDULED TRAINING JOB STARTED")
        logger.info("=" * 60)

        try:
            # Get symbols to train
            symbols = NIFTY50_SYMBOLS[:self.symbols_count]

            # Run training
            result = self.daily_trainer.run_daily_training(
                symbols=symbols,
                force=False
            )

            self.last_training = datetime.now()

            if result:
                logger.info("=" * 60)
                logger.info(f"TRAINING COMPLETED SUCCESSFULLY")
                logger.info(f"Accuracy: {result['accuracy']:.4f}")
                logger.info(f"ROC-AUC: {result['roc_auc']:.4f}")
                logger.info("=" * 60)

                self._notify_callbacks({
                    'status': 'success',
                    'metrics': result,
                    'timestamp': self.last_training.isoformat()
                })
            else:
                logger.info("Training skipped - model up to date")
                self._notify_callbacks({
                    'status': 'skipped',
                    'timestamp': datetime.now().isoformat()
                })

        except Exception as e:
            logger.error(f"Training job failed: {e}")
            self._notify_callbacks({
                'status': 'failed',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })

        finally:
            self.training_in_progress = False

    def _calculate_next_training(self) -> datetime:
        """Calculate next scheduled training time"""
        now = datetime.now()
        hour, minute = map(int, self.training_time.split(':'))

        next_train = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if next_train <= now:
            next_train += timedelta(days=1)

        # Skip weekends
        while next_train.weekday() >= 5:
            next_train += timedelta(days=1)

        return next_train

    def _scheduler_loop(self):
        """Main scheduler loop"""
        schedule.every().day.at(self.training_time).do(self._run_training_job)

        logger.info(f"Scheduler started - Training scheduled at {self.training_time} IST")
        self.next_training = self._calculate_next_training()
        logger.info(f"Next training: {self.next_training}")

        while self.is_running:
            schedule.run_pending()
            time.sleep(60)  # Check every minute

    def start(self):
        """Start the scheduler"""
        if self.is_running:
            logger.warning("Scheduler already running")
            return

        self.is_running = True
        self._scheduler_thread = threading.Thread(
            target=self._scheduler_loop,
            daemon=True
        )
        self._scheduler_thread.start()
        logger.info("Training scheduler started")

    def stop(self):
        """Stop the scheduler"""
        self.is_running = False
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5)
        logger.info("Training scheduler stopped")

    def force_train_now(self, symbols: list = None) -> dict:
        """Force immediate training"""
        if self.training_in_progress:
            return {'status': 'error', 'message': 'Training already in progress'}

        symbols = symbols or NIFTY50_SYMBOLS[:self.symbols_count]

        logger.info("Force training initiated...")

        self.training_in_progress = True
        try:
            result = self.daily_trainer.run_daily_training(
                symbols=symbols,
                force=True
            )
            self.last_training = datetime.now()

            return {
                'status': 'success',
                'metrics': result,
                'timestamp': self.last_training.isoformat()
            }
        except Exception as e:
            return {
                'status': 'failed',
                'error': str(e)
            }
        finally:
            self.training_in_progress = False

    def get_status(self) -> dict:
        """Get scheduler status"""
        return {
            'is_running': self.is_running,
            'training_in_progress': self.training_in_progress,
            'scheduled_time': self.training_time,
            'next_training': self.next_training.isoformat() if self.next_training else None,
            'last_training': self.last_training.isoformat() if self.last_training else None,
            'symbols_count': self.symbols_count,
            'period': self.period,
            'training_history': self.daily_trainer.get_training_history()
        }


# Global scheduler instance
_scheduler: Optional[TrainingScheduler] = None


def get_scheduler() -> TrainingScheduler:
    """Get or create global scheduler instance"""
    global _scheduler
    if _scheduler is None:
        _scheduler = TrainingScheduler()
    return _scheduler


def start_scheduler():
    """Start the global scheduler"""
    scheduler = get_scheduler()
    scheduler.start()
    return scheduler


def stop_scheduler():
    """Stop the global scheduler"""
    global _scheduler
    if _scheduler:
        _scheduler.stop()


# Async wrapper for FastAPI integration
class AsyncTrainingScheduler:
    """Async wrapper for training scheduler"""

    def __init__(self):
        self.scheduler = get_scheduler()

    async def start(self):
        """Start scheduler in background"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.scheduler.start)

    async def stop(self):
        """Stop scheduler"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.scheduler.stop)

    async def force_train(self, symbols: list = None) -> dict:
        """Force training asynchronously"""
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self.scheduler.force_train_now(symbols)
        )
        return result

    def get_status(self) -> dict:
        """Get scheduler status"""
        return self.scheduler.get_status()


# CLI for testing
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Training Scheduler')
    parser.add_argument('--start', action='store_true', help='Start scheduler')
    parser.add_argument('--train', action='store_true', help='Force immediate training')
    parser.add_argument('--time', type=str, default='16:30',
                       help='Training time (HH:MM)')
    parser.add_argument('--symbols', type=int, default=30,
                       help='Number of symbols')

    args = parser.parse_args()

    if args.train:
        scheduler = TrainingScheduler(symbols_count=args.symbols)
        result = scheduler.force_train_now()
        print(f"Training result: {result}")

    elif args.start:
        scheduler = TrainingScheduler(
            training_time=args.time,
            symbols_count=args.symbols
        )
        scheduler.start()

        print(f"Scheduler started. Training at {args.time} IST daily")
        print("Press Ctrl+C to stop...")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            scheduler.stop()
            print("\nScheduler stopped")
