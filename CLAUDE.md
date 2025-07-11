# VibeCarding - AI-Powered Greeting Card Generator

## Project Overview
VibeCarding is a modern Next.js application that generates personalized greeting cards using AI. The app recently transitioned from a single-page form to a **step-based wizard interface** for better user experience.

## Development Patterns

### Development Notes
- **IMPORTANT**: When using Playwright MCP tools, always use domain `vibecarding.com` instead of `localhost`
  - Example: `https://vibecarding.com` NOT `http://localhost:3000`
  - This ensures proper testing of the production environment
  - The site is accessible at vibecarding.com with SSL configured
- **MOBILE FIRST**: This entire app is prioritizing mobile experience
  - All UI/UX decisions should favor mobile users
  - When using MCP tools for testing, **always use mobile view**
  - Test responsiveness and touch interactions on mobile devices
  - Optimize for small screens and touch targets
  - Mobile viewport should be the default testing environment

### Wizard Architecture
The app uses a step-based wizard with modular components:

#### Core Hooks:
- **useCardStudio**: Main hook containing all card generation logic (refactored into 7 modules)
- **useWizardState**: Hook for managing step progression and validation
- **useCardForm**: Hook for form data persistence across sessions
- **useCardHistory**: Hook for tracking generated cards and draft sessions

#### Wizard Components:
- **CardWizard**: Main wrapper component (refactored into 4 modules)
- **StepIndicator**: Visual progress indicator with mobile optimization
- **WizardNavigation**: Step navigation controls
- **CardHistoryModal**: Resume drafts and view completed cards

#### Modular Architecture Benefits:
- Each component/hook has a single responsibility
- Easy to test and maintain individual modules
- Improved code reusability across the application
- Better separation of concerns between UI and business logic

### State Management
- Form data persists in localStorage via `useCardForm` hook
- Each step validates and marks completion independently
- Navigation between steps is allowed only after validation

### Mobile-First Design Philosophy
- **Primary Target**: Mobile users (phones and tablets)
- **Touch Optimization**: All interactive elements have minimum 44x44px touch targets
- **Responsive Breakpoints**: Mobile-first CSS with desktop as enhancement
- **Performance**: Optimized for slower mobile connections
- **UI Components**: Designed for thumb-friendly navigation
- **Text Sizes**: Readable on small screens without zooming
- **Forms**: Mobile-optimized input fields with appropriate keyboards
- **Modals**: Full-screen on mobile for better usability

## Recent Updates

### Photo Upload Moved to Step 1 (Latest Update - January 2025)
Reference photo upload has been moved from Step 3 to Step 1 for better user experience:

#### Key Improvements:
- **Earlier Engagement**: Users can upload photos right at the start
- **Automatic Compression**: Files over 10MB are automatically compressed
- **Better Flow**: Photo context available throughout the wizard
- **Cleaner Separation**: Step 3 now focused solely on artistic style
- **No Model Dependency**: Photos can be uploaded regardless of image model selection

### Reference Photo Analysis Feature (January 2025)
Added intelligent photo analysis capabilities for personalized character creation:

#### New Features:
- **AI Vision Analysis**: Analyzes uploaded photos to detect all people and their characteristics
- **Person Selection UI**: Interactive modal to select which people to include in the card
- **Name Assignment**: Ability to name individuals for better personalization (e.g., "Sarah" instead of "person on left")
- **Relationship Context**: Optional field to specify relationships (e.g., "daughter", "best friend")
- **Enhanced Prompts**: Generates detailed character descriptions including:
  - Physical appearance (hair, clothing, age)
  - Position in photo (for maintaining relationships)
  - Distinguishing features
  - Expressions and mood

#### Technical Implementation:
- Uses `analyze_images` tool from image_services_server.py (via MCP)
- The tool uses Gemini 2.5 Pro for accurate photo analysis
- Structured JSON output with TypeScript interfaces
- PhotoAnalysisModal component for user interaction
- Enhanced PromptGenerator with person-specific instructions
- Maintains backward compatibility (analysis is optional)

#### User Flow:
1. Upload reference photo in Step 1 (moved from Step 3)
2. AI analyzes photo and detects people
3. Modal appears showing detected people
4. User selects who to include and optionally names them
5. Selected people are incorporated into all card designs

### Message Generation UX Enhancements
Added comprehensive UX improvements to the message creation interface:

#### New Features:
- **Message History Dropdown**: Easy access to all previously generated messages
- **Undo/Redo Functionality**: Navigate through message versions with dedicated buttons
- **"Try Another" Button**: Generate message variations while keeping context
- **Dynamic Placeholders**: Context-aware hints based on card type and tone:
  - Birthday + Funny: "💝 Add a joke about their age or a funny memory..."
  - Anniversary + Romantic: "💝 Express your love and cherished memories..."
  - Thank You + Professional: "💝 Express gratitude professionally..."
