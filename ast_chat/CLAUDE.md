# VibeCarding - AI-Powered Greeting Card Generator

## Project Overview
VibeCarding is a modern Next.js application that generates personalized greeting cards using AI. The app recently transitioned from a single-page form to a **step-based wizard interface** for better user experience.

## Architecture Overview

### Frontend Stack
- **Next.js 14** with App Router
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **shadcn/ui** components library
- **Real-time WebSocket** updates via Socket.IO
- **Framer Motion** for animations

### Key Features
- **Step-based card creation wizard** (new approach)
- **Template gallery system** - browse and customize pre-made cards
- **AI-powered content generation** (prompts, messages, images)
- **Multiple artistic styles** (watercolor, botanical, comic book, etc.)
- **Reference photo integration** for character creation
- **Draft mode** - generates 5 preview variations
- **Real-time progress tracking** via WebSocket
- **Email delivery** of completed cards
- **Form persistence** - automatic save/restore across sessions
- **Responsive design** with dark/light mode

## New Wizard Architecture

### Navigation Structure
```
/app/page.tsx        - Now uses CardWizard as main interface
/app/legacy/page.tsx - Original single-page form (legacy)
/app/wizard/page.tsx - Alternative wizard route
```

### Wizard Flow (6 Steps)
1. **Card Basics** - Template gallery, type and tone selection
2. **Content & Message** - Description and message creation
3. **Personalization** - Style and reference photos (optional)
4. **Details & Settings** - Email and advanced options
5. **Draft Selection** - Choose from 5 AI-generated variations
6. **Final Generation** - High-quality card creation

### Key Components

#### Core Wizard Components
- `CardWizard.tsx` - Main wizard container and orchestrator
- `StepIndicator.tsx` - Progress indicator with mobile-responsive navigation
- `WizardNavigation.tsx` - Next/Previous buttons
- `Step1CardBasics.tsx` - Template gallery, card type and tone selection
- `Step2ContentCreation.tsx` - Content description and message
- `Step3Personalization.tsx` - Style selection and photo uploads
- `Step4Details.tsx` - Email and advanced settings
- `Step5Review.tsx` - Draft generation and selection
- `Step6FinalGeneration.tsx` - Final high-quality generation

#### Template System Components
- `TemplateGallery.tsx` - Template browsing and selection dialog
- Template search and filtering functionality
- Grid/list view options with pagination
- Template preview and selection flow

#### State Management
- `useCardStudio.ts` - Comprehensive hook managing all card generation state
- `useCardForm.tsx` - Form data persistence with localStorage (500ms debouncing)
- `useWizardState.tsx` - Wizard step progress and completion tracking
- **WebSocket integration** for real-time updates
- **LocalStorage persistence** for job recovery and form data
- **Form validation** across all steps

## Core Data Flow

### 1. Card Generation Process
```
Template Selection (Optional) → User Input → AI Prompt Generation → Image Generation → Automatic Backend QR Overlay → Card Storage → Email Delivery
```

### 2. Template Flow
```
Browse Templates → Select Template → Auto-populate Form → Customize → Generate Card
```

### 3. Draft Mode Flow
```
User Selections → 5 Parallel Image Jobs → User Picks Favorite → Final High-Quality Generation
```

### 4. WebSocket Updates
```
Backend Job Updates → WebSocket Messages → UI State Updates → Progress Display
```

### 5. Form Persistence Flow
```
User Input → 500ms Debounce → LocalStorage Save → Page Refresh → Auto-restore Data
```

## Key Interfaces

### GeneratedCard
```typescript
interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;      // Portrait image - main card face
  backCover: string;       // Portrait image - back of card
  leftPage: string;        // Portrait image - left interior
  rightPage: string;       // Portrait image - right interior
  createdAt: Date;
  shareUrl?: string;
  generatedPrompts?: {...};
  thumbnails?: {...};
  styleInfo?: {...};
}
```

