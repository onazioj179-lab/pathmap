"""
PATHMAP - Automated Backup System
=================================
Production-grade backup for PostgreSQL with S3/local storage.
"""
# pyright: reportMissingImports=false

import os
import subprocess
import gzip
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import asyncio
import logging
import json
from pathlib import Path

try:
    import boto3  # type: ignore[import-not-found]
    from botocore.exceptions import ClientError  # type: ignore[import-not-found]
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

logger = logging.getLogger(__name__)


# ============== CONFIGURATION ==============

class BackupConfig:
    """Backup configuration."""
    
    # Database
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "pathmap")
    DB_USER = os.getenv("DB_USER", "pathmap")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    
    # Storage
    BACKUP_DIR = os.getenv("BACKUP_DIR", "/var/backups/pathmap")
    
    # S3 (optional)
    S3_BUCKET = os.getenv("BACKUP_S3_BUCKET", "")
    S3_PREFIX = os.getenv("BACKUP_S3_PREFIX", "pathmap/backups")
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    
    # Retention
    RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))
    HOURLY_RETENTION = int(os.getenv("BACKUP_HOURLY_RETENTION", "24"))  # Keep 24 hourly
    DAILY_RETENTION = int(os.getenv("BACKUP_DAILY_RETENTION", "7"))    # Keep 7 daily
    WEEKLY_RETENTION = int(os.getenv("BACKUP_WEEKLY_RETENTION", "4"))  # Keep 4 weekly


# ============== BACKUP MANAGER ==============