- **Character Count Indicator**: Shows current count with ideal range (50-250 characters)
- **Enhanced Loading States**: Skeleton loader with "Creating personalized message..." text
- **Mobile-Optimized UI**: Buttons show/hide text based on screen size

#### Technical Implementation:
- Fixed state synchronization bug by returning generated message from `handleGetMessageHelp`
- Added `messageHistory`, `currentMessageIndex`, `undoMessage`, `redoMessage` props to Step2
- Used `useMemo` for dynamic placeholder computation
- Improved responsive design with conditional button text

### Card History Feature
- Added `useCardHistory` hook to track the last 10 generated cards
- Integrated with Step1 of wizard to show recent cards
- Cards display with metadata (date, type, tone, recipient)
- One-click template selection from history

### Email & QR Code System

#### Email Configuration
The system uses **SendGrid** for transactional emails:
- Sender: `cards@vibecarding.com`
- Template: Professional HTML email with card preview
- Includes download links for print-ready PDFs

#### QR Code Generation
QR codes are automatically generated for each card:
- Created during the generation process
- Points to: `https://vibecarding.com/cards/{uniqueId}`
- Stored as PNG in the card data structure
- Displayed on back cover (bottom-right) with "Scan to view online" text

#### Backend API Endpoints
- `POST /send-thank-you-email` - Sends card via email with attachments
- `POST /save-public-card` - Saves card data with generated QR code
- `GET /view-card/{uniqueId}` - Retrieves and displays saved cards

### Wizard Step Structure

1. **Step 1 - Card Basics**
   - Card type selection (Birthday, Anniversary, Thank You, etc.)
   - Tone selection (Funny, Heartfelt, Professional, etc.)
   - To/From fields (optional personalization)
   - Reference photo upload (optional) with automatic compression for files >10MB
   - Photo analysis for person selection and naming
   - Recent cards history display

2. **Step 2 - Content & Message**
   - Card description (optional prompt)
   - Message composition with AI assistance
   - Handwritten message option
   - Message history and variations
   - Character count guidance

3. **Step 3 - Personalization (Optional)**
   - Artistic style selection
   - Shows confirmation if photos were uploaded in Step 1
   - Smart style recommendations

4. **Step 4 - Email Address**
   - Required for card delivery
   - Validation before proceeding

5. **Step 5 - Draft Selection**
   - AI generates 5 draft variations (updated from 4)
   - Interactive card preview with hover effects
   - Selection determines final generation
   - Reference photos automatically incorporated into designs

6. **Step 6 - Final Generation**
   - High-quality 4-panel card generation
   - Progress tracking
   - Email delivery with PDF attachment

## Testing & Deployment

### Local Testing
```bash
npm run dev
# Access at http://localhost:3000
```

### Production Deployment
- Frontend: Next.js app on port 3000
- Backend: Flask app on port 5001
- Domain: https://vibecarding.com
- SSL: Configured via Nginx

### Testing Changes in Production
When testing changes on the production server:

**For Frontend Changes (Next.js):**
```bash
# For development (hot reload, no build needed):
sudo systemctl restart vibecarding-dev.service

# For production (with automatic build):
sudo systemctl restart vibecarding.service
```

**Available Frontend Services:**
- `vibecarding-dev.service` - Development server with hot reload (port 3000)
- `vibecarding.service` - Production server with automatic build (port 3000)

Note: Only run one frontend service at a time. The production service automatically runs `npm run build` before starting.

**For Backend Changes (Flask/app.py):**
```bash
sudo systemctl restart flask_app.service
```

