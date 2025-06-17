# 🎨 Buddy's Card Studio

A beautiful AI-powered greeting card creation feature integrated into AST Chat.

## Features

### ✨ Card Creation
- **AI-Powered Generation**: Creates 3 distinct images for complete greeting cards
- **Card Types**: Birthday, Christmas, Graduation, Anniversary, and General cards
- **Custom Prompts**: Full creative freedom with detailed prompt descriptions
- **Professional Quality**: High-resolution images suitable for printing

### 🖼️ Three-Image System
1. **Front Cover**: Eye-catching design that serves as the card's exterior
2. **Left Page**: Beautiful artistic design or decorative imagery
3. **Right Page**: Handwritten-style text with personalized messages

### 📱 User Interface
- **Modern Design**: Clean, intuitive interface with gradient backgrounds
- **Responsive Layout**: Works perfectly on desktop and mobile devices
- **Real-time Preview**: See your card in both closed and open views
- **Dark Mode Support**: Seamless integration with the app's theme system

### 🖨️ Print-Ready Features
- **Print Layout View**: Dedicated tab showing how to print and assemble cards
- **Download Options**: Individual or bulk download of all three images
- **Print Instructions**: Step-by-step guide for proper printing and folding
- **Paper Specifications**: Recommended paper types and sizes for best results

## How It Works

### 1. Card Creation Process
```
User Input → AI Processing → Three Images Generated → Preview & Print
```

### 2. API Integration
- Integrates with the existing AST Chat backend
- Uses the `generate_images_with_prompts` tool
- Supports both streaming and non-streaming responses
- Fallback to placeholder images if generation fails

### 3. Print Workflow
```
Front Cover (Step 1) → Inside Pages (Step 2) → Fold (Step 3) → Complete Card
```

## Technical Implementation

### Components Created
- `app/card-studio/page.tsx` - Main card studio interface
- `components/CardPreview.tsx` - Interactive card preview with zoom controls
- `components/PrintLayout.tsx` - Print-ready layout with download functionality
- `components/ui/textarea.tsx` - Text area component for prompts
- `components/ui/separator.tsx` - UI separator component

### Navigation Integration
- Added to main chat dropdown menu
- Featured prominently on the initial chat view
- Seamless navigation between chat and card studio

### API Endpoints Used
- `POST /query` - For generating card images via AI
- Uses existing authentication and user management

## Usage Instructions

### For Users
1. **Access**: Click "Buddy's Card Studio" from the main chat interface
2. **Create**: Enter a detailed description of your desired card
3. **Generate**: Click "Generate Card" and wait for AI processing
4. **Preview**: View your card in closed/open modes with zoom controls
5. **Print**: Switch to "Print Layout" tab for printing instructions
6. **Download**: Get individual images or download all at once

### For Developers
1. **Backend Integration**: Ensure `generate_images_with_prompts` tool is available
2. **Environment**: Set `NEXT_PUBLIC_BACKEND_API_URL` for API communication
3. **Dependencies**: All required packages are included in package.json

## Card Specifications

### Final Dimensions
- **Folded Size**: 4.25" x 5.5" (standard greeting card size)
- **Unfolded Size**: 8.5" x 5.5" (fits standard letter paper)

### Recommended Paper
- **Type**: Cardstock or heavy paper (110-140 GSM)
- **Size**: 8.5" x 11" (Letter) or A4
- **Finish**: Matte or semi-gloss for best print quality

### Print Settings
- **Scale**: 100% (no scaling or "fit to page")
- **Quality**: High-quality/photo settings
- **Duplex**: Manual duplex printing (front, then back)

## Future Enhancements

### Planned Features
- [ ] Card template library with pre-designed layouts
- [ ] Bulk card generation for multiple recipients
- [ ] Integration with printing services
- [ ] Card history and favorites system
- [ ] Social sharing capabilities
- [ ] Custom card sizes and orientations

### Technical Improvements
- [ ] Progressive image loading for better performance
- [ ] Offline card preview capabilities
- [ ] Advanced print layout options
- [ ] Integration with calendar for occasion reminders

## Troubleshooting

### Common Issues
1. **Images not generating**: Check backend API connectivity and tool availability
2. **Print layout issues**: Ensure browser allows pop-ups for print window
3. **Download failures**: Check browser download permissions and popup blockers

### Support
For technical support or feature requests, please contact the development team or create an issue in the project repository.

---

**Buddy's Card Studio** - Making every occasion special with AI-powered creativity! 🎉 