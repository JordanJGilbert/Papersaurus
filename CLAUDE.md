# Papersaurus - AI-Powered Greeting Card Generator

## Project Overview
Papersaurus is a modern Next.js application that generates personalized greeting cards using AI. The app uses a **single-page interface** for streamlined card creation.

## 🚀 IMPORTANT: Testing Policy
**ONLY run tests when explicitly requested by the user.** Do not automatically test changes unless the user specifically asks for testing. This helps maintain a faster development workflow.

## 🎯 CODING PRINCIPLES - SIMPLICITY FIRST

### Core Philosophy: "Less Code, More Clarity"
When writing code for this project, follow these principles:

1. **Principle of Least Surprise**
   - Code should do exactly what it looks like it does
   - No hidden complexity or "magic"
   - If it takes more than 10 seconds to understand, it's too complex

2. **Minimal Code**
   - Every line should have a clear purpose
   - Remove all unnecessary abstractions
   - If you can delete code without losing functionality, delete it

3. **Single State Objects**
   ```typescript
   // ✅ GOOD - One clear state object
   const [state, setState] = useState({
     name: '',
     email: '',
     isLoading: false
   });

   // ❌ BAD - Multiple useState calls
   const [name, setName] = useState('');
   const [email, setEmail] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   ```

4. **Simple Functions**
   - Each function does ONE thing
   - No more than 20-30 lines per function
   - Clear, descriptive names

5. **No Over-Engineering**
   - Don't add features "just in case"
   - No complex error recovery - let users refresh
   - No elaborate state management - use React state

6. **Example: WebSocket Connection**
   ```typescript
   // ✅ GOOD - Simple and clear (50 lines)
   export function useSimpleWebSocket() {
     const socket = io(URL);
     const subscribe = (id) => socket.emit('subscribe', { id });
     return { socket, subscribe };
   }

   // ❌ BAD - Over-engineered (200+ lines)
   // Reconnection logic, stale detection, complex state...
   ```

7. **File Size Guidelines**
   - Hooks: Max 150 lines
   - Components: Max 200 lines
   - If larger, split into smaller files

8. **State Management**
   - Use single state objects
   - Update with spread operator
   - No Redux, MobX, or complex state libraries

9. **Error Handling**
   - Simple try/catch
   - Show toast message
   - Let user retry

10. **No Premature Optimization**
    - Make it work first
    - Make it clean second
    - Make it fast only if needed

## Development Patterns

### Development Notes
- **IMPORTANT**: When using Playwright MCP tools, always use domain `papersaurus.com` instead of `localhost`
  - Example: `https://papersaurus.com` NOT `http://localhost:3000`
  - This ensures proper testing of the production environment
  - The site is accessible at papersaurus.com with SSL configured
- **MOBILE FIRST**: This entire app is prioritizing mobile experience
  - All UI/UX decisions should favor mobile users
  - When using MCP tools for testing, **always use mobile view**
  - Test responsiveness and touch interactions on mobile devices
  - Optimize for small screens and touch targets
  - Mobile viewport should be the default testing environment

### Application Architecture
The app uses a single-page design with modular components:

#### Core Hooks:
- **useCardStudio**: Main hook containing all card generation logic (refactored into 7 modules)
- **useCardForm**: Hook for form data persistence across sessions
- **useCardHistory**: Hook for tracking generated cards
- **useChatCardCreation**: Chat interface logic for conversational card creation
- **useCardStudioWithForm**: Simplified version of useCardStudio for chat mode
- **useCardFormNoStorage**: Form state without localStorage persistence for chat

#### Main Components:
- **SinglePageCardCreator**: Main component for card creation with all fields on one page
- **CardPreview**: Component for displaying and interacting with generated cards
- **ChatCardCreator**: Alternative chat interface for conversational card creation
- **ChatMessage**: Individual message display with formatting
- **Print Dialog**: Modal for selecting physical print or email PDF
- **Card Preview Grid**: Thumbnail view of all 5 generated designs

#### Modular Architecture Benefits:
- Each component/hook has a single responsibility
- Easy to test and maintain individual modules
- Improved code reusability across the application
- Better separation of concerns between UI and business logic

### State Management
- Form data persists in localStorage via `useCardForm` hook
- Real-time validation as users fill out the form
- All fields accessible on a single page for easy editing

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

### Chat Interface Back Cover Fix (Latest)
- Fixed issue where back covers weren't being displayed in chat mode
- Updated `useCardStudioWithForm` to properly extract backCoverUrl from WebSocket data
- Back covers now properly show in card preview navigation