### Card Configuration
- **Paper sizes**: Standard 5�7, Compact 4�6, A6
- **Artistic styles**: Watercolor, Botanical, Comic Book, Minimalist, etc.
- **Tone options**: Funny, GenZ Humor, Romantic, Professional, etc.
- **Image models**: GPT-1, GPT-2, Claude, Gemini

## Backend Integration

### API Endpoints
- `/api/generate-card-async` - Main card generation with automatic QR overlay
- `/api/cards/store` - Card storage and sharing URL generation
- `/api/cards/list` - Template gallery with template_mode support
- `/api/generate-qr-with-logo` - QR code generation with optional logos
- `/internal/call_mcp_tool` - AI model interactions
- `${BACKEND_API_BASE_URL}/upload` - File upload handling

### WebSocket Events
- `job_update` - Real-time generation progress
- `subscribe_job` / `unsubscribe_job` - Job management
- Connection handling and reconnection logic

## File Upload & Reference Photos
- **HEIC conversion** support
- **Image optimization** and compression
- **Reference photo integration** for character creation
- **Handwriting sample** upload for custom messages

## State Persistence
- **Job recovery** via localStorage
- **Form data persistence** with 500ms debouncing
- **Wizard step progress** tracking and restoration
- **Session continuity** across page refreshes
- **Draft selection** persistence
- **User preferences** storage
- **Template selections** cached for faster loading

## UI/UX Patterns

### Form Validation
- **Step-by-step validation** before progression
- **Real-time feedback** and error handling
- **Custom card type** validation
- **Email format** validation

### Progress Indicators
- **Step completion** tracking with visual indicators
- **Mobile-responsive progress bars** with horizontal scrolling
- **Generation progress** with time estimates
- **WebSocket status** indicators
- **Draft completion** counters

### Mobile-First Design Philosophy
- **Primary focus on mobile experience** - optimized for 375px viewport
- **Desktop compatibility maintained** without separate mobile/desktop code paths
- **Single codebase approach** - mobile optimizations work well on desktop
- **Touch-first interactions** with appropriate sizing and spacing
- **Concise text and messaging** to reduce cognitive load on small screens

### Mobile UX Optimizations
- **Shortened text and tips** - concise messaging throughout all wizard steps
- **Reduced textarea heights** - 3 rows default, 6 expanded vs previous 5/8
- **Simplified placeholders** - removed verbose examples and instructions
- **Condensed tip sections** - 3 bullets max instead of 4+ for better mobile readability
- **Touch-friendly form elements** - 16px font size to prevent iOS zoom
- **Optimized button sizing** - adequate touch targets for mobile interaction
- **Simplified language** - "Tips" instead of "Quick Tips", shorter descriptions
- **Collapsible sections** for smaller screens
- **Accessible** navigation

## Development Patterns

### Component Structure
- **Compound components** for complex UI
- **Custom hooks** for state management
- **TypeScript** for type safety
- **Error boundaries** for graceful failures

### Code Organization
- **Feature-based** folder structure
- **Reusable utility** functions
- **Constants** for configuration
- **Type definitions** for interfaces

## Testing & Quality
- **ESLint** configuration
- **TypeScript** strict mode
- **Error handling** throughout
- **Performance optimization** for large files

## Common Workflows

### Adding New Card Types
1. Update `cardTypes` array in Step1CardBasics.tsx
2. Add appropriate icon from Lucide React
3. Update prompt generation logic
4. Test with different tones and styles
5. Update template card type extraction logic

### Adding New Artistic Styles
1. Add to `artisticStyles` array with prompt modifier
2. Update style selection UI
3. Test with different card types
4. Ensure compatibility with reference photos

### Adding Template Gallery Features
1. Update TemplateGallery.tsx for new UI elements
2. Extend template search and filtering logic
3. Add new template metadata fields
4. Test with different template types and sizes