class BackupManager:
    """Manages database backups."""
    
    def __init__(self, config: BackupConfig = None):
        self.config = config or BackupConfig()
        self.backup_dir = Path(self.config.BACKUP_DIR)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # S3 client
        self.s3_client = None
        if HAS_BOTO3 and self.config.S3_BUCKET:
            self.s3_client = boto3.client('s3', region_name=self.config.AWS_REGION)
    
    def _get_backup_filename(self, backup_type: str = "manual") -> str:
        """Generate backup filename."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"pathmap_{backup_type}_{timestamp}.sql.gz"
    
    def _run_pg_dump(self, output_file: Path) -> bool:
        """Run pg_dump to create backup."""
        env = os.environ.copy()
        env["PGPASSWORD"] = self.config.DB_PASSWORD
        
        # Build pg_dump command
        cmd = [
            "pg_dump",
            "-h", self.config.DB_HOST,
            "-p", self.config.DB_PORT,
            "-U", self.config.DB_USER,
            "-d", self.config.DB_NAME,
            "-F", "p",  # Plain text format
            "--no-owner",
            "--no-acl",
        ]
        
        try:
            # Run pg_dump and compress output
            with gzip.open(output_file, 'wt', encoding='utf-8') as f:
                result = subprocess.run(
                    cmd,
                    env=env,
                    stdout=f,
                    stderr=subprocess.PIPE,
                    timeout=3600,  # 1 hour timeout
                )
            
            if result.returncode != 0:
                logger.error(f"pg_dump failed: {result.stderr.decode()}")
                return False
            
            logger.info(f"Backup created: {output_file}")
            return True
            
        except subprocess.TimeoutExpired:
            logger.error("pg_dump timed out")
            return False
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            return False
    
    def create_backup(self, backup_type: str = "manual") -> Optional[str]:
        """Create database backup."""
        filename = self._get_backup_filename(backup_type)
        output_file = self.backup_dir / filename
        
        success = self._run_pg_dump(output_file)
        
        if success:
            # Create metadata file
            metadata = {
                "filename": filename,
                "type": backup_type,
                "created_at": datetime.utcnow().isoformat(),
                "size_bytes": output_file.stat().st_size,
                "database": self.config.DB_NAME,
            }
            
            meta_file = output_file.with_suffix('.json')
            with open(meta_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            return str(output_file)
        
        return None
    
    def upload_to_s3(self, local_file: str) -> bool:
        """Upload backup to S3."""
        if not self.s3_client:
            logger.warning("S3 not configured, skipping upload")
            return False
        
        try:
            filename = Path(local_file).name
            s3_key = f"{self.config.S3_PREFIX}/{filename}"
            
            self.s3_client.upload_file(
                local_file,
                self.config.S3_BUCKET,
                s3_key,
                ExtraArgs={
                    'ServerSideEncryption': 'AES256',
                    'StorageClass': 'STANDARD_IA',  # Infrequent Access
                }
            )
            
            logger.info(f"Backup uploaded to S3: s3://{self.config.S3_BUCKET}/{s3_key}")
            return True
            
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return False
    
    def list_backups(self, backup_type: str = None) -> List[Dict[str, Any]]:
        """List available backups."""
        backups = []
        
        for meta_file in self.backup_dir.glob("*.json"):
            try:
                with open(meta_file) as f:
                    metadata = json.load(f)
                
                if backup_type and metadata.get("type") != backup_type:
                    continue
                
                backup_file = meta_file.with_suffix('.sql.gz')
                if backup_file.exists():
                    metadata["exists"] = True
                    metadata["path"] = str(backup_file)
                else:
                    metadata["exists"] = False
                
                backups.append(metadata)
                
            except Exception as e:
                logger.warning(f"Failed to read metadata {meta_file}: {e}")
        
        # Sort by creation time, newest first
        backups.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return backups
    
    def restore_backup(self, backup_file: str) -> bool:
        """Restore database from backup."""
        backup_path = Path(backup_file)
        
        if not backup_path.exists():
            logger.error(f"Backup file not found: {backup_file}")
            return False
        
        env = os.environ.copy()
        env["PGPASSWORD"] = self.config.DB_PASSWORD
        
        try:
            # Read gzipped SQL and pipe to psql
            with gzip.open(backup_path, 'rt', encoding='utf-8') as f:
                sql_content = f.read()
            
            cmd = [
                "psql",
                "-h", self.config.DB_HOST,
                "-p", self.config.DB_PORT,
                "-U", self.config.DB_USER,
                "-d", self.config.DB_NAME,
            ]
            
            result = subprocess.run(
                cmd,
                env=env,
                input=sql_content,
                capture_output=True,
                text=True,
                timeout=3600,
            )
            
            if result.returncode != 0:
                logger.error(f"Restore failed: {result.stderr}")
                return False
            
            logger.info(f"Database restored from: {backup_file}")
            return True
            
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return False
    
    def cleanup_old_backups(self) -> int:
        """Remove old backups based on retention policy."""
        deleted = 0
        now = datetime.utcnow()
        cutoff = now - timedelta(days=self.config.RETENTION_DAYS)
        
        for meta_file in self.backup_dir.glob("*.json"):
            try:
                with open(meta_file) as f:
                    metadata = json.load(f)
                
                created_at = datetime.fromisoformat(metadata.get("created_at", ""))
                
                if created_at < cutoff:
                    # Delete backup and metadata
                    backup_file = meta_file.with_suffix('.sql.gz')
                    
                    if backup_file.exists():
                        backup_file.unlink()
                    meta_file.unlink()
                    
                    deleted += 1
                    logger.info(f"Deleted old backup: {backup_file.name}")
                    
            except Exception as e:
                logger.warning(f"Failed to process {meta_file}: {e}")
        
        return deleted
    
    def verify_backup(self, backup_file: str) -> bool:
        """Verify backup file integrity."""
        backup_path = Path(backup_file)
        
        if not backup_path.exists():
            return False
        
        try:
            # Try to decompress and read first few bytes
            with gzip.open(backup_path, 'rt', encoding='utf-8') as f:
                header = f.read(1000)
            
            # Check for PostgreSQL dump header
            return "PostgreSQL database dump" in header or "CREATE" in header
            
        except Exception as e:
            logger.error(f"Backup verification failed: {e}")
            return False
    
    def get_backup_stats(self) -> Dict[str, Any]:
        """Get backup statistics."""
        backups = self.list_backups()
        
        total_size = sum(b.get("size_bytes", 0) for b in backups if b.get("exists"))
        
        return {
            "total_backups": len(backups),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "oldest": backups[-1]["created_at"] if backups else None,
            "newest": backups[0]["created_at"] if backups else None,
            "retention_days": self.config.RETENTION_DAYS,
            "s3_enabled": bool(self.s3_client),
        }


# ============== SCHEDULED BACKUP ==============

class BackupScheduler:
    """Scheduled backup runner."""
    
    def __init__(self, manager: BackupManager = None):
        self.manager = manager or BackupManager()
        self._running = False
    
    async def run_scheduled_backup(self, backup_type: str = "scheduled"):
        """Run a single scheduled backup."""
        logger.info(f"Starting {backup_type} backup...")
        
        # Create backup
        backup_file = self.manager.create_backup(backup_type)
        
        if backup_file:
            # Verify backup
            if not self.manager.verify_backup(backup_file):
                logger.error("Backup verification failed!")
                return
            
            # Upload to S3
            self.manager.upload_to_s3(backup_file)
            
            # Cleanup old backups
            deleted = self.manager.cleanup_old_backups()
            if deleted:
                logger.info(f"Cleaned up {deleted} old backups")
        else:
            logger.error("Backup creation failed!")
    
    async def start_hourly_schedule(self):
        """Start hourly backup schedule."""
        self._running = True
        
        while self._running:
            try:
                await self.run_scheduled_backup("hourly")
            except Exception as e:
                logger.error(f"Scheduled backup failed: {e}")
            
            # Wait 1 hour
            await asyncio.sleep(3600)
    
    def stop(self):
        """Stop the scheduler."""
        self._running = False


# ============== CLI COMMANDS ==============

async def backup_cli():
    """CLI for backup operations."""
    import argparse
    
    parser = argparse.ArgumentParser(description="PathMap Backup Tool")
    parser.add_argument("action", choices=["create", "list", "restore", "verify", "cleanup", "stats"])
    parser.add_argument("--type", default="manual", help="Backup type (manual, hourly, daily)")
    parser.add_argument("--file", help="Backup file for restore/verify")
    
    args = parser.parse_args()
    manager = BackupManager()
    
    if args.action == "create":
        result = manager.create_backup(args.type)
        print(f"Backup created: {result}" if result else "Backup failed!")
    
    elif args.action == "list":
        backups = manager.list_backups(args.type if args.type != "manual" else None)
        for b in backups:
            print(f"{b['filename']} - {b['created_at']} - {b['size_bytes']} bytes")
    
    elif args.action == "restore":
        if not args.file:
            print("Error: --file required for restore")
            return
        result = manager.restore_backup(args.file)
        print("Restore successful" if result else "Restore failed!")
    
    elif args.action == "verify":
        if not args.file:
            print("Error: --file required for verify")
            return
        result = manager.verify_backup(args.file)
        print("Backup valid" if result else "Backup invalid!")
    
    elif args.action == "cleanup":
        deleted = manager.cleanup_old_backups()
        print(f"Deleted {deleted} old backups")
    
    elif args.action == "stats":
        stats = manager.get_backup_stats()
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    asyncio.run(backup_cli())
