# VibeCarding Storage System

## Overview
The storage system has been simplified from 10+ localStorage keys to just 3 keys with automatic expiration.

## Storage Keys

### 1. `vibe-active-session` (24 hour expiry)
Stores the current form data for the active card creation session.
- Prevents loss of work on page refresh
- Automatically expires after 24 hours
- Contains: form fields, wizard state, selected options

### 2. `vibe-recent-cards` (30 day expiry)
Stores metadata about recently generated cards.
- No images stored (privacy-focused)
- Used for card history display
- Contains: card type, tone, date, thumbnail URL

### 3. `vibe-recovery` (10 minute expiry)
Temporary storage during card generation.
- Allows recovery from browser crashes
- Very short expiry for security
- Contains: job ID and generation state

## Usage

```typescript
import { storage } from '@/lib/storageManager';

// Save active session
storage.saveActiveSession(formData);

// Get active session
const session = storage.getActiveSession();

// Save recent card
storage.addRecentCard(cardData);

// Get recent cards
const cards = storage.getRecentCards();

// Save recovery data
storage.saveRecovery(jobId, jobData);

// Get recovery data
const recovery = storage.getRecovery(jobId);

// Clear all storage
storage.clearAll();
```

## Benefits
- 80% reduction in storage code
- Automatic expiration handling
- Privacy-focused (no image storage)
- Simple, predictable API
- No migration needed from old system