### Debugging Generation Issues
1. Check WebSocket connection status
2. Verify job storage in localStorage
3. Monitor console for error messages
4. Test with different models and settings
5. Check form persistence in localStorage
6. Verify wizard step completion states
7. **QR Code Issues**: Check backend logs for QR overlay errors
8. **Email Issues**: Verify card storage and share URL generation
9. **URL Consistency**: Ensure all systems use same `{domain}/card/{card_id}` pattern

## Migration Notes
- **Main interface**: `/app/page.tsx` now uses CardWizard as primary experience
- **Legacy mode**: Original functionality preserved in `/app/legacy/page.tsx`
- **Wizard mode**: Alternative wizard route at `/app/wizard/page.tsx`
- **Shared components**: Both modes use same underlying components
- **State management**: `useCardStudio` hook works with both interfaces
- **Form persistence**: New wizard includes automatic form data persistence
- **QR Code System**: Unified backend QR generation for both legacy and wizard interfaces
- **Email System**: Consistent URL generation and Gmail API integration across all interfaces

## Environment Configuration
- `NEXT_PUBLIC_BACKEND_API_URL` - Backend API base URL
- Production deployment on Vercel
- SSL/TLS termination handled by platform
- CDN for static assets

## Development Server
- **Local Development**: User typically runs `npm run dev` in a separate terminal (no need to run this command)
- **Production Analysis**: Use MCP tools with `vibecarding.com` domain for testing and analysis
- **Backend Integration**: Local development connects to production backend for full functionality
- **Backend Restart**: To restart the Flask backend service, use `sudo systemctl restart flask_app.service`

## Performance Optimizations
- **Component lazy loading** for large forms
- **Image optimization** with Next.js
- **WebSocket connection** pooling
- **LocalStorage** for client-side caching
- **Progressive loading** for draft previews

## Template Gallery System

### Template Architecture
- **Backend Integration**: `/api/cards/list` with `template_mode=true`
- **Template Caching**: 10-minute cache with localStorage persistence
- **Search Functionality**: Text-based search with debouncing
- **Pagination**: Infinite scroll with load-more functionality
- **View Modes**: Grid and list layouts with responsive design

### Template Selection Flow
1. **Browse Templates**: User clicks "Browse Templates" in Step 1
2. **Load Templates**: API call with template_mode for optimized payloads
3. **Search & Filter**: Real-time search with 300ms debounce
4. **Template Preview**: High-quality preview images with metadata
5. **Selection**: Auto-populate form with template data
6. **Customization**: User can modify template-based content

### Template Data Structure
```typescript
interface TemplateCard {
  id: string;
  prompt: string;
  frontCover: string;
  shareUrl?: string;
  generatedPrompts?: object;
  styleInfo?: {
    styleName: string;
    styleLabel: string;
  };
  createdAt: Date;
}
```

### Template Integration
- **Smart Card Type Detection**: Automatic card type extraction from prompts
- **Style Preservation**: Template artistic styles carried forward
- **QR Code Generation**: Automatic QR code overlay for all final cards (backend-handled)
- **Form Pre-population**: Seamless integration with wizard form data

## Form Persistence System

### Persistence Architecture
- **Storage Key**: `vibecarding-wizard-form-data`
- **Debouncing**: 500ms delay to prevent excessive writes
- **Data Serialization**: JSON with File object exclusion
- **Expiration**: 24-hour data retention for cleanup
- **Error Handling**: Graceful fallback on storage quota exceeded

### Persistent Data Fields
```typescript
interface CardFormData {
  // Step 1: Card Basics
  selectedType: string;
  customCardType: string;
  selectedTone: string;
  toField: string;
  fromField: string;
  
  // Step 2: Content Creation
  prompt: string;
  finalCardMessage: string;
  isHandwrittenMessage: boolean;
  
  // Step 3: Personalization
  selectedArtisticStyle: string;
  customStyleDescription: string;
  referenceImageUrls: string[];
  imageTransformation: string;
  
  // Step 4: Details
  userEmail: string;
  selectedImageModel: string;
  selectedDraftModel: string;
  selectedPaperSize: string;
  numberOfCards: number;
  isFrontBackOnly: boolean;
}
```