**For MCP Server Changes (mcp_client/mcp_servers/*.py):**
```bash
sudo systemctl restart mcp_service.service
```

**IMPORTANT**: 
- The VibeCarding service includes `ExecStartPre=npm run build` in its systemd configuration, so it automatically builds before starting
- Always restart the Flask service when making changes to `app.py` or any backend Python files
- Always restart the MCP service when making changes to any MCP server files
- All services run under process managers and won't reflect changes until restarted

### Email Testing
To test email functionality:
1. Generate a card through the wizard
2. Enter email in Step 4 (use `jordan.j.gilbert@gmail.com` for testing)
3. Complete generation in Step 6
4. Check inbox for professionally formatted email

## AI Models Used
- **Message Generation**: Gemini 2.5 Pro
- **Image Generation**: GPT for drafts and finals
- **Card Descriptions**: GPT-4 for creative prompts
- **Prompt Generation**: Gemini 2.5 Pro for combined prompt generation
- **Photo Analysis**: Gemini 2.5 Pro with vision capabilities (NEW)
- **IMPORTANT**: Always use `gemini-2.5-pro` for ALL AI-related calls (including brainstorming, suggestions, etc.)

### AI Chat Helper Function (`chatWithAI`)
The `chatWithAI` helper function in `/hooks/cardStudio/utils.ts` provides a unified interface for AI interactions:

```typescript
chatWithAI(userMessage: string, options: {
  systemPrompt?: string | null;
  model?: string;              // Default: 'gemini-2.5-pro'
  includeThoughts?: boolean;    // Default: false
  jsonSchema?: any;            // JSON Schema for structured output
  attachments?: string[];      // Base64 image attachments
})
```

#### Key Features:
- **JSON Schema Support**: Pass a JSON Schema to get structured, validated responses
- **Multiple Models**: Supports various AI models (gemini, gpt-4, etc.)
- **Image Attachments**: Can include base64 images for vision tasks
- **Error Handling**: Automatic error parsing and fallback handling

#### Example with JSON Schema:
```typescript
const response = await chatWithAI(prompt, {
  systemPrompt: "You are a greeting card designer",
  model: 'gemini-2.0-flash',
  jsonSchema: {
    type: "object",
    properties: {
      backCover: { type: "string" },
      leftInterior: { type: "string" },
      rightInterior: { type: "string" }
    },
    required: ["backCover", "leftInterior", "rightInterior"]
  }
});
// response will be a parsed JSON object matching the schema
```

## Recent Architecture Improvements

### Code Refactoring for Maintainability (Latest - January 2025)
Successfully refactored the two largest files in the codebase into modular, maintainable components:

#### useCardStudio Hook Refactoring
Broke down the massive `useCardStudio.ts` (2048 lines) into 7 focused modules:
- **useWebSocket.ts** (100 lines): WebSocket connection and job subscription management
- **useJobManagement.ts** (140 lines): Job tracking, storage, and time management
- **useMessageGeneration.ts** (130 lines): AI message generation with history/undo/redo
- **useFileHandling.ts** (90 lines): File upload handling for references and handwriting
- **useDraftGeneration.ts** (445 lines): Draft card generation and selection logic
- **useCardGeneration.ts** (410 lines): Final card generation and completion handling
- **constants.ts** (110 lines): Shared constants, types, and configuration
- **utils.ts** (145 lines): Shared utility functions (email, AI chat, etc.)

#### CardWizard Component Refactoring
Split `CardWizard.tsx` (627 lines) into 4 smaller components:
- **CardWizardRefactored.tsx** (225 lines): Main component with state management
- **CardWizardEffects.tsx** (95 lines): All useEffect hooks and side effects
- **CardWizardSteps.tsx** (130 lines): Step rendering and switching logic
- **CardWizardHelpers.tsx** (165 lines): Helper functions and wrapper utilities

#### Benefits Achieved:
- **Better Code Organization**: Each module has a single, clear responsibility
- **Improved Testability**: Smaller modules are easier to unit test
- **Enhanced Reusability**: Utilities and constants can be imported individually
- **Easier Maintenance**: Average file size reduced from 1300+ to ~200 lines
- **Backward Compatibility**: Original imports preserved via re-exports
- **Type Safety**: All modules maintain full TypeScript support

### Prompt Generation Consolidation
Successfully consolidated multiple prompt generation locations into a single source of truth:

#### PromptGenerator Class (`/lib/promptGenerator.ts`)
- **Single Source of Truth**: All prompt generation now flows through `PromptGenerator` class
- **Methods**:
  - `generateCardPrompts()`: Creates all 4 card panel prompts
  - `generateDraftPrompt()`: Creates front cover draft variations
  - `generateMessagePrompt()`: Generates personalized messages
  - `generateFinalFromDraftPrompts()`: Creates remaining panels from selected draft (legacy)
  - `generateFinalFromDraftPromptsCombined()`: **NEW** - Creates all non-front prompts in single AI call for better cohesion
- **Visual Density System**: Context-aware decoration levels by card type
  - Sympathy cards: Minimal decoration (5% back, 20% left, 10% right)
  - Birthday/Holiday cards: Festive decoration (20% back, 40% left, 20% right)
  - Professional cards: Balanced (10-15% decoration)
- **Reference Photo Containment**: Characters/people ONLY on front cover
- **Message-First Design**: Right interior prioritizes text legibility

#### Combined Prompt Generation (NEW)
The `generateFinalFromDraftPromptsCombined()` method generates back cover, left interior, and right interior prompts in a single AI call:
- **Context Awareness**: Front cover prompt is clearly marked as "CONTEXT ONLY"
- **Cohesive Design**: AI generates all 3 prompts together for better visual harmony
- **JSON Schema Output**: Uses structured JSON response for reliability
- **Fallback**: Automatically falls back to individual generation if combined fails

### WebSocket Resilience Improvements
- **Auto-reconnection**: Reconnects on disconnect with exponential backoff
- **Stale Job Detection**: Monitors for jobs stuck without updates for 30+ seconds
- **Progress Extraction**: Parses progress from WebSocket messages when percentage missing
- **Debug Logging**: Enhanced console logging for troubleshooting

### Fixed Issues
- **95% Progress Bug**: Added multiple fallback mechanisms for completion detection
- **Reference Image Bleeding**: Explicit prompts prevent characters on non-front pages
- **Message Generation State**: Fixed synchronization between CardWizard and useCardStudio
- **WebSocket Draft Updates**: Fixed issue where only one draft completion was received instead of all 5
  - Added support for multiple concurrent WebSocket subscriptions
  - Draft jobs no longer unsubscribe from each other
- **Reference Image Persistence**: Fixed race condition causing uploaded images to disappear
  - Reference images now only sync from cardStudio → form data (one-way sync)
  - Images persist properly when navigating between wizard steps
  - Reference photos are correctly passed to draft and final generation
- **Job Persistence Across Server Restarts** (January 2025)
  - Implemented file-based job storage in Flask backend (`/data/jobs/`)
  - Jobs now survive Flask server restarts
  - Auto-cleanup of jobs older than 6 hours
  - Thread-safe PersistentJobStorage class
- **Page Refresh During Generation** (January 2025)
  - Fixed runtime error: `draftGeneration.setIsGeneratingDrafts` → `setIsGenerating`
  - Step5Review now checks localStorage for pending jobs on mount
  - Proper UI state restoration showing generation progress instead of draft selection
  - Frontend gracefully handles missing backend jobs with clear user messages
  - Stale job cleanup (>5 minutes) on page load

## Gallery UI Implementation

### Enhanced Gallery Features
The gallery at `/gallery` now includes comprehensive UI enhancements:

#### Features:
- **Multiple View Modes**: Grid, List, and Masonry layouts
- **Advanced Filtering**: Filter by card type and tone
- **Sorting Options**: Newest, Oldest, and Popular
- **Enhanced Card Preview Modal**: 
  - View all 4 card panels (front, back, left interior, right interior)
  - Zoom controls (50% to 300%)
  - Download individual panels
  - Like/favorite functionality
  - Copy share link
- **Responsive Design**: Mobile-optimized with touch-friendly controls
- **Real-time Search**: Search by prompt, message, or recipient

#### Components:
- **EnhancedGallery** (`/components/EnhancedGallery.tsx`): Main gallery component with filtering and viewing logic
- **Gallery Page** (`/app/gallery/page.tsx`): Updated page with filter sidebar and view mode controls

#### Technical Implementation:
- Uses `useCardCache` hook for efficient data loading
- Infinite scroll with intersection observer
- Debounced search for performance
- Motion animations with Framer Motion
- Responsive grid layouts with Tailwind CSS

## Important Configuration
- All generated cards are saved to `/var/www/flask_app/data/cards/`
- QR codes point to public URLs at `vibecarding.com/cards/{id}`
- Email templates are inline in the backend code
- Frontend and backend must be running for full functionality
- **Note**: Reference photo analysis feature requires deployment of latest code (January 2025)

## Claude Code Integration
- **Attachments Folder**: When user with phone number 17145986105 sends attachments via Signal, they are automatically saved to `/var/www/flask_app/claude_attachments/`
- This allows Claude Code to easily access and process images sent through Signal
- The folder includes an `index.json` file with metadata about each attachment (filename, url, description, etc.)

### Quick Commands for Claude Code
- **View Latest Image**: Just say "show latest" or "latest image" and Claude will automatically read the most recent attachment
- **Analyze UI**: Send a screenshot via Signal, then say "analyze UI" or "improve this UI" and Claude will automatically analyze the latest image
- **Quick Workflow Examples**:
  - "make this button look better" - Claude will analyze the latest Signal image and suggest improvements
  - "fix the spacing here" - Claude will look at the latest screenshot and provide fixes
  - "improve this design" - Claude will analyze and suggest design improvements
- **Alternative**: Run `python3 /var/www/flask_app/show_latest_image.py` to get the path of the latest image

## Future Enhancements
- Message templates library
- Advanced message editing (formatting, emojis)
- Social sharing features
- Card scheduling for future delivery
- Multi-language support
- Gallery analytics and view counts
- User profiles and collections