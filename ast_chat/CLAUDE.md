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
- **AI-powered content generation** (prompts, messages, images)
- **Multiple artistic styles** (watercolor, botanical, comic book, etc.)
- **Reference photo integration** for character creation
- **Draft mode** - generates 5 preview variations
- **Real-time progress tracking** via WebSocket
- **Email delivery** of completed cards
- **Responsive design** with dark/light mode

## New Wizard Architecture

### Navigation Structure
```
/app/page.tsx        - Original single-page form (legacy)
/app/wizard/page.tsx - New step-based wizard interface
```

### Wizard Flow (6 Steps)
1. **Card Basics** - Type and tone selection
2. **Content & Message** - Description and message creation
3. **Personalization** - Style and reference photos (optional)
4. **Details & Settings** - Email and advanced options
5. **Draft Selection** - Choose from 5 AI-generated variations
6. **Final Generation** - High-quality card creation

### Key Components

#### Core Wizard Components
- `CardWizard.tsx` - Main wizard container and orchestrator
- `StepIndicator.tsx` - Progress indicator with navigation
- `WizardNavigation.tsx` - Next/Previous buttons
- `Step1CardBasics.tsx` - Card type and tone selection
- `Step2ContentCreation.tsx` - Content description and message
- `Step3Personalization.tsx` - Style selection and photo uploads
- `Step4Details.tsx` - Email and advanced settings
- `Step5Review.tsx` - Draft generation and selection
- `Step6FinalGeneration.tsx` - Final high-quality generation

#### State Management
- `useCardStudio.ts` - Comprehensive hook managing all card generation state
- **WebSocket integration** for real-time updates
- **LocalStorage persistence** for job recovery
- **Form validation** across all steps

## Core Data Flow

### 1. Card Generation Process
```
User Input � AI Prompt Generation � Image Generation � QR Code Overlay � Email Delivery
```

### 2. Draft Mode Flow
```
User Selections � 5 Parallel Image Jobs � User Picks Favorite � Final High-Quality Generation
```

### 3. WebSocket Updates
```
Backend Job Updates � WebSocket Messages � UI State Updates � Progress Display
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
- `/api/generate-card-async` - Main card generation
- `/api/cards/store` - Card storage and sharing
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
- **Session continuity** across page refreshes
- **Draft selection** persistence
- **User preferences** storage

## UI/UX Patterns

### Form Validation
- **Step-by-step validation** before progression
- **Real-time feedback** and error handling
- **Custom card type** validation
- **Email format** validation

### Progress Indicators
- **Step completion** tracking
- **Generation progress** with time estimates
- **WebSocket status** indicators
- **Draft completion** counters

### Responsive Design
- **Mobile-first** approach
- **Collapsible sections** for smaller screens
- **Touch-friendly** interactions
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
1. Update `cardTypes` array in constants
2. Add appropriate icon from Lucide React
3. Update prompt generation logic
4. Test with different tones and styles

### Adding New Artistic Styles
1. Add to `artisticStyles` array with prompt modifier
2. Update style selection UI
3. Test with different card types
4. Ensure compatibility with reference photos

### Debugging Generation Issues
1. Check WebSocket connection status
2. Verify job storage in localStorage
3. Monitor console for error messages
4. Test with different models and settings

## Migration Notes
- **Legacy mode**: Original `/app/page.tsx` still functional
- **Wizard mode**: New `/app/wizard/page.tsx` is preferred
- **Shared components**: Both modes use same underlying components
- **State management**: `useCardStudio` hook works with both interfaces

## Environment Configuration
- `NEXT_PUBLIC_BACKEND_API_URL` - Backend API base URL
- Production deployment on Vercel
- SSL/TLS termination handled by platform
- CDN for static assets

## Performance Optimizations
- **Component lazy loading** for large forms
- **Image optimization** with Next.js
- **WebSocket connection** pooling
- **LocalStorage** for client-side caching
- **Progressive loading** for draft previews

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