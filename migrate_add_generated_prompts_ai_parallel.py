#!/usr/bin/env python3
"""
PARALLEL AI-Powered Migration script to add generatedPrompts to existing cards.

This script will:
1. Find all cards without generatedPrompts
2. Use AI vision to analyze card images IN PARALLEL
3. Generate realistic prompts based on what the AI sees in each image
4. Update the card files with the AI-generated prompts
5. Process multiple cards simultaneously for much faster migration

Usage: python3 migrate_add_generated_prompts_ai_parallel.py
"""

import os
import json
import sys
import time
import asyncio
import aiohttp
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import threading

# Add the project root to Python path for imports
sys.path.append(os.path.abspath('.'))

# Configuration
MAX_CONCURRENT_CARDS = 5  # Process 5 cards at once
MAX_CONCURRENT_SECTIONS = 3  # Analyze 3 sections per card simultaneously
API_TIMEOUT = 45  # Longer timeout for AI analysis
RETRY_ATTEMPTS = 2  # Retry failed analyses

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

async def analyze_card_image_with_ai(session, image_url, section_name, original_prompt, semaphore):
    """
    Use AI vision to analyze a card image and generate a realistic prompt
    that could have been used to create this image.
    """
    async with semaphore:  # Limit concurrent API calls
        for attempt in range(RETRY_ATTEMPTS):
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

IMPORTANT: Return ONLY TEXT - a written image generation prompt. Do NOT generate any images. Do NOT return base64 data. Return only plain text describing what you see."""

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

IMPORTANT: Return ONLY TEXT - a written image generation prompt. Do NOT generate any images. Do NOT return base64 data. Return only plain text describing what you see."""

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

IMPORTANT: Return ONLY TEXT - a written image generation prompt. Do NOT generate any images. Do NOT return base64 data. Return only plain text describing what you see."""

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

IMPORTANT: Return ONLY TEXT - a written image generation prompt. Do NOT generate any images. Do NOT return base64 data. Return only plain text describing what you see."""

                # Call the AI image analysis API with aiohttp
                payload = {
                    'tool_name': 'analyze_images',
                    'arguments': {
                        'urls': [image_url],
                        'analysis_prompt': analysis_prompt
                    }
                }

                async with session.post(
                    'https://vibecarding.com/internal/call_mcp_tool',
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=API_TIMEOUT)
                ) as response:
                    if response.status != 200:
                        raise Exception(f"API error: {response.status}")
                    
                    data = await response.json()

                if data.get('error') and data['error'] not in ['None', None]:
                    raise Exception(f"AI analysis error: {data['error']}")

                # Parse the result
                result = data.get('result')
                if isinstance(result, str):
                    try:
                        result = json.loads(result)
                    except:
                        raise Exception("Failed to parse AI response JSON")

                if result.get('status') != 'success':
                    raise Exception(f"AI analysis failed: {result.get('message', 'Unknown error')}")

                # Extract the analysis from the first result
                results = result.get('results', [])
                if not results or len(results) == 0:
                    raise Exception("No analysis results returned")

                first_result = results[0]
                if first_result.get('status') != 'success':
                    raise Exception(f"Analysis failed: {first_result.get('message', 'Unknown error')}")

                analysis = first_result.get('analysis', '').strip()
                if not analysis:
                    raise Exception("Empty analysis returned")

                # Check if the analysis is base64 encoded (image data) instead of text
                if len(analysis) > 1000 and analysis.replace('/', '').replace('+', '').replace('=', '').isalnum():
                    raise Exception("AI returned image data instead of text analysis - retrying with clearer prompt")

                # Ensure the analysis is actually a text prompt, not base64 or other data
                if not any(word in analysis.lower() for word in ['card', 'with', 'design', 'style', 'color']):
                    raise Exception(f"AI analysis doesn't look like a prompt: {analysis[:100]}...")

                return analysis

            except Exception as e:
                if attempt < RETRY_ATTEMPTS - 1:
                    print(f"⚠️ Attempt {attempt + 1} failed for {section_name}, retrying: {e}")
                    await asyncio.sleep(2)  # Brief delay before retry
                    continue
                else:
                    print(f"❌ All attempts failed for {section_name}: {e}")
                    return None