### Wizard State Persistence
- **Step Progress**: `useWizardState` hook tracks completion
- **Navigation State**: Current step and completed steps
- **Validation Cache**: Step validation results
- **Auto-Recovery**: Restore state after page refresh

## QR Code System

### Automatic QR Generation
- **Backend Integration**: QR codes automatically added during final card generation
- **Positioning**: Bottom-right corner of back cover with smart sizing (15% of image, max 160px)
- **Timing**: Occurs after images are generated but before job completion
- **Scope**: Only for final cards (not drafts)

### QR Code Features
- **Share URL Integration**: QR codes link to `{domain}/card/{card_id}` URLs
- **Visual Design**: White rounded background with "Scan me :)" text
- **Logo Support**: Framework ready for logo integration via `/api/generate-qr-with-logo`
- **Error Handling**: Graceful fallback if QR generation fails (continues without QR)

### URL Consistency
- **Email Links**: Use same card URLs as QR codes
- **Share Button**: Reuses stored card URLs when available
- **Template Gallery**: QR codes added to shared templates automatically

### Backend Process Flow
```
Card Generation Complete → Store Card (get card_id) → Generate QR with Share URL → Overlay QR on Back Cover → Update Card Data → Email with Actual Card URL
```

### WebSocket Progress Updates
- **Real-time Updates**: "Adding QR code to your card..." progress messages
- **Non-blocking**: Generation continues if QR overlay fails
- **Logging**: Detailed console output for debugging QR issues

## Email System

### Email Integration
- **Gmail API**: Backend sends emails using Gmail service account
- **User Notifications**: Completion emails with actual card links (not hardcoded URLs)
- **Admin Notifications**: Copy sent to jordan@ast.engineer for all final cards
- **Template**: User-friendly HTML emails with card type and personalized content

### Email URL Generation
- **Automatic Storage**: Cards automatically stored during QR generation for email links
- **URL Reuse**: Email system reuses share URLs from QR generation (no duplicate storage)
- **Fallback Logic**: Creates new card storage if QR generation failed
- **Consistent URLs**: All emails use `{domain}/card/{card_id}` pattern

### Email Timing
- **Final Cards Only**: No emails sent for draft cards
- **Post-QR Generation**: Emails sent after QR codes are added and cards are stored
- **Error Resilient**: Emails still sent even if QR generation fails

## 📋 Documentation Maintenance

**IMPORTANT**: This CLAUDE.md file should be kept current with the codebase. Please ask Claude to update this documentation when you:

### When to Update This File:
- ✅ **Add new features** (new wizard steps, components, API endpoints)
- ✅ **Modify existing features** (change wizard flow, update interfaces)
- ✅ **Remove features** (deprecate components, remove functionality)
- ✅ **Change architecture** (new state management, different data flow)
- ✅ **Update dependencies** (major version changes, new libraries)
- ✅ **Add new workflows** (development processes, deployment changes)

### How to Request Updates:
Simply ask Claude:
- "Update CLAUDE.md with the new payment integration feature"
- "Document the new template gallery we just added"
- "Remove the old draft mode info and add the new preview system"
- "We changed the WebSocket error handling - update the docs"

### What Gets Updated:
- **Architecture diagrams** and flow descriptions
- **Component lists** and their purposes
- **Interface definitions** and type signatures
- **API endpoints** and their usage
- **Development workflows** and common patterns
- **Configuration options** and environment variables

### Why Keep This Current:
- Helps Claude understand your current codebase structure
- Enables faster and more accurate assistance
- Serves as living documentation for your team
- Reduces onboarding time for new features

**Remember**: Outdated documentation can lead to incorrect suggestions, so keep this file fresh! 🚀