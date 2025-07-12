// Card tone/style options
export const cardTones = [
  { id: "funny", label: "😄 Funny", description: "Humorous and lighthearted" },
  { id: "genz-humor", label: "💀 GenZ Humor", description: "Internet memes, chaotic energy, and unhinged vibes" },
  { id: "romantic", label: "💕 Romantic", description: "Sweet and loving" },
  { id: "professional", label: "👔 Professional", description: "Formal and business-appropriate" },
  { id: "heartfelt", label: "❤️ Heartfelt", description: "Sincere and emotional" },
  { id: "playful", label: "🎉 Playful", description: "Fun and energetic" },
  { id: "elegant", label: "✨ Elegant", description: "Sophisticated and refined" },
  { id: "casual", label: "😊 Casual", description: "Relaxed and friendly" },
  { id: "inspirational", label: "🌟 Inspirational", description: "Motivating and uplifting" },
  { id: "quirky", label: "🤪 Quirky", description: "Unique and unconventional" },
  { id: "traditional", label: "🎭 Traditional", description: "Classic and timeless" },
];

// Curated artistic styles for beautiful cards
export const artisticStyles = [
  {
    id: "ai-smart-style", 
    label: "✨ Smart Style", 
    description: "Let our experts choose the perfect style for your card",
    promptModifier: ""
  },
  {
    id: "custom", 
    label: "✨ Custom Style", 
    description: "Define your own unique artistic style",
    promptModifier: ""
  },
  { 
    id: "watercolor", 
    label: "🎨 Watercolor", 
    description: "Soft, flowing paint effects (our personal favorite)",
    promptModifier: "in watercolor painting style, with soft flowing colors, artistic brush strokes, paper texture, and organic paint bleeds"
  },
  {
    id: "minimalist", 
    label: "✨ Minimalist", 
    description: "Clean, simple, elegant design",
    promptModifier: "in minimalist style with clean lines, simple shapes, plenty of white space, sophisticated typography, and elegant simplicity"
  },
  { 
    id: "botanical", 
    label: "🌿 Botanical", 
    description: "Beautiful flowers and nature elements",
    promptModifier: "in botanical illustration style with detailed flowers, leaves, and natural elements, soft organic shapes, elegant floral arrangements, and nature-inspired designs perfect for greeting cards"
  },
  { 
    id: "comic-book", 
    label: "💥 Comic Book", 
    description: "Bold graphic novel style",
    promptModifier: "in comic book art style with bold outlines, vibrant colors, dynamic poses, speech bubble aesthetics, halftone patterns, and superhero comic book visual elements that create an exciting and energetic feel"
  },
  { 
    id: "dreamy-fantasy", 
    label: "🌸 Dreamy Fantasy", 
    description: "Enchanting anime-inspired art",
    promptModifier: "in dreamy fantasy anime style, with soft pastels, magical atmosphere, detailed nature elements, whimsical characters, and enchanting fairy-tale qualities"
  },
  { 
    id: "art-deco", 
    label: "✨ Art Deco", 
    description: "Elegant 1920s geometric luxury",
    promptModifier: "in vintage Art Deco style with geometric patterns, gold accents, elegant typography, luxurious details, and 1920s glamour"
  },
  { 
    id: "vintage-illustration", 
    label: "📚 Vintage Illustration", 
    description: "Classic storybook charm",
    promptModifier: "in vintage illustration style like classic children's books, with warm nostalgic colors, charming characters, whimsical details, and timeless fairy-tale aesthetics"
  },
  {
    id: "modern-geometric", 
    label: "🔷 Modern Geometric", 
    description: "Clean contemporary shapes",
    promptModifier: "in modern geometric style with clean shapes, contemporary design elements, balanced compositions, and sophisticated color palettes perfect for modern greeting cards"
  },
  {
    id: "soft-pastel", 
    label: "🌸 Soft Pastel", 
    description: "Gentle, soothing colors",
    promptModifier: "in soft pastel style with gentle colors, dreamy atmosphere, delicate textures, and calming visual elements that create a peaceful and heartwarming feeling"
  },
  {
    id: "retro-vintage", 
    label: "📻 Retro Vintage", 
    description: "Classic 1950s-60s nostalgia",
    promptModifier: "in retro vintage style with 1950s-60s aesthetics, classic typography, warm nostalgic colors, and mid-century design elements"
  }
];

// Paper size options
export const paperSizes = [
  {
    id: "standard",
    label: "5×7 Card (Standard)",
    description: "Standard 5×7 greeting card (10×7 print layout)",
    aspectRatio: "9:16",
    dimensions: "1024x1536",
    printWidth: "10in",
    printHeight: "7in"
  },
  {
    id: "compact",
    label: "4×6 Card (Compact)",
    description: "Compact 4×6 greeting card (8×6 print layout)",
    aspectRatio: "2:3",
    dimensions: "768x1152",
    printWidth: "8in",
    printHeight: "6in"
  },
  {
    id: "a6",
    label: "A6 Card (4×6)",
    description: "A6 paper size (8.3×5.8 print layout)",
    aspectRatio: "2:3",
    dimensions: "768x1152",
    printWidth: "8.3in",
    printHeight: "5.8in"
  }
];

// Configuration for the backend API endpoint
export const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

// Type definitions
export interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;      // Portrait image - what recipients see first
  backCover: string;       // Portrait image - back of the card
  leftPage: string;        // Portrait image - left interior (decorative art)
  rightPage: string;       // Portrait image - right interior (message area)
  // Aliases for backward compatibility with different naming conventions
  leftInterior?: string;   // Alias for leftPage
  rightInterior?: string;  // Alias for rightPage
  createdAt: Date;
  shareUrl?: string;       // Shareable URL for the card
  // Store the actual prompts sent to image generation
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
  // Thumbnail URLs for faster loading
  thumbnails?: {
    frontCover?: string;
    backCover?: string;
    leftPage?: string;
    rightPage?: string;
  };
  // Style information for smart style mode
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

// Helper function to format generation time
export const formatGenerationTime = (durationSeconds: number) => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

// Helper function to format countdown as MM:SS
export const formatCountdown = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Photo Analysis Types
export interface PersonInPhoto {
  id: string;
  position: 'far-left' | 'left' | 'center-left' | 'center' | 'center-right' | 'right' | 'far-right';
  positionDescription: string; // e.g., "person on the far left wearing blue"
  description: string;
  apparentAge: string;
  gender?: string;
  hairColor: string;
  hairStyle: string;
  distinguishingFeatures: string;
  clothing: string;
  expression: string; // e.g., "smiling", "serious", "laughing"
}

export interface PhotoAnalysisResult {
  peopleCount: number;
  people: PersonInPhoto[];
  hasPets: boolean;
  petDescription?: string;
  backgroundDescription: string;
  setting: string; // e.g., "outdoor park", "indoor living room", "beach"
  overallMood: string; // e.g., "joyful", "formal", "casual"
  lighting: string; // e.g., "natural daylight", "indoor lighting"
}

export interface SelectedPerson extends PersonInPhoto {
  name?: string;
  relationshipToRecipient?: string; // e.g., "son", "friend", "colleague"
  includeInCard: boolean;
}

export interface PhotoAnalysis {
  imageUrl: string;
  imageIndex: number;
  analysisResult: PhotoAnalysisResult;
  selectedPeople: SelectedPerson[];
  includeEveryone: boolean;
  groupRelationship?: string; // Overall relationship (e.g., "family", "friends", "colleagues")
  excludedCount: number;
  specialInstructions?: string; // Any special user instructions for the photo
  analyzed: boolean;
  analysisFailed?: boolean;
  analysisError?: string;
}