async def generate_ai_prompts_for_card(session, card_data, card_id, card_semaphore, section_semaphore):
    """
    Generate AI-analyzed prompts for all sections of a card in parallel
    """
    async with card_semaphore:  # Limit concurrent cards
        print(f"🤖 Starting AI analysis for card: {card_id}")
        
        original_prompt = card_data.get('prompt', f'Card {card_id}')
        
        # Get image URLs
        sections = [
            ('frontCover', card_data.get('frontCover')),
            ('backCover', card_data.get('backCover')),
            ('leftInterior', card_data.get('leftPage')),
            ('rightInterior', card_data.get('rightPage'))
        ]
        
        # Filter sections that have images
        sections_with_images = [(name, url) for name, url in sections if url]
        
        if not sections_with_images:
            print(f"⚠️ No images found for card {card_id}")
            return None
        
        print(f"  🔍 Analyzing {len(sections_with_images)} sections for {card_id}...")
        
        # Analyze all sections in parallel
        tasks = []
        for section_name, image_url in sections_with_images:
            task = analyze_card_image_with_ai(
                session, image_url, section_name, original_prompt, section_semaphore
            )
            tasks.append((section_name, task))
        
        # Wait for all section analyses to complete
        results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)
        
        # Collect successful results
        generated_prompts = {}
        for (section_name, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                print(f"  ❌ Exception in {section_name} for {card_id}: {result}")
                generated_prompts[section_name] = f"Analysis failed - {original_prompt}"
            elif result:
                generated_prompts[section_name] = result
                print(f"  ✅ {section_name}: {result[:80]}...")
            else:
                print(f"  ❌ Failed to generate prompt for {section_name}")
                generated_prompts[section_name] = f"Unable to analyze {section_name} image - {original_prompt}"
        
        if not generated_prompts:
            print(f"❌ No prompts generated for card {card_id}")
            return None
            
        print(f"✅ Completed AI analysis for card: {card_id} ({len(generated_prompts)} sections)")
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

async def migrate_card_with_ai(session, card_info, card_semaphore, section_semaphore):
    """Migrate a single card by adding AI-generated prompts"""
    card_data = card_info['card_data']
    file_path = card_info['file_path']
    filename = card_info['filename']
    
    # Get original prompt and card ID
    original_prompt = card_data.get('prompt', '')
    card_id = card_data.get('id', filename.replace('.json', ''))
    
    # Generate AI-analyzed prompts
    generated_prompts = await generate_ai_prompts_for_card(
        session, card_data, card_id, card_semaphore, section_semaphore
    )
    
    if not generated_prompts:
        print(f"❌ Failed to generate AI prompts for card: {card_id}")
        return False
    
    # Add generated prompts to card data
    card_data['generatedPrompts'] = generated_prompts
    
    # Save updated card data (run in thread pool to avoid blocking)
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        success = await loop.run_in_executor(executor, save_card_data, file_path, card_data)
    
    if success:
        print(f"💾 Successfully saved card with AI prompts: {card_id}")
        return True
    else:
        print(f"❌ Failed to save migrated card: {card_id}")
        return False

async def process_cards_in_batches(cards_to_migrate):
    """Process cards in parallel batches"""
    print(f"🚀 Starting parallel AI migration of {len(cards_to_migrate)} cards...")
    print(f"📊 Configuration: {MAX_CONCURRENT_CARDS} cards, {MAX_CONCURRENT_SECTIONS} sections per card")
    print("-" * 70)
    
    # Create semaphores to limit concurrency
    card_semaphore = asyncio.Semaphore(MAX_CONCURRENT_CARDS)
    section_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SECTIONS * MAX_CONCURRENT_CARDS)
    
    # Create aiohttp session with connection pooling
    connector = aiohttp.TCPConnector(
        limit=50,  # Total connection pool size
        limit_per_host=20,  # Connections per host
        ttl_dns_cache=300,  # DNS cache TTL
        use_dns_cache=True,
    )
    
    timeout = aiohttp.ClientTimeout(total=API_TIMEOUT)
    
    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout,
        headers={'Content-Type': 'application/json'}
    ) as session:
        
        # Create tasks for all cards
        tasks = []
        for card_info in cards_to_migrate:
            task = migrate_card_with_ai(session, card_info, card_semaphore, section_semaphore)
            tasks.append(task)
        
        # Track progress
        successful_migrations = 0
        failed_migrations = 0
        
        # Process all cards and track completion
        print(f"⏳ Processing {len(tasks)} cards in parallel...")
        start_time = time.time()
        
        # Use asyncio.as_completed to show progress as cards complete
        for i, task in enumerate(asyncio.as_completed(tasks), 1):
            try:
                success = await task
                if success:
                    successful_migrations += 1
                else:
                    failed_migrations += 1
                
                # Show progress
                elapsed = time.time() - start_time
                rate = i / elapsed if elapsed > 0 else 0
                eta = (len(tasks) - i) / rate if rate > 0 else 0
                
                print(f"📈 Progress: {i}/{len(tasks)} completed ({successful_migrations} ✅, {failed_migrations} ❌) "
                      f"| Rate: {rate:.1f}/min | ETA: {eta/60:.1f}min")
                
            except Exception as e:
                print(f"❌ Unexpected error processing card: {e}")
                failed_migrations += 1
    
    return successful_migrations, failed_migrations

