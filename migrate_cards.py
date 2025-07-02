#!/usr/bin/env python3
"""
Migration script to move existing card data from scattered storage to centralized cards directory.

This script:
1. Scans the old DATA_DIR for shared_card_ entries
2. Moves them to the new CARDS_DIR structure
3. Maintains backward compatibility
4. Provides progress reporting
"""

import os
import json
import time
import shutil
from datetime import datetime

# Configuration
DATA_DIR = 'data'
CARDS_DIR = os.path.join(DATA_DIR, 'cards')
BACKUP_DIR = os.path.join(DATA_DIR, 'migration_backup')

def ensure_directories():
    """Create necessary directories"""
    os.makedirs(CARDS_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    print(f"✅ Created directories: {CARDS_DIR}, {BACKUP_DIR}")

def find_existing_cards():
    """Find all existing shared_card entries in the old hash-based structure"""
    cards_found = []
    
    if not os.path.exists(DATA_DIR):
        print(f"❌ DATA_DIR '{DATA_DIR}' not found")
        return cards_found
    
    print(f"🔍 Scanning {DATA_DIR} for existing cards...")
    
    for root, dirs, files in os.walk(DATA_DIR):
        # Skip the new cards directory to avoid conflicts
        if 'cards' in dirs:
            dirs.remove('cards')
        if 'migration_backup' in dirs:
            dirs.remove('migration_backup')
        
        for file in files:
            # Files don't have extensions in the hash-based storage
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                
                # Check if this is a shared card entry
                if (data.get('key', '').startswith('shared_card_') and 
                    isinstance(data.get('value'), dict)):
                    
                    card_data = data['value']
                    card_id = data['key'].replace('shared_card_', '')
                    
                    cards_found.append({
                        'id': card_id,
                        'data': card_data,
                        'original_file': file_path,
                        'key': data['key']
                    })
                    
            except (json.JSONDecodeError, IOError, KeyError) as e:
                # This is expected for many files that aren't JSON or aren't card data
                continue
    
    print(f"📊 Found {len(cards_found)} existing cards")
    return cards_found

def migrate_card(card_info):
    """Migrate a single card to the new structure"""
    try:
        card_id = card_info['id']
        card_data = card_info['data']
        original_file = card_info['original_file']
        
        # Create new card data structure with any missing fields
        new_card_data = {
            'id': card_id,
            'prompt': card_data.get('prompt', ''),
            'frontCover': card_data.get('frontCover', ''),
            'backCover': card_data.get('backCover', ''),
            'leftPage': card_data.get('leftPage', ''),
            'rightPage': card_data.get('rightPage', ''),
            'createdAt': card_data.get('createdAt', time.time()),
            'expiresAt': card_data.get('expiresAt', time.time() + (365 * 24 * 60 * 60)),  # 1 year default
            'version': 2,  # Mark as migrated
            'migratedAt': time.time(),
            'originalFile': original_file  # Keep reference for debugging
        }
        
        # Write to new cards directory
        new_card_path = os.path.join(CARDS_DIR, f"card_{card_id}.json")
        
        # Check if card already exists in new structure
        if os.path.exists(new_card_path):
            print(f"⚠️  Card {card_id} already exists in new structure, skipping")
            return False
        
        with open(new_card_path, 'w') as f:
            json.dump(new_card_data, f, indent=2)
        
        # Create backup of original file
        backup_filename = f"original_{card_id}_{int(time.time())}.json"
        backup_path = os.path.join(BACKUP_DIR, backup_filename)
        shutil.copy2(original_file, backup_path)
        
        print(f"✅ Migrated card {card_id}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to migrate card {card_info.get('id', 'unknown')}: {str(e)}")
        return False

def cleanup_old_files(cards_info, dry_run=True):
    """Optionally remove old card files after successful migration"""
    if dry_run:
        print(f"🔍 DRY RUN: Would remove {len(cards_info)} old card files")
        for card_info in cards_info:
            print(f"   - {card_info['original_file']}")
        return
    
    print(f"🗑️  Removing {len(cards_info)} old card files...")
    removed_count = 0
    
    for card_info in cards_info:
        try:
            os.remove(card_info['original_file'])
            removed_count += 1
            print(f"   ✅ Removed {card_info['original_file']}")
        except Exception as e:
            print(f"   ❌ Failed to remove {card_info['original_file']}: {str(e)}")
    
    print(f"🧹 Removed {removed_count}/{len(cards_info)} old files")

def verify_migration(original_cards):
    """Verify that all cards were migrated correctly"""
    print(f"🔍 Verifying migration of {len(original_cards)} cards...")
    
    success_count = 0
    for card_info in original_cards:
        card_id = card_info['id']
        new_card_path = os.path.join(CARDS_DIR, f"card_{card_id}.json")
        
        if os.path.exists(new_card_path):
            try:
                with open(new_card_path, 'r') as f:
                    new_data = json.load(f)
                
                # Basic verification
                if (new_data.get('id') == card_id and 
                    new_data.get('version') == 2 and
                    'migratedAt' in new_data):
                    success_count += 1
                else:
                    print(f"⚠️  Card {card_id} exists but data seems incomplete")
            except Exception as e:
                print(f"❌ Failed to verify card {card_id}: {str(e)}")
        else:
            print(f"❌ Card {card_id} not found in new structure")
    
    print(f"✅ Verified {success_count}/{len(original_cards)} cards successfully migrated")
    return success_count == len(original_cards)

def main():
    """Main migration function"""
    print("🚀 Starting card storage migration...")
    print(f"📁 DATA_DIR: {os.path.abspath(DATA_DIR)}")
    print(f"📁 CARDS_DIR: {os.path.abspath(CARDS_DIR)}")
    print(f"📁 BACKUP_DIR: {os.path.abspath(BACKUP_DIR)}")
    print("-" * 50)
    
    # Step 1: Ensure directories exist
    ensure_directories()
    
    # Step 2: Find existing cards
    existing_cards = find_existing_cards()
    
    if not existing_cards:
        print("✅ No cards found to migrate. Migration complete!")
        return
    
    # Step 3: Show summary and ask for confirmation
    print(f"\n📋 Migration Summary:")
    print(f"   • Found: {len(existing_cards)} cards")
    print(f"   • Will migrate to: {CARDS_DIR}")
    print(f"   • Backups will be stored in: {BACKUP_DIR}")
    
    # Show some examples
    if len(existing_cards) > 0:
        print(f"\n📝 Example cards found:")
        for i, card in enumerate(existing_cards[:3]):
            created = datetime.fromtimestamp(card['data'].get('createdAt', 0)).strftime('%B %d, %Y')
            prompt = card['data'].get('prompt', 'No prompt')[:50]
            print(f"   {i+1}. {card['id']} - {created} - \"{prompt}{'...' if len(prompt) == 50 else ''}\"")
        if len(existing_cards) > 3:
            print(f"   ... and {len(existing_cards) - 3} more")
    
    # Confirmation
    response = input(f"\n❓ Proceed with migration? (y/N): ").strip().lower()
    if response != 'y':
        print("❌ Migration cancelled")
        return
    
    # Step 4: Migrate cards
    print(f"\n🔄 Starting migration...")
    migrated_count = 0
    
    for i, card_info in enumerate(existing_cards, 1):
        print(f"[{i}/{len(existing_cards)}] Migrating {card_info['id']}...")
        if migrate_card(card_info):
            migrated_count += 1
    
    print(f"\n📊 Migration Results:")
    print(f"   • Successfully migrated: {migrated_count}/{len(existing_cards)} cards")
    print(f"   • Failed: {len(existing_cards) - migrated_count} cards")
    
    # Step 5: Verify migration
    if migrated_count > 0:
        print(f"\n🔍 Verifying migration...")
        verification_success = verify_migration(existing_cards)
        
        if verification_success:
            print(f"✅ All cards verified successfully!")
            
            # Step 6: Optional cleanup
            cleanup_response = input(f"\n❓ Remove old card files? This is IRREVERSIBLE but backups exist. (y/N): ").strip().lower()
            if cleanup_response == 'y':
                cleanup_old_files(existing_cards, dry_run=False)
            else:
                print("📁 Old files kept. You can manually remove them later.")
                cleanup_old_files(existing_cards, dry_run=True)  # Show what would be removed
        else:
            print(f"❌ Migration verification failed. Please check the issues above.")
    
    print(f"\n🎉 Migration complete!")
    print(f"📈 Cards are now stored in: {os.path.abspath(CARDS_DIR)}")
    print(f"💾 Backups available in: {os.path.abspath(BACKUP_DIR)}")

if __name__ == "__main__":
    main() 