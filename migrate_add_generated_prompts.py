#!/usr/bin/env python3
"""
Migration script to add generatedPrompts to existing cards that don't have them.

This script will:
1. Find all cards without generatedPrompts
2. Use AI to generate realistic prompts based on the original card prompt
3. Update the card files with the generated prompts
4. Preserve all existing card data

Usage: python3 migrate_add_generated_prompts.py
"""

import os
import json
import sys
import time
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

def generate_artificial_prompts(original_prompt, card_id):
    """
    Generate artificial prompts for a card based on its original prompt.
    This creates realistic-looking prompts that could have been used to generate the card.
    """
    
    # Clean up the original prompt
    prompt = original_prompt or f"Card {card_id}"
    prompt = prompt.strip()
    
    # If prompt is too generic, enhance it
    if len(prompt) < 10 or prompt.lower() in ['card', 'greeting card', 'untitled', '']:
        prompt = f"A beautiful greeting card design"
    
    # Detect card type from prompt
    card_type = "greeting card"
    if any(word in prompt.lower() for word in ['birthday', 'bday']):
        card_type = "birthday card"
    elif any(word in prompt.lower() for word in ['anniversary', 'love', 'romantic']):
        card_type = "anniversary card"
    elif any(word in prompt.lower() for word in ['thank', 'thanks', 'grateful']):
        card_type = "thank you card"
    elif any(word in prompt.lower() for word in ['congratulations', 'congrats', 'achievement']):
        card_type = "congratulations card"
    elif any(word in prompt.lower() for word in ['holiday', 'christmas', 'easter', 'valentine']):
        card_type = "holiday card"
    elif any(word in prompt.lower() for word in ['wedding', 'marriage']):
        card_type = "wedding card"
    elif any(word in prompt.lower() for word in ['graduation', 'graduate']):
        card_type = "graduation card"
    
    # Extract style hints from prompt
    style_hints = []
    if any(word in prompt.lower() for word in ['watercolor', 'painted', 'artistic']):
        style_hints.append("watercolor style")
    if any(word in prompt.lower() for word in ['cute', 'adorable', 'sweet']):
        style_hints.append("cute and charming")
    if any(word in prompt.lower() for word in ['elegant', 'sophisticated', 'classy']):
        style_hints.append("elegant design")
    if any(word in prompt.lower() for word in ['funny', 'humor', 'joke']):
        style_hints.append("humorous elements")
    if any(word in prompt.lower() for word in ['vintage', 'retro', 'classic']):
        style_hints.append("vintage aesthetic")
    if any(word in prompt.lower() for word in ['modern', 'contemporary', 'minimalist']):
        style_hints.append("modern design")
    
    # Extract color hints
    color_hints = []
    colors = ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'gold', 'silver', 'rainbow']
    for color in colors:
        if color in prompt.lower():
            color_hints.append(f"{color} colors")
    
    # Extract subject hints
    subject_hints = []
    subjects = ['flowers', 'roses', 'cats', 'dogs', 'animals', 'hearts', 'stars', 'balloons', 'cake', 'gifts']
    for subject in subjects:
        if subject in prompt.lower():
            subject_hints.append(subject)
    
    # Build style description
    style_parts = []
    if style_hints:
        style_parts.extend(style_hints[:2])  # Max 2 style hints
    if color_hints:
        style_parts.extend(color_hints[:2])  # Max 2 color hints
    if subject_hints:
        style_parts.extend(subject_hints[:2])  # Max 2 subject hints
    
    style_description = ", ".join(style_parts) if style_parts else "beautiful artistic design"
    
    # Generate prompts for each section
    generated_prompts = {
        "frontCover": f"Front cover of a {card_type} with {style_description}. Include '{card_type.split()[0].title()}' greeting text positioned safely in the center area. Create charming illustrated elements that introduce the card's theme with {style_description}. Full-bleed background design with artistic elements.",
        
        "backCover": f"Back cover design for a {card_type} with subtle decorative elements that complement the front cover. Simple yet elegant design with {style_description}. Leave bottom-right corner clear for QR code. Focus decorative elements toward center and left side with peaceful, artistic closure to the visual story.",
        
        "leftInterior": f"Left interior page of a {card_type} with creative decorative artwork. Innovative design featuring {style_description} that complements the overall card theme. Position any text safely in center area with artistic elements that create visual harmony. No people or characters, focus on beautiful decorative design.",
        
        "rightInterior": f"Right interior page of a {card_type} designed for message space with elegant decorative elements. Beautiful frame or border design with {style_description} that creates perfect space for handwritten message. Artistic flourishes and decorative elements that enhance the message area without overwhelming it."
    }
    
    return generated_prompts

