#!/usr/bin/env python3
"""
AI-Powered Migration script to add generatedPrompts to existing cards.

This script will:
1. Find all cards without generatedPrompts
2. Use AI vision to analyze the actual card images
3. Generate realistic prompts based on what the AI sees in each image
4. Update the card files with the AI-generated prompts
5. Preserve all existing card data

Usage: python3 migrate_add_generated_prompts_ai.py
"""

import os
import json
import sys
import time
import asyncio
import requests
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

async def analyze_card_image_with_ai(image_url, section_name, original_prompt):
    """
    Use AI vision to analyze a card image and generate a realistic prompt
    that could have been used to create this image.
    """
    try:
        # Create analysis prompt based on section
        if section_name == "frontCover":
            analysis_prompt = f"""Analyze this greeting card front cover image and create a detailed image generation prompt that could have been used to create this exact image.

Original card context: "{original_prompt}"

Focus on:
- The overall artistic style (watercolor, digital art, cartoon, realistic, etc.)
- Colors and color palette used
- Main subjects and elements visible
- Text content and typography style
- Layout and composition
- Mood and atmosphere
- Any decorative elements or patterns

Create a detailed prompt that starts with "Front cover of a [card type] with..." and includes specific details about the artistic style, colors, subjects, text placement, and visual elements you can see in this image. Be specific about what you observe.

Return only the image generation prompt, no explanations."""

        elif section_name == "backCover":
            analysis_prompt = f"""Analyze this greeting card back cover image and create a detailed image generation prompt that could have been used to create this exact image.

Original card context: "{original_prompt}"

Focus on:
- The overall artistic style and how it complements the front
- Colors and decorative elements
- Layout and composition (noting QR code placement if visible)
- Any text or design elements
- How it provides closure to the card's visual story

Create a detailed prompt that starts with "Back cover design for a [card type] with..." and describes the specific artistic elements, colors, and design choices you can see. Note if there's space reserved for QR codes.

Return only the image generation prompt, no explanations."""

        elif section_name == "leftInterior":
            analysis_prompt = f"""Analyze this greeting card left interior page and create a detailed image generation prompt that could have been used to create this exact image.

Original card context: "{original_prompt}"

Focus on:
- The creative decorative artwork and design elements
- Artistic style and techniques used
- Colors and visual harmony
- Any text, quotes, or decorative typography
- Layout and composition
- How it complements the overall card theme

Create a detailed prompt that starts with "Left interior page of a [card type] with..." and describes the specific artistic elements, style, and design choices you observe.

Return only the image generation prompt, no explanations."""

        else:  # rightInterior
            analysis_prompt = f"""Analyze this greeting card right interior page and create a detailed image generation prompt that could have been used to create this exact image.

Original card context: "{original_prompt}"

Focus on:
- The message area design and decorative elements
- How space is created for handwritten messages
- Artistic style of borders, frames, or flourishes
- Colors and design elements
- Typography style if there's printed text
- How it balances decoration with message space

Create a detailed prompt that starts with "Right interior page of a [card type] designed for message space with..." and describes the specific design elements you observe.

Return only the image generation prompt, no explanations."""

        # Call the AI image analysis API
        response = requests.post('https://vibecarding.com/internal/call_mcp_tool', json={
            'tool_name': 'analyze_images',
            'arguments': {
                'urls': [image_url],
                'analysis_prompt': analysis_prompt
            }
        }, timeout=30)

        if response.status_code != 200:
            print(f"❌ AI analysis API error: {response.status_code}")
            return None

        data = response.json()
        if data.get('error') and data['error'] not in ['None', None]:
            print(f"❌ AI analysis error: {data['error']}")
            return None

        # Parse the result
        result = data.get('result')
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except:
                print(f"❌ Failed to parse AI response JSON")
                return None

        if result.get('status') != 'success':
            print(f"❌ AI analysis failed: {result.get('message', 'Unknown error')}")
            return None

        # Extract the analysis from the first result
        results = result.get('results', [])
        if not results or len(results) == 0:
            print(f"❌ No analysis results returned")
            return None

        first_result = results[0]
        if first_result.get('status') != 'success':
            print(f"❌ Analysis failed: {first_result.get('message', 'Unknown error')}")
            return None

        analysis = first_result.get('analysis', '').strip()
        if not analysis:
            print(f"❌ Empty analysis returned")
            return None

        print(f"✅ AI analysis complete for {section_name}")
        return analysis

    except Exception as e:
        print(f"❌ Error analyzing {section_name} image: {e}")
        return None