### Chat Interface Multi-Design Support
- Changed default `isFrontBackOnly` from `true` to `false` to generate 4 designs
- Added Previous/Next navigation between all 4 card designs
- Removed forced selection - users can view and print any design
- Email only sent when specific card is printed (not automatically for all)

### Photo Upload Feature
Reference photo upload is integrated into the single-page form:

#### Key Features:
- **Automatic Compression**: Files over 10MB are automatically compressed
- **Immediate Context**: Photo analysis happens right after upload
- **Person Identification**: Modal to name people in photos
- **No Model Dependency**: Photos can be uploaded regardless of image model selection

### Reference Photo Analysis Feature
- **AI Vision Analysis**: Gemini 2.5 Pro detects people and their characteristics
- **Person Selection**: Interactive modal to select and name individuals
- **Smart Integration**: Selected people incorporated into card designs
- **Technical**: Uses MCP `analyze_images` tool with structured JSON output
- **Note**: Reference photos work with all image models

#### Important Limitation:
- **FRONT COVER ONLY**: Reference photos are only used for generating the front cover of the card
- **Technical Reason**: The image-to-image generation (OpenAI's images.edit) only processes reference images for the front cover
- **Design Intent**: This ensures people/characters from photos don't appear on back cover or interior panels where they might interfere with messages or decorative elements

#### User Flow:
1. Upload reference photo in the form
2. AI analyzes photo and detects people
3. Modal appears for identifying people
4. User describes who's in the photo
5. Photo context is incorporated into front cover design only

### Card History Feature
- Added `useCardHistory` hook to track the last 10 generated cards
- Quick access to recent cards for template reuse
- Cards display with metadata (date, type, tone, recipient)
- One-click template selection from history

### Email & QR Code System

#### Email Configuration
The system uses **SendGrid** for transactional emails:
- Sender: `cards@papersaurus.com`
- Template: Professional HTML email with card preview
- Includes download links for print-ready PDFs

#### QR Code Generation
QR codes are automatically generated for each card:
- Created during the generation process
- Points to: `https://papersaurus.com/cards/{uniqueId}`
- Stored as PNG in the card data structure
- Displayed on back cover (bottom-right) with "Scan to view online" text

#### Backend API Endpoints
- `POST /send-thank-you-email` - Sends card via email with attachments
- `POST /save-public-card` - Saves card data with generated QR code
- `GET /view-card/{uniqueId}` - Retrieves and displays saved cards

### Chat Interface Features

#### Conversational Card Creation
- Natural language input for card specifications
- AI extracts card details from conversation
- Photo upload support with automatic compression
- Quick responses for common selections
- Real-time card generation progress

#### Chat Mode Specifics
- **Front/Back Only**: No interior panels for simplicity
- **4 Design Variations**: Generate multiple options to choose from
- **No Forced Selection**: View and print any design without committing
- **Smart Defaults**: AI selects artistic style automatically
- **Email on Print**: Cards are emailed only when printed, not during generation

### Single-Page Form Structure

The single-page interface includes all card creation options in one streamlined form:

1. **Card Type & Tone**
   - Card type selection (Birthday, Anniversary, Thank You, etc.)
   - Tone selection (Funny, Heartfelt, Professional, etc.)
   - Clean dropdown interface with emojis and descriptions

2. **Recipient Details**
   - To/From fields (optional personalization)
   - Relationship field for better personalization

3. **Personalization**
   - Interests and hobbies field for artwork personalization
   - Reference photo upload with automatic compression
   - Photo analysis and person identification

4. **Artistic Style**
   - Style selection (Style Sampler, Watercolor, etc.)
   - Descriptions visible on all screen sizes

5. **Email & Generation**
   - Email address for card delivery
   - Generate button creates 5 unique card designs
   - Real-time progress tracking with timer
   - Thumbnail grid for easy design selection
   - Print options (physical or PDF email)

## Architecture & APIs

### Backend Services
- **Flask API** (port 5001): Main backend with WebSocket support
- **MCP Service**: Separate process for AI model integration
- **WebSocket**: SocketIO with job-specific rooms (`job_{job_id}`)

### Key API Endpoints
- `POST /api/generate-card-async` - Start card generation job
- `POST /send-thank-you-email` - Send card via email
- `GET /api/job-status/{job_id}` - Check generation progress
- `GET /view-card/{uniqueId}` - Public card viewing
- `POST /api/print-queue` - Add card to print queue
- `POST /api/send-pdf-email` - Send PDF version via email
- `GET /api/print-status/{job_id}` - Check print job status

### Storage Architecture
- **Cards**: `/data/cards/card_{id}.json` 
- **Jobs**: `/data/jobs/` (auto-cleanup after 6 hours)
- **File Storage**: MD5 hash-based paths `/data/{first2}/{next2}/{hash}`

## Testing & Deployment

### Local Testing
```bash
npm run dev
# Access at http://localhost:3000
```

### Production Deployment
- Frontend: Next.js app on port 3000
- Backend: Flask app on port 5001
- Domain: https://papersaurus.com
- SSL: Configured via Nginx

### Testing Changes in Production
When testing changes on the production server:

**For Frontend Changes (Next.js):**
```bash
# For development (hot reload, no build needed):
sudo systemctl restart papersaurus-dev.service

# For production (with automatic build):
sudo systemctl restart papersaurus.service
```

**Available Frontend Services:**
- `papersaurus-dev.service` - Development server with hot reload (port 3000) (Note: currently still named vibecarding-dev.service)
- `papersaurus.service` - Production server with automatic build (port 3000) (Note: currently still named vibecarding.service)

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
1. Fill out the single-page form
2. Enter email (use `jordan.j.gilbert@gmail.com` for testing)
3. Click Generate Card and wait for designs
4. Select a design and choose print/email option
5. Check inbox for professionally formatted email

## AI Models & Configuration

### Models Used
- **Message Generation**: Gemini 2.5 Pro
- **Image Generation**: GPT-1 Image model
- **Photo Analysis**: Gemini 2.5 Pro with vision
- **Prompt Generation**: Gemini 2.5 Pro
- **IMPORTANT**: Always use `gemini-2.5-pro` for ALL AI-related calls

### Reference Image Processing
- **Image-to-Image Generation**: Uses OpenAI's `images.edit` endpoint
- **Front Cover Only**: Reference images are ONLY applied to the front cover generation
- **Technical Flow**: 
  - Reference images are passed to backend as `input_images`
  - Backend sends them to MCP image service with `input_images_mode: "front_cover_only"`
  - Only prompt index 0 (front cover) receives the reference images
  - Other panels (back, interiors) use standard text-to-image generation
- **Prompt Clarification**: AI prompts explicitly state reference images apply to front cover only

### Required Environment Variables
- `OPENAI_API_KEY` - GPT image generation
- `ANTHROPIC_API_KEY` - Claude integration

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
  model: 'gemini-2.5-pro',
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

### Code Refactoring for Maintainability
- **useCardStudio**: Split 2048-line hook into 7 focused modules (~100-400 lines each)
  - WebSocket, Job Management, Message Generation, File Handling, Draft/Final Generation
- **Benefits**: Single responsibility, easier testing, better reusability, backward compatible

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

### Critical File Paths
- **Cards**: `/var/www/flask_app/data/cards/`
- **Jobs**: `/var/www/flask_app/data/jobs/`
- **Claude Attachments**: `/var/www/flask_app/claude_attachments/`
- **MCP Servers**: `/var/www/flask_app/mcp_client/mcp_servers/`

### Key Features
- QR codes auto-generated for all cards (`papersaurus.com/cards/{id}`)
- Email delivery via SendGrid (fallback: Gmail API)
- Reference photos work with all image models
- WebSocket auto-reconnection with exponential backoff
- Job persistence survives server restarts (file-based)

## Claude Code Integration
- **Attachments Folder**: When user with phone number 17145986105 sends attachments via Signal, they are automatically saved to `/var/www/flask_app/claude_attachments/`
- This allows Claude Code to easily access and process images sent through Signal
- The folder includes an `index.json` file with metadata about each attachment (filename, url, description, etc.)

### Quick Commands for Claude Code
- **IMPORTANT**: Always use `python3 /var/www/flask_app/show_latest_image.py` to get the latest image path
- **Default Behavior**: For ANY image-related request, automatically run the Python script to get the latest image
- **Quick Workflow Examples**:
  - "make this button look better" - Claude runs the script and analyzes the latest image
  - "fix the spacing here" - Claude runs the script and provides fixes
  - "improve this design" - Claude runs the script and suggests improvements
- **DO NOT**: Read index.json directly - always use the Python script for latest image

## Future Enhancements
- Message templates library
- Advanced message editing (formatting, emojis)
- Social sharing features
- Card scheduling for future delivery
- Multi-language support
- Gallery analytics and view counts
- User profiles and collections