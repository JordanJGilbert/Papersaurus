#!/usr/bin/env python3
"""
Generate a static JSON file containing all card data for fast frontend access.
Run this script periodically or after new cards are added.
"""

import json
import sqlite3
import os
from datetime import datetime

def generate_cards_json():
    """Generate cards.json file with all card data"""
    
    # Connect to database
    db_path = os.path.join(os.path.dirname(__file__), 'vibecarding.db')
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    
    try:
        cursor = conn.cursor()
        
        # Query all cards with images
        cursor.execute("""
            SELECT 
                id,
                prompt,
                front_cover,
                back_cover,
                left_page,
                right_page,
                created_at,
                share_url
            FROM generated_cards 
            WHERE (front_cover IS NOT NULL OR back_cover IS NOT NULL 
                   OR left_page IS NOT NULL OR right_page IS NOT NULL)
            ORDER BY created_at DESC
        """)
        
        cards = []
        for row in cursor.fetchall():
            # Format the created_at timestamp
            try:
                created_timestamp = float(row['created_at'])
                created_date = datetime.fromtimestamp(created_timestamp)
                formatted_date = created_date.strftime("%B %d, %Y at %I:%M %p")
            except (ValueError, TypeError):
                formatted_date = "Unknown date"
            
            # Determine if card has images
            has_images = any([
                row['front_cover'],
                row['back_cover'], 
                row['left_page'],
                row['right_page']
            ])
            
            # Build share URL if not present
            share_url = row['share_url']
            if not share_url:
                share_url = f"https://vibecarding.com/card/{row['id']}"
            
            card_data = {
                "id": row['id'],
                "prompt": row['prompt'] or "Untitled Card",
                "frontCover": row['front_cover'],
                "backCover": row['back_cover'],
                "leftPage": row['left_page'],
                "rightPage": row['right_page'],
                "createdAt": created_timestamp,
                "createdAtFormatted": formatted_date,
                "shareUrl": share_url,
                "hasImages": has_images
            }
            
            cards.append(card_data)
        
        # Generate the JSON data
        json_data = {
            "cards": cards,
            "totalCount": len(cards),
            "lastUpdated": datetime.now().isoformat(),
            "version": "1.0"
        }
        
        # Write to static file
        output_path = os.path.join(os.path.dirname(__file__), 'static', 'cards.json')
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Generated cards.json with {len(cards)} cards")
        print(f"📁 Saved to: {output_path}")
        print(f"📊 File size: {os.path.getsize(output_path) / 1024:.1f} KB")
        
        # Also create a minimal version for faster loading
        minimal_cards = []
        for card in cards[:50]:  # First 50 cards for quick preview
            minimal_card = {
                "id": card["id"],
                "prompt": card["prompt"][:100] + "..." if len(card["prompt"]) > 100 else card["prompt"],
                "frontCover": card["frontCover"],
                "createdAtFormatted": card["createdAtFormatted"],
                "hasImages": card["hasImages"]
            }
            minimal_cards.append(minimal_card)
        
        minimal_data = {
            "cards": minimal_cards,
            "totalCount": len(cards),
            "isPreview": True,
            "lastUpdated": datetime.now().isoformat()
        }
        
        minimal_path = os.path.join(os.path.dirname(__file__), 'static', 'cards-preview.json')
        with open(minimal_path, 'w', encoding='utf-8') as f:
            json.dump(minimal_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Generated cards-preview.json with {len(minimal_cards)} cards")
        print(f"📁 Saved to: {minimal_path}")
        print(f"📊 File size: {os.path.getsize(minimal_path) / 1024:.1f} KB")
        
    except Exception as e:
        print(f"❌ Error generating cards JSON: {e}")
        
    finally:
        conn.close()

if __name__ == "__main__":
    generate_cards_json()