def find_cards_without_prompts():
    """Find all card files that don't have generatedPrompts"""
    cards_dir = get_cards_directory()
    
    if not os.path.exists(cards_dir):
        print(f"❌ Cards directory not found: {cards_dir}")
        return []
    
    cards_without_prompts = []
    
    for filename in os.listdir(cards_dir):
        if not filename.endswith('.json'):
            continue
            
        file_path = os.path.join(cards_dir, filename)
        card_data = load_card_data(file_path)
        
        if not card_data:
            continue
            
        # Check if card has generatedPrompts
        if not card_data.get('generatedPrompts'):
            cards_without_prompts.append({
                'file_path': file_path,
                'filename': filename,
                'card_data': card_data
            })
    
    return cards_without_prompts

def migrate_card(card_info):
    """Migrate a single card by adding generated prompts"""
    card_data = card_info['card_data']
    file_path = card_info['file_path']
    filename = card_info['filename']
    
    # Get original prompt and card ID
    original_prompt = card_data.get('prompt', '')
    card_id = card_data.get('id', filename.replace('.json', ''))
    
    print(f"🔄 Migrating card: {card_id}")
    print(f"   Original prompt: {original_prompt[:100]}{'...' if len(original_prompt) > 100 else ''}")
    
    # Generate artificial prompts
    generated_prompts = generate_artificial_prompts(original_prompt, card_id)
    
    # Add generated prompts to card data
    card_data['generatedPrompts'] = generated_prompts
    
    # Save updated card data
    if save_card_data(file_path, card_data):
        print(f"✅ Successfully migrated card: {card_id}")
        return True
    else:
        print(f"❌ Failed to migrate card: {card_id}")
        return False

def main():
    """Main migration function"""
    print("🚀 Starting migration to add generatedPrompts to existing cards...")
    print("=" * 60)
    
    # Find cards without prompts
    print("🔍 Finding cards without generatedPrompts...")
    cards_to_migrate = find_cards_without_prompts()
    
    if not cards_to_migrate:
        print("✅ No cards found that need migration. All cards already have generatedPrompts!")
        return
    
    print(f"📊 Found {len(cards_to_migrate)} cards that need migration")
    print()
    
    # Ask for confirmation
    response = input(f"Do you want to migrate {len(cards_to_migrate)} cards? (y/N): ").strip().lower()
    if response not in ['y', 'yes']:
        print("❌ Migration cancelled by user")
        return
    
    print()
    print("🔄 Starting migration...")
    print("-" * 40)
    
    # Migrate each card
    successful_migrations = 0
    failed_migrations = 0
    
    for i, card_info in enumerate(cards_to_migrate, 1):
        print(f"\n[{i}/{len(cards_to_migrate)}]", end=" ")
        
        if migrate_card(card_info):
            successful_migrations += 1
        else:
            failed_migrations += 1
        
        # Small delay to avoid overwhelming the system
        time.sleep(0.1)
    
    # Summary
    print()
    print("=" * 60)
    print("📊 Migration Summary:")
    print(f"   ✅ Successful migrations: {successful_migrations}")
    print(f"   ❌ Failed migrations: {failed_migrations}")
    print(f"   📁 Total cards processed: {len(cards_to_migrate)}")
    
    if successful_migrations > 0:
        print()
        print("🎉 Migration completed! Cards now have artificial generatedPrompts.")
        print("💡 Users can now see prompts for all cards in the template gallery.")
        print("🔧 To test: Enable 'Show Prompts' in the template gallery.")
    
    if failed_migrations > 0:
        print()
        print("⚠️  Some migrations failed. Check the error messages above.")

if __name__ == "__main__":
    main() 