async def generate_ai_prompts_for_card(card_data, card_id):
    """
    Generate AI-analyzed prompts for all sections of a card
    """
    print(f"🤖 Using AI to analyze card images: {card_id}")
    
    original_prompt = card_data.get('prompt', f'Card {card_id}')
    
    # Get image URLs
    front_cover_url = card_data.get('frontCover')
    back_cover_url = card_data.get('backCover')
    left_page_url = card_data.get('leftPage')
    right_page_url = card_data.get('rightPage')
    
    generated_prompts = {}
    
    # Analyze each section that has an image
    sections = [
        ('frontCover', front_cover_url),
        ('backCover', back_cover_url),
        ('leftInterior', left_page_url),
        ('rightInterior', right_page_url)
    ]
    
    for section_name, image_url in sections:
        if not image_url:
            print(f"⚠️ No image URL for {section_name}, skipping")
            continue
            
        print(f"  🔍 Analyzing {section_name}...")
        
        # Analyze with AI
        ai_prompt = await analyze_card_image_with_ai(image_url, section_name, original_prompt)
        
        if ai_prompt:
            generated_prompts[section_name] = ai_prompt
            print(f"  ✅ Generated prompt for {section_name}: {ai_prompt[:100]}...")
        else:
            print(f"  ❌ Failed to generate prompt for {section_name}")
            # Fallback to a basic prompt
            generated_prompts[section_name] = f"Unable to analyze {section_name} image - {original_prompt}"
    
    if not generated_prompts:
        print(f"❌ No prompts generated for card {card_id}")
        return None
        
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
            
        # Check if card has generatedPrompts and has image URLs
        if not card_data.get('generatedPrompts'):
            # Only include cards that have at least one image URL
            if any([card_data.get('frontCover'), card_data.get('backCover'), 
                   card_data.get('leftPage'), card_data.get('rightPage')]):
                cards_without_prompts.append({
                    'file_path': file_path,
                    'filename': filename,
                    'card_data': card_data
                })
    
    return cards_without_prompts

async def migrate_card_with_ai(card_info):
    """Migrate a single card by adding AI-generated prompts"""
    card_data = card_info['card_data']
    file_path = card_info['file_path']
    filename = card_info['filename']
    
    # Get original prompt and card ID
    original_prompt = card_data.get('prompt', '')
    card_id = card_data.get('id', filename.replace('.json', ''))
    
    print(f"🔄 Migrating card with AI analysis: {card_id}")
    print(f"   Original prompt: {original_prompt[:100]}{'...' if len(original_prompt) > 100 else ''}")
    
    # Generate AI-analyzed prompts
    generated_prompts = await generate_ai_prompts_for_card(card_data, card_id)
    
    if not generated_prompts:
        print(f"❌ Failed to generate AI prompts for card: {card_id}")
        return False
    
    # Add generated prompts to card data
    card_data['generatedPrompts'] = generated_prompts
    
    # Save updated card data
    if save_card_data(file_path, card_data):
        print(f"✅ Successfully migrated card with AI prompts: {card_id}")
        return True
    else:
        print(f"❌ Failed to save migrated card: {card_id}")
        return False

async def main():
    """Main migration function"""
    print("🤖 Starting AI-powered migration to add generatedPrompts to existing cards...")
    print("=" * 70)
    
    # Find cards without prompts
    print("🔍 Finding cards without generatedPrompts that have images...")
    cards_to_migrate = find_cards_without_prompts()
    
    if not cards_to_migrate:
        print("✅ No cards found that need AI migration. All cards already have generatedPrompts!")
        return
    
    print(f"📊 Found {len(cards_to_migrate)} cards with images that need AI analysis")
    print()
    
    # Ask for confirmation
    print("⚠️ This will use AI to analyze card images and may take several minutes.")
    response = input(f"Do you want to migrate {len(cards_to_migrate)} cards with AI analysis? (y/N): ").strip().lower()
    if response not in ['y', 'yes']:
        print("❌ Migration cancelled by user")
        return
    
    print()
    print("🤖 Starting AI-powered migration...")
    print("-" * 50)
    
    # Migrate each card
    successful_migrations = 0
    failed_migrations = 0
    
    for i, card_info in enumerate(cards_to_migrate, 1):
        print(f"\n[{i}/{len(cards_to_migrate)}]", end=" ")
        
        try:
            if await migrate_card_with_ai(card_info):
                successful_migrations += 1
            else:
                failed_migrations += 1
        except Exception as e:
            print(f"❌ Error migrating card: {e}")
            failed_migrations += 1
        
        # Small delay to avoid overwhelming the AI API
        await asyncio.sleep(2)
    
    # Summary
    print()
    print("=" * 70)
    print("📊 AI Migration Summary:")
    print(f"   ✅ Successful AI migrations: {successful_migrations}")
    print(f"   ❌ Failed migrations: {failed_migrations}")
    print(f"   📁 Total cards processed: {len(cards_to_migrate)}")
    
    if successful_migrations > 0:
        print()
        print("🎉 AI migration completed! Cards now have AI-analyzed generatedPrompts.")
        print("💡 Users can now see realistic prompts based on actual card images.")
        print("🔧 To test: Enable 'Show Prompts' in the template gallery.")
        print("🤖 These prompts were generated by AI vision analysis of the actual images!")
    
    if failed_migrations > 0:
        print()
        print("⚠️  Some AI migrations failed. Check the error messages above.")

if __name__ == "__main__":
    asyncio.run(main()) 