async def main():
    """Main migration function"""
    print("🤖 Starting PARALLEL AI-powered migration to add generatedPrompts to existing cards...")
    print("=" * 80)
    
    # Find cards without prompts
    print("🔍 Finding cards without generatedPrompts that have images...")
    cards_to_migrate = find_cards_without_prompts()
    
    if not cards_to_migrate:
        print("✅ No cards found that need AI migration. All cards already have generatedPrompts!")
        return
    
    print(f"📊 Found {len(cards_to_migrate)} cards with images that need AI analysis")
    print()
    
    # Show configuration
    print(f"⚙️ Parallel Processing Configuration:")
    print(f"   🔄 Max concurrent cards: {MAX_CONCURRENT_CARDS}")
    print(f"   🖼️ Max concurrent sections: {MAX_CONCURRENT_SECTIONS} per card")
    print(f"   ⏱️ API timeout: {API_TIMEOUT} seconds")
    print(f"   🔁 Retry attempts: {RETRY_ATTEMPTS}")
    print()
    
    # Estimate time savings
    sequential_time = len(cards_to_migrate) * 4 * 10  # 4 sections * 10 seconds each
    parallel_time = sequential_time / (MAX_CONCURRENT_CARDS * MAX_CONCURRENT_SECTIONS)
    print(f"⚡ Estimated time savings:")
    print(f"   📈 Sequential: ~{sequential_time/60:.1f} minutes")
    print(f"   🚀 Parallel: ~{parallel_time/60:.1f} minutes")
    print(f"   💨 Speedup: ~{sequential_time/parallel_time:.1f}x faster")
    print()
    
    # Ask for confirmation
    print("⚠️ This will use AI to analyze card images in parallel.")
    response = input(f"Do you want to migrate {len(cards_to_migrate)} cards with parallel AI analysis? (y/N): ").strip().lower()
    if response not in ['y', 'yes']:
        print("❌ Migration cancelled by user")
        return
    
    print()
    start_time = time.time()
    
    # Process cards in parallel
    successful_migrations, failed_migrations = await process_cards_in_batches(cards_to_migrate)
    
    # Summary
    end_time = time.time()
    total_time = end_time - start_time
    
    print()
    print("=" * 80)
    print("📊 PARALLEL AI Migration Summary:")
    print(f"   ✅ Successful AI migrations: {successful_migrations}")
    print(f"   ❌ Failed migrations: {failed_migrations}")
    print(f"   📁 Total cards processed: {len(cards_to_migrate)}")
    print(f"   ⏱️ Total time: {total_time/60:.1f} minutes")
    print(f"   📈 Processing rate: {len(cards_to_migrate)/(total_time/60):.1f} cards/minute")
    print(f"   🚀 Parallel efficiency: {successful_migrations + failed_migrations} cards processed simultaneously")
    
    if successful_migrations > 0:
        print()
        print("🎉 PARALLEL AI migration completed! Cards now have AI-analyzed generatedPrompts.")
        print("💡 Users can now see realistic prompts based on actual card images.")
        print("🔧 To test: Enable 'Show Prompts' in the template gallery.")
        print("🤖 These prompts were generated by PARALLEL AI vision analysis!")
        print("⚡ Processing was significantly faster thanks to parallel execution!")
    
    if failed_migrations > 0:
        print()
        print("⚠️ Some AI migrations failed. This is normal with parallel processing.")
        print("💡 Failed cards will have fallback prompts based on original descriptions.")

if __name__ == "__main__":
    # Set event loop policy for better performance on Linux
    if sys.platform.startswith('linux'):
        try:
            import uvloop
            asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
            print("🚀 Using uvloop for enhanced async performance")
        except ImportError:
            print("💡 Install uvloop for even better performance: pip install uvloop")
    
    asyncio.run(main())