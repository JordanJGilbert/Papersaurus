# Photo Analysis Feature Fix Plan

## Current Status
The photo analysis feature is not working in production. The UI shows "Photo analysis not available" when uploading reference photos.

## Issues Identified

### 1. Code Issues (FIXED)
- ✅ Mock data was being returned instead of real AI analysis
- ✅ useEffect dependencies preventing photo analysis from triggering
- ✅ Duplicate useEffect hooks
- ✅ Overly strict modal rendering conditions

### 2. Deployment Issues (PENDING)
- ❌ Changes not reflecting in production
- ❌ Next.js hot reload showing duplicate UI
- ❌ Script loading errors in browser console

## Root Cause Analysis
The photo analysis feature has two main problems:
1. **Code Logic**: The analyzePhoto function was returning mock data and effects weren't triggering properly
2. **Deployment**: Changes aren't being properly deployed to production

## Fix Implementation

### Already Completed
1. **useFileHandling.ts**:
   - Removed mock data return in catch block
   - Now returns null on error to show proper error state

2. **Step3Personalization.tsx**:
   - Simplified useEffect dependencies
   - Removed duplicate photo analysis effect
   - Added error handling with catch block
   - Simplified modal rendering conditions
   - Added optional chaining for callbacks

3. **PhotoAnalysisModal.tsx**:
   - Added debug logging to track state

### Next Steps

1. **Rebuild and Deploy**:
   ```bash
   cd /var/www/flask_app/ast_chat
   npm run build
   sudo systemctl restart vibecarding.service
   ```

2. **Verify Backend Integration**:
   - Check if `/internal/call_mcp_tool` endpoint is working
   - Verify `ai_chat` tool accepts image attachments
   - Test with a simple curl command

3. **Debug Photo Analysis Flow**:
   - Check browser console for debug logs
   - Monitor network tab for API calls
   - Verify image URLs are being passed correctly

4. **Test End-to-End**:
   - Upload test image
   - Check if modal opens
   - Monitor console for "📸 Starting photo analysis" log
   - Verify API call to `/internal/call_mcp_tool`
   - Check response and error handling

## Testing Checklist

- [ ] Kill existing Next.js processes
- [ ] Run `npm run build`
- [ ] Restart vibecarding service
- [ ] Clear browser cache
- [ ] Navigate to Step 3
- [ ] Upload test image (/var/www/flask_app/ast_chat/test_image.jpg)
- [ ] Check browser console for debug logs
- [ ] Verify modal shows analyzing state
- [ ] Check if AI analysis completes
- [ ] Test person selection UI
- [ ] Verify selected people are saved

## Debug Commands

```bash
# Check service status
sudo systemctl status vibecarding.service

# View service logs
sudo journalctl -u vibecarding.service -f

# Check if backend is running
curl http://localhost:5001/health

# Test AI endpoint directly
curl -X POST http://localhost:5001/internal/call_mcp_tool \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"ai_chat","arguments":{"messages":"Test","model":"gemini-2.5-pro"}}'
```

## Expected Behavior
1. User uploads photo in Step 3
2. Modal opens immediately
3. Shows "Analyzing your photo..." with spinner
4. AI analyzes photo and returns people data
5. Modal shows detected people with selection UI
6. User can name people and specify relationships
7. Selected people data is saved for card generation

## Files Modified
- `/var/www/flask_app/ast_chat/hooks/cardStudio/useFileHandling.ts`
- `/var/www/flask_app/ast_chat/components/wizard/steps/Step3Personalization.tsx`
- `/var/www/flask_app/ast_chat/components/wizard/PhotoAnalysisModal.tsx`

## Notes
- The feature uses Gemini 2.5 Pro for vision analysis
- Image is sent as base64 in the attachments array
- Response includes structured JSON with people details
- Modal should trigger immediately on photo upload