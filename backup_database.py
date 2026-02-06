#!/usr/bin/env python3
"""
Face Database Backup Utility
Creates compressed backups of the face database with metadata
"""
import os
import tarfile
import gzip
import json
import hashlib
from datetime import datetime
from pathlib import Path

class FaceDatabaseBackup:
    def __init__(self):
        self.db_path = Path('/root/.openclaw/workspace/faceswap-tools/face_database/bulk')
        self.backup_dir = Path('/root/.openclaw/workspace/ai-made-simple/backups')
        self.backup_dir.mkdir(exist_ok=True)
        
    def calculate_directory_hash(self, path):
        """Calculate MD5 hash of all files in directory"""
        hasher = hashlib.md5()
        
        for file_path in sorted(Path(path).glob('**/*')):
            if file_path.is_file():
                with open(file_path, 'rb') as f:
                    hasher.update(f.read())
                    
        return hasher.hexdigest()
    
    def get_database_stats(self):
        """Get database statistics"""
        if not self.db_path.exists():
            return None
            
        files = list(self.db_path.glob('face_*.jpg'))
        total_size = sum(f.stat().st_size for f in files)
        
        return {
            'total_files': len(files),
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / 1024 / 1024, 2),
            'directory_hash': self.calculate_directory_hash(self.db_path),
            'backup_timestamp': datetime.now().isoformat(),
            'files_list': [f.name for f in files[:10]]  # First 10 files as sample
        }
    
    def create_backup(self, compression_level=6):
        """Create compressed backup of face database"""
        if not self.db_path.exists():
            print("❌ Database directory not found")
            return None
            
        # Generate backup filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f'face_database_backup_{timestamp}.tar.gz'
        backup_path = self.backup_dir / backup_filename
        
        print(f"📦 Creating backup: {backup_filename}")
        
        # Get database stats before backup
        stats = self.get_database_stats()
        
        try:
            # Create compressed tar archive
            with tarfile.open(backup_path, 'w:gz', compresslevel=compression_level) as tar:
                tar.add(self.db_path, arcname='face_database_bulk')
            
            # Get backup file size
            backup_size = backup_path.stat().st_size
            compression_ratio = backup_size / stats['total_size_bytes'] if stats['total_size_bytes'] > 0 else 0
            
            # Create metadata file
            metadata = {
                'backup_info': {
                    'filename': backup_filename,
                    'created': datetime.now().isoformat(),
                    'backup_size_bytes': backup_size,
                    'backup_size_mb': round(backup_size / 1024 / 1024, 2),
                    'compression_ratio': round(compression_ratio, 3),
                    'compression_level': compression_level
                },
                'database_stats': stats
            }
            
            metadata_filename = f'face_database_backup_{timestamp}_metadata.json'
            metadata_path = self.backup_dir / metadata_filename
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            print(f"✅ Backup created successfully!")
            print(f"📁 Backup size: {metadata['backup_info']['backup_size_mb']} MB")
            print(f"📊 Compression ratio: {metadata['backup_info']['compression_ratio']:.1%}")
            print(f"📋 Metadata: {metadata_filename}")
            
            return {
                'backup_path': backup_path,
                'metadata_path': metadata_path,
                'stats': metadata
            }
            
        except Exception as e:
            print(f"❌ Backup failed: {str(e)}")
            return None
    
    def list_backups(self):
        """List all available backups"""
        backups = []
        
        for backup_file in self.backup_dir.glob('face_database_backup_*.tar.gz'):
            metadata_file = backup_file.with_suffix('.tar.gz').with_suffix('')
            metadata_file = self.backup_dir / f"{metadata_file.name}_metadata.json"
            
            backup_info = {
                'filename': backup_file.name,
                'size_mb': round(backup_file.stat().st_size / 1024 / 1024, 2),
                'created': datetime.fromtimestamp(backup_file.stat().st_mtime).isoformat()
            }
            
            # Load metadata if available
            if metadata_file.exists():
                try:
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                        backup_info['metadata'] = metadata
                except:
                    pass
            
            backups.append(backup_info)
        
        # Sort by creation time (newest first)
        backups.sort(key=lambda x: x['created'], reverse=True)
        return backups
    
    def cleanup_old_backups(self, keep_count=5):
        """Remove old backups, keeping only the most recent ones"""
        backups = self.list_backups()
        
        if len(backups) <= keep_count:
            print(f"📦 {len(backups)} backups found, no cleanup needed (keeping {keep_count})")
            return
        
        backups_to_remove = backups[keep_count:]
        
        for backup in backups_to_remove:
            backup_path = self.backup_dir / backup['filename']
            metadata_path = backup_path.with_suffix('.tar.gz').with_suffix('')
            metadata_path = self.backup_dir / f"{metadata_path.name}_metadata.json"
            
            # Remove backup file
            if backup_path.exists():
                backup_path.unlink()
                print(f"🗑️  Removed old backup: {backup['filename']}")
            
            # Remove metadata file
            if metadata_path.exists():
                metadata_path.unlink()
                print(f"🗑️  Removed metadata: {metadata_path.name}")
        
        print(f"✅ Cleanup complete: kept {keep_count} most recent backups")

def main():
    backup_tool = FaceDatabaseBackup()
    
    print("🎭 Face Database Backup Utility")
    print("=" * 40)
    
    # Create backup
    print("\n📦 Creating backup...")
    result = backup_tool.create_backup()
    
    if result:
        print(f"\n📊 Backup Details:")
        stats = result['stats']
        print(f"Database files: {stats['database_stats']['total_files']}")
        print(f"Original size: {stats['database_stats']['total_size_mb']} MB")
        print(f"Backup size: {stats['backup_info']['backup_size_mb']} MB")
        print(f"Space saved: {(1 - stats['backup_info']['compression_ratio']) * 100:.1f}%")
    
    # List existing backups
    print(f"\n📋 Existing Backups:")
    backups = backup_tool.list_backups()
    
    if backups:
        for i, backup in enumerate(backups[:5], 1):  # Show top 5
            created = datetime.fromisoformat(backup['created']).strftime('%Y-%m-%d %H:%M')
            print(f"{i}. {backup['filename']} ({backup['size_mb']} MB) - {created}")
    else:
        print("No backups found")
    
    # Cleanup old backups
    print(f"\n🧹 Cleaning up old backups...")
    backup_tool.cleanup_old_backups(keep_count=3)
    
    print(f"\n✅ Backup process complete!")

if __name__ == '__main__':
    main()