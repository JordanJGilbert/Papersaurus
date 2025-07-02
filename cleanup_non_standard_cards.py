#!/usr/bin/env python3
"""
Script to delete all cards that are not 1024x1536 dimensions.
This will keep only the standard 5×7 greeting card format.
"""

import requests
import json
import sys
from PIL import Image
import io
from typing import List, Tuple

# Configuration
BACKEND_URL = "http://localhost:5000"
TARGET_DIMENSIONS = (1024, 1536)

def get_all_cards() -> List[dict]:
    """Fetch all cards from the API"""
    try:
        response = requests.get(f"{BACKEND_URL}/api/cards/list?per_page=1000")
        if response.status_code == 200:
            data = response.json()
            if data['status'] == 'success':
                return data['cards']
        return []
    except Exception as e:
        print(f"❌ Error fetching cards: {e}")
        return []

def get_image_dimensions(image_url: str) -> Tuple[int, int] | None:
    """Get dimensions of an image from URL"""
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code == 200:
            img = Image.open(io.BytesIO(response.content))
            return img.size
        return None
    except Exception as e:
        print(f"⚠️ Error getting dimensions for {image_url}: {e}")
        return None

def delete_card(card_id: str) -> bool:
    """Delete a single card"""
    try:
        response = requests.delete(f"{BACKEND_URL}/api/cards/delete/{card_id}")
        if response.status_code == 200:
            result = response.json()
            return result['status'] == 'success'
        return False
    except Exception as e:
        print(f"❌ Error deleting card {card_id}: {e}")
        return False

def main():
    print("🔍 Analyzing cards for non-standard dimensions...")
    print(f"📏 Target dimensions: {TARGET_DIMENSIONS[0]}x{TARGET_DIMENSIONS[1]}")
    print("=" * 60)
    
    # Get all cards
    cards = get_all_cards()
    if not cards:
        print("❌ No cards found or error fetching cards")
        return
    
    print(f"📊 Found {len(cards)} total cards")
    
    # Analyze dimensions
    cards_to_delete = []
    cards_to_keep = []
    analysis_failed = []
    
    for i, card in enumerate(cards, 1):
        print(f"🔍 Analyzing card {i}/{len(cards)}: {card['id']}")
        
        # Check front cover dimensions
        if card.get('frontCover'):
            dimensions = get_image_dimensions(card['frontCover'])
            if dimensions:
                width, height = dimensions
                print(f"   📐 Dimensions: {width}x{height}")
                
                if (width, height) == TARGET_DIMENSIONS:
                    cards_to_keep.append(card)
                    print(f"   ✅ KEEP - Standard dimensions")
                else:
                    cards_to_delete.append(card)
                    print(f"   🗑️ DELETE - Non-standard dimensions")
            else:
                analysis_failed.append(card)
                cards_to_delete.append(card)  # Also delete failed analysis cards
                print(f"   🗑️ DELETE - Failed to analyze dimensions")
        else:
            analysis_failed.append(card)
            cards_to_delete.append(card)  # Also delete cards with no front cover
            print(f"   🗑️ DELETE - No front cover image")
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 ANALYSIS SUMMARY:")
    print(f"   ✅ Cards to KEEP (1024x1536): {len(cards_to_keep)}")
    print(f"   🗑️ Cards to DELETE (non-standard + failed): {len(cards_to_delete)}")
    print(f"   📊 Failed analysis (included in delete): {len(analysis_failed)}")
    print(f"   📊 Total cards: {len(cards)}")
    
    if not cards_to_delete:
        print("\n🎉 All cards are already standard dimensions! Nothing to delete.")
        return
    
    # Show what will be deleted
    print(f"\n🗑️ CARDS TO BE DELETED ({len(cards_to_delete)}):")
    for i, card in enumerate(cards_to_delete[:10]):  # Show first 10
        if card.get('frontCover'):
            dimensions = get_image_dimensions(card['frontCover'])
            dim_str = f"{dimensions[0]}x{dimensions[1]}" if dimensions else "failed analysis"
        else:
            dim_str = "no image"
        print(f"   • {card['id']} ({dim_str}) - {card['prompt'][:50]}...")
    
    if len(cards_to_delete) > 10:
        print(f"   ... and {len(cards_to_delete) - 10} more cards")
    
    # Confirmation
    print(f"\n⚠️ WARNING: This will permanently delete {len(cards_to_delete)} cards!")
    print("This includes cards with non-standard dimensions AND cards with broken/missing images.")
    print("This action cannot be undone.")
    
    confirm = input("\nType 'DELETE ALL NON-STANDARD AND FAILED' to confirm: ")
    if confirm != "DELETE ALL NON-STANDARD AND FAILED":
        print("❌ Operation cancelled.")
        return
    
    # Delete cards
    print(f"\n🗑️ Deleting {len(cards_to_delete)} non-standard and failed cards...")
    deleted_count = 0
    failed_deletes = []
    
    for i, card in enumerate(cards_to_delete, 1):
        print(f"🗑️ Deleting {i}/{len(cards_to_delete)}: {card['id']}")
        
        if delete_card(card['id']):
            deleted_count += 1
            print(f"   ✅ Deleted successfully")
        else:
            failed_deletes.append(card['id'])
            print(f"   ❌ Failed to delete")
    
    # Final summary
    print("\n" + "=" * 60)
    print("🎉 CLEANUP COMPLETE!")
    print(f"   ✅ Successfully deleted: {deleted_count} cards")
    print(f"   ❌ Failed to delete: {len(failed_deletes)} cards")
    print(f"   🏠 Remaining cards: {len(cards_to_keep)} (all 1024x1536)")
    
    if failed_deletes:
        print(f"\n❌ Failed to delete these cards:")
        for card_id in failed_deletes:
            print(f"   • {card_id}")
    
    print(f"\n📊 Final card count should be: {len(cards_to_keep)}")
    print("🎯 All remaining cards are now standard 1024x1536 dimensions!")

if __name__ == "__main__":
    main() 