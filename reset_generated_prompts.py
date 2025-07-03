#!/usr/bin/env python3
"""
Reset script to remove artificially generated prompts from cards.

This script will:
1. Find all cards with generatedPrompts
2. Remove the generatedPrompts field
3. Prepare cards for AI-powered migration

Usage: python3 reset_generated_prompts.py
"""

import os
import json
import sys
from pathlib import Path

# Add the project root to Python path for imports
sys.path.append(os.path.abspath('.'))

def get_cards_directory():
    """Get the cards directory path"""
    return os.path.join(os.getcwd(), 'data', 'cards')

def load_card_data(card_file_path):
    """Load card data from JSON file"""
    try:
        with open(card_file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading {card_file_path}: {e}")
        return None

def save_card_data(card_file_path, card_data):
    """Save card data to JSON file"""
    try:
        with open(card_file_path, 'w', encoding='utf-8') as f:
            json.dump(card_data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error saving {card_file_path}: {e}")
        return False

def find_cards_with_prompts():
    """Find all card files that have generatedPrompts"""
    cards_dir = get_cards_directory()
    
    if not os.path.exists(cards_dir):
        print(f"❌ Cards directory not found: {cards_dir}")
        return []
    
    cards_with_prompts = []
    
    for filename in os.listdir(cards_dir):
        if not filename.endswith('.json'):
            continue
            
        file_path = os.path.join(cards_dir, filename)
        card_data = load_card_data(file_path)
        
        if not card_data:
            continue
            
        # Check if card has generatedPrompts
        if card_data.get('generatedPrompts'):
            cards_with_prompts.append({
                'file_path': file_path,
                'filename': filename,
                'card_data': card_data
            })
    
    return cards_with_prompts

def reset_card(card_info):
    """Reset a single card by removing generated prompts"""
    card_data = card_info['card_data']
    file_path = card_info['file_path']
    filename = card_info['filename']
    
    # Get card ID
    card_id = card_data.get('id', filename.replace('.json', ''))
    
    print(f"🔄 Resetting card: {card_id}")
    
    # Remove generated prompts
    if 'generatedPrompts' in card_data:
        del card_data['generatedPrompts']
    
    # Save updated card data
    if save_card_data(file_path, card_data):
        print(f"✅ Successfully reset card: {card_id}")
        return True
    else:
        print(f"❌ Failed to reset card: {card_id}")
        return False

def main():
    """Main reset function"""
    print("🔄 Starting reset of artificially generated prompts...")
    print("=" * 60)
    
    # Find cards with prompts
    print("🔍 Finding cards with generatedPrompts...")
    cards_to_reset = find_cards_with_prompts()
    
    if not cards_to_reset:
        print("✅ No cards found with generatedPrompts to reset!")
        return
    
    print(f"📊 Found {len(cards_to_reset)} cards that have generatedPrompts")
    print()
    
    # Ask for confirmation
    response = input(f"Do you want to reset {len(cards_to_reset)} cards? (y/N): ").strip().lower()
    if response not in ['y', 'yes']:
        print("❌ Reset cancelled by user")
        return
    
    print()
    print("🔄 Starting reset...")
    print("-" * 40)
    
    # Reset each card
    successful_resets = 0
    failed_resets = 0
    
    for i, card_info in enumerate(cards_to_reset, 1):
        print(f"\n[{i}/{len(cards_to_reset)}]", end=" ")
        
        if reset_card(card_info):
            successful_resets += 1
        else:
            failed_resets += 1
    
    # Summary
    print()
    print("=" * 60)
    print("📊 Reset Summary:")
    print(f"   ✅ Successful resets: {successful_resets}")
    print(f"   ❌ Failed resets: {failed_resets}")
    print(f"   📁 Total cards processed: {len(cards_to_reset)}")
    
    if successful_resets > 0:
        print()
        print("🎉 Reset completed! Cards are now ready for AI-powered migration.")
        print("💡 You can now run: python3 migrate_add_generated_prompts_ai.py")

if __name__ == "__main__":
    main() 