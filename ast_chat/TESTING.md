# VibeCarding Testing Guide

## Overview
This guide provides comprehensive testing strategies and tools for the VibeCarding application.

## Test Files Created

### 1. E2E Tests (`__tests__/cardGeneration.e2e.test.tsx`)
Full end-to-end tests that simulate the complete card generation flow:
- Complete wizard navigation
- Time-based progress bar updates
- WebSocket message handling
- Draft and final card generation
- LocalStorage persistence
- Page refresh recovery

### 2. WebSocket Integration Tests (`__tests__/websocket.integration.test.ts`)
Tests WebSocket functionality and progress updates:
- Draft generation progress tracking
- Final card generation and completion
- Disconnection and reconnection handling
- Progress continues during network issues

### 3. Manual Test Page (`manual-test-progress.html`)
Interactive HTML page to test progress bars manually:
- Draft generation progress simulation
- Final card generation progress simulation
- LocalStorage inspector
- Visual progress bars with controls

### 4. API Test Script (`test_api_flow.py`)
Python script to test backend APIs:
- WebSocket connection testing
- Draft generation API
- Final card generation API
- Job status checking

### 5. Debug Utility (`test-debug-util.js`)
Diagnostic tool to check for common issues:
- File pattern checking
- Common bug detection
- Configuration verification
- Quick fix suggestions

## Running Tests

### Install Dependencies
```bash
cd /var/www/flask_app/ast_chat
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# E2E tests
npm test cardGeneration.e2e

# WebSocket tests
npm test websocket.integration

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Manual Testing

#### 1. Progress Bar Testing
Open the manual test page in a browser:
```bash
# In a browser, navigate to:
file:///var/www/flask_app/ast_chat/manual-test-progress.html
```

This allows you to:
- Test time-based progress increments
- Verify progress caps at 95%
- Check LocalStorage persistence
- Simulate completion scenarios

#### 2. API Testing
Run the Python API test:
```bash
cd /var/www/flask_app
python3 test_api_flow.py
```

#### 3. Debug Diagnostics
Run the diagnostic utility:
```bash
cd /var/www/flask_app/ast_chat
node test-debug-util.js
```

## Common Issues and Solutions

### Issue 1: Progress Bar Stuck at 0%
**Symptoms:**
- Progress bar doesn't increment
- Time shows but percentage stays at 0%

**Debug Steps:**
1. Check browser console for errors
2. Verify setInterval is created in useDraftGeneration.ts
3. Check if WebSocket messages are overriding progress
4. Run manual test page to verify progress logic

### Issue 2: "4/5 variations complete" Off-by-One Error
**Symptoms:**
- Shows 4/5 when all 5 drafts are done
- Draft count is incorrect

**Solution:**
Count the updated array including the new draft:
```typescript
const updatedDrafts = [...draftGeneration.draftCards];
updatedDrafts[draftIndex] = draftCard;
const completedCount = updatedDrafts.filter(Boolean).length;
```

### Issue 3: Completed Card Not Showing
**Symptoms:**
- Email confirms completion
- UI doesn't show the card
- Page refresh loses card

**Debug Steps:**
1. Check localStorage for 'lastCompletedCard'
2. Verify CardWizardEffects auto-navigation to Step 6
3. Check if isCardCompleted flag is set
4. Run API test to verify backend response

### Issue 4: WebSocket Disconnections
**Symptoms:**
- Progress stops updating
- No completion messages
- Connection errors in console

**Debug Steps:**
1. Check Network tab > WS for WebSocket status
2. Verify reconnection logic in useWebSocket
3. Check if job subscriptions are maintained
4. Monitor for stale job detection

## Testing Checklist

### Before Testing:
- [ ] Clear browser cache and localStorage
- [ ] Open browser DevTools Console
- [ ] Open Network tab to monitor requests
- [ ] Restart dev server if needed

### During Card Generation:
- [ ] Progress bar starts at 0%
- [ ] Progress increments smoothly
- [ ] Progress caps at 95% until completion
- [ ] Draft count shows correctly (X/5)
- [ ] All 5 drafts appear when complete
- [ ] Can select a draft
- [ ] Final generation starts properly
- [ ] Final card displays when complete
- [ ] Email notification received

### After Generation:
- [ ] Card saved to localStorage
- [ ] Can refresh page and see card
- [ ] Print/Email options work
- [ ] Gallery shows new card

## Performance Testing

### Progress Bar Performance:
- Should update every second
- Should not cause UI lag
- Should handle multiple concurrent generations

### WebSocket Performance:
- Should reconnect within 5 seconds
- Should handle 100+ messages without lag
- Should clean up old subscriptions

## Debugging Tips

### Enable Debug Logging:
Add to browser console:
```javascript
localStorage.setItem('debug', 'true');
```

### Monitor WebSocket:
```javascript
// In browser console
window.addEventListener('message', (e) => {
  if (e.data.type === 'job_update') {
    console.log('WebSocket:', e.data);
  }
});
```

### Check Progress State:
```javascript
// In React DevTools
// Find CardWizard component
// Check cardStudio.progressPercentage
```

## Test Data

### Valid Test Inputs:
- Email: test@example.com
- Card Type: birthday
- Tone: funny
- Message: "Happy Birthday! Hope your day is amazing!"
- To: John
- From: Jane

### Mock Image Data:
- Draft images: 'data:image/jpeg;base64,mockDraft0-4'
- Final images: 'data:image/jpeg;base64,mockFront/Back/Left/Right'

## Continuous Integration

Add to your CI pipeline:
```yaml
- name: Run Tests
  run: |
    npm install
    npm test -- --ci --coverage
    npm run build
```

## Future Test Improvements

1. **Visual Regression Tests**: Add screenshot comparison
2. **Performance Benchmarks**: Track generation times
3. **Load Testing**: Test with 100+ concurrent users
4. **Mobile Testing**: Add touch event tests
5. **Accessibility Tests**: Add a11y compliance checks