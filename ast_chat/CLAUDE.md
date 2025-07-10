# VibeCarding - AI-Powered Greeting Card Generator

## Project Overview
VibeCarding is a modern Next.js application that generates personalized greeting cards using AI. The app recently transitioned from a single-page form to a **step-based wizard interface** for better user experience.

## Development Patterns

### Development Notes
- **IMPORTANT**: When using Playwright MCP tools, always use domain `vibecarding.com` instead of `localhost`
  - Example: `https://vibecarding.com` NOT `http://localhost:3000`
  - This ensures proper testing of the production environment
  - The site is accessible at vibecarding.com with SSL configured

### Wizard Architecture
The app uses a step-based wizard with:
- **CardWizard.tsx**: Main wrapper component that manages wizard state and step navigation
- **useWizardState**: Hook for managing step progression and validation
- **useCardForm**: Hook for form data persistence across sessions
- **useCardStudio**: Main hook containing all card generation logic (migrated from page.tsx)

### State Management
- Form data persists in localStorage via `useCardForm` hook
- Each step validates and marks completion independently
- Navigation between steps is allowed only after validation

## Recent Updates

### Message Generation UX Enhancements (Latest)
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
   - Recent cards history display

2. **Step 2 - Content & Message**
   - Card description (optional prompt)
   - Message composition with AI assistance
   - Handwritten message option
   - Message history and variations
   - Character count guidance

3. **Step 3 - Personalization (Optional)**
   - Artistic style selection
   - Reference photo upload for cartoonification
   - Smart style recommendations

4. **Step 4 - Email Address**
   - Required for card delivery
   - Validation before proceeding

5. **Step 5 - Draft Selection**
   - AI generates 4 draft variations
   - Interactive 3D card preview
   - Selection determines final generation

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

### Email Testing
To test email functionality:
1. Generate a card through the wizard
2. Enter email in Step 4
3. Complete generation in Step 6
4. Check inbox for professionally formatted email

## AI Models Used
- **Message Generation**: Gemini Pro 1.5
- **Image Generation**: DALL-E 3 for drafts, DALL-E 3 or Ideogram for finals
- **Card Descriptions**: GPT-4 for creative prompts

## Important Configuration
- All generated cards are saved to `/var/www/flask_app/data/cards/`
- QR codes point to public URLs at `vibecarding.com/cards/{id}`
- Email templates are inline in the backend code
- Frontend and backend must be running for full functionality

## Future Enhancements
- Message templates library
- Advanced message editing (formatting, emojis)
- Social sharing features
- Card scheduling for future delivery
- Multi-language support