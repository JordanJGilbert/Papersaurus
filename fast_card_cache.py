"""
Ultra-fast card caching system to replace slow file system walks
"""
import os
import json
import time
from datetime import datetime
from typing import List, Dict, Optional

class FastCardCache:
    def __init__(self, data_dir: str, cache_duration: int = 1800):  # 30 minutes
        self.data_dir = data_dir
        self.cache_duration = cache_duration
        self._cards = []
        self._last_refresh = 0
        self._is_refreshing = False
    
    def get_all_cards(self, template_mode: bool = False, search: str = "") -> List[Dict]:
        """Get all cards, refreshing cache if needed"""
        now = time.time()
        
        # Refresh cache if expired and not already refreshing
        if (now - self._last_refresh > self.cache_duration and not self._is_refreshing):
            self._refresh_cache()
        
        # Apply search filter if provided
        if search:
            filtered_cards = []
            search_lower = search.lower()
            for card in self._cards:
                prompt = card.get('prompt', '').lower()
                card_id = card.get('id', '').lower()
                if search_lower in prompt or search_lower in card_id:
                    filtered_cards.append(card)
            return filtered_cards
        
        return self._cards
    
    def _refresh_cache(self):
        """Refresh the cache by scanning files"""
        self._is_refreshing = True
        print(f"🔄 Refreshing card cache...")
        start_time = time.time()
        
        cards = []
        file_count = 0
        
        try:
            # Walk through data directory
            for root, _, files in os.walk(self.data_dir):
                for file in files:
                    file_count += 1
                    file_path = os.path.join(root, file)
                    
                    try:
                        with open(file_path, 'r') as f:
                            data = json.load(f)
                        
                        # Check if this is a shared card entry
                        if (data.get('key', '').startswith('shared_card_') and 
                            isinstance(data.get('value'), dict)):
                            
                            card_data = data['value']
                            card_id = data['key'].replace('shared_card_', '')
                            
                            # Skip expired cards
                            if card_data.get('expiresAt', 0) < time.time():
                                continue
                            
                            # Only include cards with images
                            if not any([card_data.get('frontCover'), card_data.get('backCover'), 
                                       card_data.get('leftPage'), card_data.get('rightPage')]):
                                continue
                            
                            # Format creation date
                            created_at = card_data.get('createdAt', 0)
                            created_formatted = datetime.fromtimestamp(created_at).strftime('%B %d, %Y at %I:%M %p') if created_at else 'Unknown'
                            
                            # Generate share URL
                            domain = os.getenv('DOMAIN', 'vibecarding.com')
                            if domain.startswith('https://'):
                                share_url = f"{domain}/card/{card_id}"
                            else:
                                share_url = f"https://{domain}/card/{card_id}"
                            
                            # Create card entry
                            cards.append({
                                'id': card_id,
                                'prompt': card_data.get('prompt', ''),
                                'frontCover': card_data.get('frontCover', ''),
                                'backCover': card_data.get('backCover', ''),
                                'leftPage': card_data.get('leftPage', ''),
                                'rightPage': card_data.get('rightPage', ''),
                                'createdAt': created_at,
                                'createdAtFormatted': created_formatted,
                                'shareUrl': share_url,
                                'hasImages': True  # We already filtered for this
                            })
                            
                    except (json.JSONDecodeError, IOError, KeyError):
                        continue
            
            # Sort by creation time (newest first)
            cards.sort(key=lambda x: x.get('createdAt', 0), reverse=True)
            
            # Update cache
            self._cards = cards
            self._last_refresh = time.time()
            
            elapsed = time.time() - start_time
            print(f"✅ Cache refreshed: {len(cards)} cards from {file_count} files in {elapsed:.2f}s")
            
        except Exception as e:
            print(f"❌ Cache refresh failed: {e}")
        finally:
            self._is_refreshing = False
    
    def force_refresh(self):
        """Force an immediate cache refresh"""
        self._last_refresh = 0
        self._is_refreshing = False
        self._refresh_cache()

# Global cache instance
_cache_instance = None

def get_cache(data_dir: str) -> FastCardCache:
    """Get or create the global cache instance"""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = FastCardCache(data_dir)
    return _cache_instance