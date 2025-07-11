import { PhotoAnalysis } from '@/hooks/cardStudio/constants';
import { v4 as uuidv4 } from 'uuid';

export interface CardConfig {
  cardType: string;
  customCardType?: string;
  tone: string;
  toneDescription: string;
  theme: string;
  toField?: string;
  fromField?: string;
  message?: string;
  isHandwrittenMessage?: boolean;
  artisticStyle?: {
    label: string;
    promptModifier: string;
  };
  referenceImageUrls?: string[];
  photoAnalyses?: PhotoAnalysis[];
  isFrontBackOnly?: boolean;
  selectedImageModel?: string;
}

// Visual density recommendations by card type
const CARD_TYPE_DENSITIES = {
  'sympathy': { back: 5, leftInterior: 20, rightInterior: 10 },
  'get-well': { back: 10, leftInterior: 30, rightInterior: 15 },
  'thank-you': { back: 15, leftInterior: 35, rightInterior: 20 },
  'wedding': { back: 10, leftInterior: 30, rightInterior: 15 },
  'birthday': { back: 20, leftInterior: 40, rightInterior: 20 },
  'anniversary': { back: 15, leftInterior: 35, rightInterior: 15 },
  'congratulations': { back: 20, leftInterior: 40, rightInterior: 20 },
  'new-baby': { back: 15, leftInterior: 35, rightInterior: 20 },
  'holiday': { back: 20, leftInterior: 40, rightInterior: 25 },
  'default': { back: 15, leftInterior: 35, rightInterior: 20 }
};

export interface DraftConfig {
  cardType: string;
  customCardType?: string;
  tone: string;
  toneLabel: string;
  toneDescription: string;
  theme: string;
  toField?: string;
  fromField?: string;
  artisticStyle?: {
    label: string;
    promptModifier: string;
  };
  referenceImageUrls?: string[];
  photoAnalyses?: PhotoAnalysis[];
  isDraftVariation?: boolean;
  variationIndex?: number;
}

export interface MessageConfig {
  cardType: string;
  customCardType?: string;
  tone: string;
  toneLabel: string;
  toneDescription: string;
  theme: string;
  toField?: string;
  fromField?: string;
  relationshipField?: string;
  photoAnalyses?: PhotoAnalysis[];
}

export interface FinalFromDraftConfig {
  frontCoverPrompt: string;
  cardType: string;
  customCardType?: string;
  theme: string;
  tone: string;
  toneDescription: string;
  toField?: string;
  fromField?: string;
  message?: string;
  isHandwrittenMessage?: boolean;
  artisticStyle?: {
    label: string;
    promptModifier: string;
  };
  isFrontBackOnly?: boolean;
}

export interface CardPrompts {
  frontCover: string;
  backCover: string;
  leftInterior?: string;
  rightInterior?: string;
}

export class PromptGenerator {
  // Core requirements shared across all prompts
  private static readonly SAFETY_REQUIREMENTS = `
- SAFETY: Never include brand names, character names, trademarked terms, or inappropriate content
- Keep content family-friendly and appropriate for all ages
- If the theme references trademarked content, use generic alternatives or focus on the emotions/concepts instead`.trim();

  // Helper to get visual density for card type
  private static getVisualDensity(cardType: string): typeof CARD_TYPE_DENSITIES.default {
    return CARD_TYPE_DENSITIES[cardType as keyof typeof CARD_TYPE_DENSITIES] || CARD_TYPE_DENSITIES.default;
  }

  private static readonly LAYOUT_REQUIREMENTS = `
- Flat 2D artwork for printing
- Full-bleed backgrounds extending to edges
- Keep text, faces, and key elements at least 10% away from top/bottom edges
- Keep text/faces 0.5" from left/right edges for safe printing`.trim();

  private static readonly REFERENCE_PHOTO_INSTRUCTIONS = `
- Reference photos provided for character creation
- Characters should only appear on the front cover
- Transform real people into artistic cartoon/illustrated versions matching the style
- Maintain recognizable features while adapting to the artistic style`.trim();

  private static readonly TEXT_LEGIBILITY_REQUIREMENTS = `
- EXACT TEXT REPRODUCTION: The message text must be reproduced EXACTLY as written - every word, punctuation mark, and character must be perfect
- PUT TEXT IN QUOTES: Always enclose the message text in double quotes to make it clear this is literal text to be rendered exactly
- CRYSTAL CLEAR LEGIBILITY: The handwriting must be extremely readable - prioritize clarity over artistic flourishes
- NO SPELLING ERRORS: Every word must be spelled correctly exactly as provided
- PROPER SPACING: Use appropriate letter spacing, word spacing, and line spacing for easy reading
- CONTRAST: Ensure high contrast between text and background for maximum readability
- SIZE: Make text large enough to read easily - avoid cramped or tiny text
- COMPLETE MESSAGE: Include the ENTIRE message text - do not truncate, abbreviate, or omit any part
- Use beautiful, clearly readable handwritten cursive script that feels elegant and personal
- Position the message text in the optimal location for readability (center area, avoid top/bottom 10%)`.trim();

  private static getEnhancedReferencePhotoInstructions(photoAnalyses?: PhotoAnalysis[]): string {
    // If no photo analyses, use basic instructions
    if (!photoAnalyses || photoAnalyses.length === 0) {
      return `
CRITICAL CHARACTER REFERENCE INSTRUCTIONS:
- The attached photos show the exact people/characters to include
- Create cartoon/illustrated versions of these specific individuals
- Capture their unique features, hair, clothing style
- Do NOT create generic characters - use the reference photos
- Match their appearance while adapting to the artistic style`.trim();
    }

    // Build detailed instructions from photo analyses
    const analyzedPhotos = photoAnalyses.filter(a => a.analyzed && !a.analysisFailed);
    if (analyzedPhotos.length === 0) {
      return this.getEnhancedReferencePhotoInstructions(); // Fallback to basic
    }

    const allSelectedPeople = analyzedPhotos.flatMap(a => a.selectedPeople.filter(p => p.includeInCard));
    const totalExcluded = analyzedPhotos.reduce((sum, a) => sum + a.excludedCount, 0);
    
    let instructions = `
CRITICAL CHARACTER REFERENCE INSTRUCTIONS:
- Create cartoon/illustrated versions of EXACTLY ${allSelectedPeople.length} specific ${allSelectedPeople.length === 1 ? 'person' : 'people'}:`;

    // Add details for each person
    allSelectedPeople.forEach((person, idx) => {
      instructions += `

Person ${idx + 1}: ${person.name || person.positionDescription}
- Position: ${person.positionDescription}
- Appearance: ${person.description}
- Age: ${person.apparentAge}
- Hair: ${person.hairColor} ${person.hairStyle}
- Clothing: ${person.clothing}
- Expression: Keep their ${person.expression} expression`;
      
      if (person.distinguishingFeatures) {
        instructions += `
- Features: ${person.distinguishingFeatures}`;
      }
      
      if (person.relationshipToRecipient) {
        instructions += `
- Relationship: ${person.relationshipToRecipient}`;
      }
    });

    // Add exclusion note if needed
    if (totalExcluded > 0) {
      instructions += `

IMPORTANT: ${totalExcluded} other ${totalExcluded === 1 ? 'person was' : 'people were'} in the reference photos but should NOT be included in the card.`;
    }

    // Add any special instructions
    const specialInstructions = analyzedPhotos
      .filter(a => a.specialInstructions)
      .map(a => a.specialInstructions)
      .join(' ');
    
    if (specialInstructions) {
      instructions += `

Special instructions: ${specialInstructions}`;
    }

    instructions += `

- Match their exact appearance while adapting to the artistic style
- Keep their relative positions if they appear together
- Maintain their expressions and mood`;

    return instructions.trim();
  }

  private static readonly QR_CODE_SPACE = `
- IMPORTANT: Leave the bottom-right corner area (approximately 1 inch square) completely clear and undecorated for QR code placement`.trim();

  // Generate prompts for all card sections with AI (includes images)
  static async generateCardPromptsWithAI(config: CardConfig): Promise<CardPrompts> {
    // For now, just return the regular prompts
    // TODO: Implement AI-powered prompt generation with images
    return this.generateCardPrompts(config);
  }
  
  // Generate prompts for all card sections
  static generateCardPrompts(config: CardConfig): CardPrompts {
    const cardTypeForPrompt = config.customCardType || config.cardType;
    const effectivePrompt = config.theme || `A beautiful ${cardTypeForPrompt} card`;
    const styleModifier = config.artisticStyle?.promptModifier || '';

    // Generate unique UUID for this card generation to ensure variety
    const uniqueId = uuidv4();

    // Build base prompt context
    const baseContext = `
Theme: "${effectivePrompt}"
Style: ${config.artisticStyle?.label || "Default"}
${config.toField ? `To: ${config.toField}` : ""}
${config.fromField ? `From: ${config.fromField}` : ""}
${!config.isFrontBackOnly && config.message ? `Message: "${config.message}"` : ""}
${config.referenceImageUrls?.length ? `Reference Photos: ${config.referenceImageUrls.length} photo(s) provided for character creation` : ""}
Unique ID: ${uniqueId}`.trim();

    // Generate individual section prompts
    const frontCover = this.generateFrontCoverPrompt(cardTypeForPrompt, effectivePrompt, styleModifier, config);
    const backCover = this.generateBackCoverPrompt(styleModifier, config.cardType);
    
    const prompts: CardPrompts = {
      frontCover,
      backCover
    };

    if (!config.isFrontBackOnly) {
      prompts.leftInterior = this.generateLeftInteriorPrompt(styleModifier, config.cardType);
      prompts.rightInterior = this.generateRightInteriorPrompt(config.message || '', config.isHandwrittenMessage || false, styleModifier, config.cardType);
    }

    return prompts;
  }

  // Generate prompt for draft cards (front cover only) - returns both prompt and images
  static generateDraftPromptWithImages(config: DraftConfig): { prompt: string; images: string[] } {
    const prompt = this.generateDraftPrompt(config);
    return {
      prompt,
      images: config.referenceImageUrls || []
    };
  }
  
  // Generate prompt for draft cards (front cover only)
  static generateDraftPrompt(config: DraftConfig): string {
    const cardTypeForPrompt = config.customCardType || config.cardType;
    const effectivePrompt = config.theme || `A beautiful ${cardTypeForPrompt} card`;
    let styleModifier = config.artisticStyle?.promptModifier || '';

    // Generate unique UUID for this draft variation
    const uniqueId = uuidv4();

    // Override style for Smart Style variations
    if (config.isDraftVariation && config.variationIndex !== undefined) {
      const smartStyles = [
        'watercolor painting style with flowing colors and soft edges',
        'beautiful botanical illustration with natural elements',
        'comic book style with bold colors and dynamic composition',
        'dreamy fantasy art with magical ethereal elements',
        'clean minimalist design with simple elegant shapes'
      ];
      if (config.variationIndex < smartStyles.length) {
        styleModifier = smartStyles[config.variationIndex];
      }
    }

    let prompt = `You are an expert AI greeting card designer. Create a front cover prompt for a ${cardTypeForPrompt} greeting card.

Theme: "${effectivePrompt}"
Style: ${config.artisticStyle?.label || "Default"}
Tone: ${config.toneLabel} - ${config.toneDescription}
${config.toField ? `To: ${config.toField}` : ""}
${config.fromField ? `From: ${config.fromField}` : ""}
${config.referenceImageUrls?.length ? `Reference Photos: I have attached ${config.referenceImageUrls.length} reference photo${config.referenceImageUrls.length > 1 ? 's' : ''} for character creation.` : ""}
Unique ID: ${uniqueId}

Front Cover Requirements:
- Include "${cardTypeForPrompt}" greeting text positioned safely in center area (avoid top/bottom 10%)
- Use beautiful, readable handwritten cursive script
- ${config.referenceImageUrls?.length ? this.getEnhancedReferencePhotoInstructions(config.photoAnalyses) : 'Create charming cartoon-style figures if needed'}
- Be creative and unique, avoid generic designs
- Flat 2D artwork for printing
- Style: ${styleModifier}

Return ONLY the front cover prompt as plain text.`;

    return prompt;
  }

  // Generate personalized message
  static generateMessagePrompt(config: MessageConfig): string {
    const cardTypeForPrompt = config.customCardType || config.cardType;
    const effectivePrompt = config.theme || `A beautiful ${cardTypeForPrompt} card with ${config.toneDescription} style`;

    // Build relationship context if available (for message tone/content)
    let relationshipContext = '';
    let contextParts = [];
    
    // First, prioritize the explicit relationship field from the form
    if (config.relationshipField && config.relationshipField.trim()) {
      contextParts.push(`Relationship: ${config.toField || 'the recipient'} is the sender's ${config.relationshipField}`);
    }
    
    // Then, add any additional context from photo analyses
    if (config.photoAnalyses && config.photoAnalyses.length > 0) {
      const selectedPeople = config.photoAnalyses.flatMap(analysis => 
        analysis.selectedPeople || []
      );
      
      if (selectedPeople.length > 0) {
        // Get people with age info (but not relationships since we have explicit field)
        const peopleWithAge = selectedPeople
          .filter(person => person.apparentAge)
          .map(person => {
            const name = person.name || config.toField || 'the recipient';
            return `${name} (${person.apparentAge} years old)`;
          });
        
        if (peopleWithAge.length > 0 && !contextParts.some(part => part.includes('years old'))) {
          contextParts.push(`Age context: ${peopleWithAge.join(', ')}`);
        }
        
        // Add group relationship if specified
        const groupRelationships = config.photoAnalyses
          .filter(a => a.groupRelationship)
          .map(a => a.groupRelationship);
        if (groupRelationships.length > 0) {
          contextParts.push(`Group relationship: ${groupRelationships.join(', ')}`);
        }
        
        // Only include special instructions if they relate to relationships/message content
        const specialInstructions = config.photoAnalyses
          .filter(a => a.specialInstructions)
          .map(a => a.specialInstructions)
          .filter(instruction => 
            instruction.toLowerCase().includes('relationship') || 
            instruction.toLowerCase().includes('message') ||
            instruction.toLowerCase().includes('tone')
          );
        if (specialInstructions.length > 0) {
          contextParts.push(`Special notes: ${specialInstructions.join('; ')}`);
        }
      }
    }
    
    if (contextParts.length > 0) {
      relationshipContext = `\n\nRelationship Context:\n${contextParts.join('\n')}`;
    }

    return `Create a ${config.toneDescription} message for a ${cardTypeForPrompt} greeting card.

Card Theme/Description: "${effectivePrompt}"
${config.toField ? `Recipient: ${config.toField}` : "Recipient: [not specified]"}
${config.fromField ? `Sender: ${config.fromField}` : "Sender: [not specified]"}
Card Tone: ${config.toneLabel} - ${config.toneDescription}${relationshipContext}

Instructions:
- Write a message that is ${config.toneDescription} and feels personal and genuine
- ${config.toField ? `ALWAYS start with a greeting like "Dear ${config.toField}," or "${config.toField}," or "Hey ${config.toField}," - choose the greeting style based on tone and relationship` : "Start with an appropriate greeting (Dear [Name], Hi [Name], etc.)"}
- ${config.fromField ? `Write as if ${config.fromField} is personally writing this message` : `Write in a ${config.toneDescription} tone`}
- Match the ${config.toneDescription} tone and occasion of the ${cardTypeForPrompt} card type
- Be inspired by the theme: "${effectivePrompt}"
${relationshipContext ? '- Use the relationship context to write an appropriate message (e.g., romantic for boyfriend/girlfriend, professional for coworkers, warm for family)\n- The tone should reflect the nature of the relationship' : ''}
- Keep the body concise but meaningful (2-4 sentences ideal)
- Make it feel authentic, not generic
${this.SAFETY_REQUIREMENTS}
${this.getToneSpecificInstructions(config.tone)}
- ${config.toField && config.fromField ? `Show the relationship between ${config.fromField} and ${config.toField} through the ${config.toneDescription} message tone` : ""}
- ${config.fromField ? `ALWAYS end with an appropriate closing and signature. Examples:\n  - Romantic: "With all my love, ${config.fromField}" or "Forever yours, ${config.fromField}"\n  - Friendly: "Best, ${config.fromField}" or "Cheers, ${config.fromField}" or "Your friend, ${config.fromField}"\n  - Family: "Love, ${config.fromField}" or "Hugs, ${config.fromField}"\n  - Professional: "Best regards, ${config.fromField}" or "Sincerely, ${config.fromField}"\n  - Funny: "Your favorite troublemaker, ${config.fromField}" or "Stay awesome, ${config.fromField}"` : "End with an appropriate closing (Best wishes, Warm regards, etc.)"}

Return ONLY the message text that should appear inside the card - no quotes, no explanations, no markdown formatting (no *bold*, _italics_, or other markdown), just the complete ${config.toneDescription} message in plain text.

IMPORTANT: Wrap your final message in <MESSAGE> </MESSAGE> tags. Everything outside these tags will be ignored.`;
  }

  // Generate remaining prompts based on existing front cover
  static generateFinalFromDraftPrompts(config: FinalFromDraftConfig): CardPrompts {
    const cardTypeForPrompt = config.customCardType || config.cardType;
    const effectivePrompt = config.theme || `A beautiful ${cardTypeForPrompt} card`;
    const styleModifier = config.artisticStyle?.promptModifier || '';

    // For now, keep the existing individual generation approach
    // TODO: Implement combined generation with AI chat
    const backCover = this.generateBackCoverPromptFromFront(config.frontCoverPrompt, styleModifier, config.cardType);
    
    const prompts: CardPrompts = {
      frontCover: config.frontCoverPrompt, // Keep existing front cover
      backCover
    };

    if (!config.isFrontBackOnly) {
      prompts.leftInterior = this.generateLeftInteriorPromptFromFront(config.frontCoverPrompt, styleModifier, config.cardType);
      prompts.rightInterior = this.generateRightInteriorPromptFromFront(
        config.frontCoverPrompt,
        config.message || '',
        config.isHandwrittenMessage || false,
        styleModifier,
        config.cardType
      );
    }

    return prompts;
  }

  // Generate all non-front prompts in a single AI call for better cohesion
  static async generateFinalFromDraftPromptsCombined(config: FinalFromDraftConfig): Promise<CardPrompts> {
    const cardTypeForPrompt = config.customCardType || config.cardType;
    const density = this.getVisualDensity(config.cardType);
    
    // Import chatWithAI dynamically to avoid circular dependencies
    const { chatWithAI } = await import('../hooks/cardStudio/utils');
    
    const systemPrompt = `You are an expert greeting card designer. Generate cohesive image prompts for the back cover, left interior, and right interior of a greeting card. The front cover has already been designed, and you need to create prompts that complement it while following specific design requirements.`;
    
    const userMessage = `Generate prompts for the remaining panels of a ${cardTypeForPrompt} greeting card.

CONTEXT - FRONT COVER (already designed):
"${config.frontCoverPrompt}"

IMPORTANT: The above front cover description is provided as CONTEXT ONLY. You should extract the color palette, artistic style, and overall aesthetic from it, but DO NOT copy characters, people, or specific scenes to other panels.

CARD DETAILS:
- Card Type: ${cardTypeForPrompt}
- Message to display: "${config.message || 'No message - handwritten space needed'}"
- Is Handwritten: ${config.isHandwrittenMessage ? 'Yes' : 'No'}
- Style Modifier: ${config.artisticStyle?.promptModifier || 'Default style'}

VISUAL DENSITY REQUIREMENTS:
- Back Cover: ${density.back}% decoration (very minimal)
- Left Interior: ${density.leftInterior}% decoration (subtle, complementary)
- Right Interior: ${density.rightInterior}% decoration (minimal, message-focused)

CRITICAL REQUIREMENTS:
1. NO PEOPLE, CHARACTERS, OR FIGURES on any interior pages or back cover
2. NO GREETING TEXT (like "Happy Birthday", "Thank You", etc.) on back cover or left interior - only decorative elements
3. Extract ONLY colors and artistic style from the front cover context
4. Each panel should feel cohesive but serve its specific purpose
5. Back cover must leave bottom-right corner clear for QR code
6. Right interior must prioritize message legibility if message is provided
7. NEVER include the card type greeting text anywhere except the front cover

${this.LAYOUT_REQUIREMENTS}
${this.SAFETY_REQUIREMENTS}`;

    const jsonSchema = {
      type: "object",
      properties: {
        backCover: {
          type: "string",
          description: "Complete prompt for back cover image generation"
        },
        leftInterior: {
          type: "string", 
          description: "Complete prompt for left interior image generation"
        },
        rightInterior: {
          type: "string",
          description: "Complete prompt for right interior image generation"
        }
      },
      required: ["backCover", "leftInterior", "rightInterior"]
    };

    try {
      const response = await chatWithAI(userMessage, {
        systemPrompt,
        model: 'gemini-2.5-pro',
        jsonSchema
      });

      // Response should already be parsed JSON due to jsonSchema
      const prompts: CardPrompts = {
        frontCover: config.frontCoverPrompt,
        backCover: response.backCover
      };

      if (!config.isFrontBackOnly) {
        prompts.leftInterior = response.leftInterior;
        prompts.rightInterior = response.rightInterior;
      }

      return prompts;
    } catch (error) {
      console.error('Failed to generate combined prompts, falling back to individual generation:', error);
      // Fall back to the original method
      return this.generateFinalFromDraftPrompts(config);
    }
  }

  // Private helper methods for generating individual sections
  private static generateFrontCoverPrompt(cardType: string, theme: string, styleModifier: string, config: CardConfig): string {
    // Generate unique ID for this specific panel
    const uniqueId = uuidv4();
    
    let prompt = `Create a beautiful front cover for a ${cardType} greeting card. ${theme}. Include "${cardType}" greeting text in elegant handwritten script positioned in the center area. ${styleModifier} ${this.LAYOUT_REQUIREMENTS} Unique ID: ${uniqueId}`;
    
    if (config.referenceImageUrls?.length) {
      prompt += ` ${this.getEnhancedReferencePhotoInstructions(config.photoAnalyses)}`;
    }
    
    return prompt;
  }

  private static generateBackCoverPrompt(styleModifier: string, cardType: string): string {
    const density = this.getVisualDensity(cardType);
    const uniqueId = uuidv4();
    return `Create a very minimal back cover design for a greeting card. Use only ${density.back}% decoration - perhaps a single small motif, a subtle pattern border, or gentle color wash. The design should be understated and elegant, leaving most of the space clean and peaceful. Think of it as a quiet ending to the card experience. IMPORTANT: NO PEOPLE, NO CHARACTERS, NO FIGURES, NO TEXT, NO WORDS, NO GREETING - only minimal abstract decorative elements. ${styleModifier} ${this.LAYOUT_REQUIREMENTS} ${this.QR_CODE_SPACE} Unique ID: ${uniqueId}`;
  }

  private static generateLeftInteriorPrompt(styleModifier: string, cardType: string): string {
    const density = this.getVisualDensity(cardType);
    const uniqueId = uuidv4();
    return `Create subtle, complementary decorative art for the left interior page of a greeting card. Use soft, muted versions of the card's color palette. Keep decoration minimal and elegant - think ${density.leftInterior}% visual density compared to the front cover. Focus on gentle patterns, soft watercolor washes, delicate florals, or abstract elements that won't compete with the message on the facing page. IMPORTANT: NO PEOPLE, NO CHARACTERS, NO FIGURES, NO TEXT, NO WORDS, NO GREETING - only decorative and artistic elements. ${styleModifier} ${this.LAYOUT_REQUIREMENTS} Unique ID: ${uniqueId}`;
  }

  private static generateRightInteriorPrompt(message: string, isHandwritten: boolean, styleModifier: string, cardType: string): string {
    const density = this.getVisualDensity(cardType);
    const cleanSpace = 100 - density.rightInterior;
    const uniqueId = uuidv4();
    
    if (isHandwritten) {
      return `Create an elegant writing space for the right interior page. Add very subtle decorative elements - perhaps just delicate corner flourishes or a faint border. Keep ${cleanSpace}% of the page clean white/cream space for handwriting. The decoration should whisper, not shout. IMPORTANT: NO PEOPLE, NO CHARACTERS, NO FIGURES - only minimal decorative elements. ${styleModifier} ${this.LAYOUT_REQUIREMENTS} Unique ID: ${uniqueId}`;
    }

    return `Create the right interior page with this exact message as the absolute focal point: "${message}". 
    
${this.TEXT_LEGIBILITY_REQUIREMENTS}

The message should be the star - use elegant handwritten script positioned perfectly for reading. Add only minimal decoration (${density.rightInterior}% of the page) such as:
- Delicate corner flourishes
- A single small decorative element above or below the text
- Very subtle background texture or soft color wash
- Thin, elegant border elements

The decoration should enhance the message, not compete with it. Think of a premium wedding invitation - mostly white space with perfect typography. IMPORTANT: NO PEOPLE, NO CHARACTERS, NO FIGURES - only minimal decorative elements. ${styleModifier} ${this.LAYOUT_REQUIREMENTS} Unique ID: ${uniqueId}`;
  }

  // Methods for generating from existing front cover
  private static generateBackCoverPromptFromFront(frontPrompt: string, styleModifier: string, cardType: string): string {
    const density = this.getVisualDensity(cardType);
    // Extract style elements from front cover but explicitly exclude any people/characters AND TEXT
    return `Create a very minimal back cover for a greeting card. Extract ONLY the color palette and artistic style from this description BUT create a much simpler design: "${frontPrompt}". 
    
Use only ${density.back}% visual density - perhaps a single small element, subtle corner detail, or soft color gradient. Most of the back should be clean, peaceful space. Think elegant minimalism. IMPORTANT: DO NOT include any people, characters, figures, text, words, or greeting messages. NO TEXT AT ALL - only minimal decorative elements. ${styleModifier} ${this.LAYOUT_REQUIREMENTS} ${this.QR_CODE_SPACE}`;
  }

  private static generateLeftInteriorPromptFromFront(frontPrompt: string, styleModifier: string, cardType: string): string {
    const density = this.getVisualDensity(cardType);
    // Extract style elements from front cover but explicitly exclude any people/characters AND TEXT
    return `Create subtle left interior page art for a greeting card. Extract the color palette and artistic style from this description BUT create a much softer, more minimal design (${density.leftInterior}% visual density): "${frontPrompt}". 
    
Use muted, pastel versions of the colors. Focus on gentle elements like soft watercolor washes, delicate patterns, or subtle textures. This page should complement but not compete with the message on the facing page. IMPORTANT: NO PEOPLE, NO CHARACTERS, NO FIGURES, NO TEXT, NO WORDS, NO GREETING MESSAGES. Only decorative elements. ${styleModifier} ${this.LAYOUT_REQUIREMENTS}`;
  }

  private static generateRightInteriorPromptFromFront(frontPrompt: string, message: string, isHandwritten: boolean, styleModifier: string, cardType: string): string {
    if (isHandwritten) {
      return `Create an elegant, minimal writing space for the right interior of a greeting card. Extract ONLY subtle style hints from: "${frontPrompt}". 
      
Keep 80% of the page as clean white/cream space for handwriting. Add only whisper-light decoration - perhaps faint corner flourishes or a delicate border. The page should feel premium and understated. NO PEOPLE, NO CHARACTERS, NO FIGURES. ${styleModifier} ${this.LAYOUT_REQUIREMENTS}`;
    }

    return `Create a right interior page where this message is the absolute star: "${message}". 

Use subtle style elements from the front design but keep decoration minimal (10-20% of page). Extract color hints from: "${frontPrompt}".

${this.TEXT_LEGIBILITY_REQUIREMENTS} 

Think premium stationery - mostly white space, perfect message placement, and just a touch of elegant decoration (corner details, small flourish, or soft wash). The message should dominate the visual hierarchy. NO PEOPLE, NO CHARACTERS, NO FIGURES. ${styleModifier} ${this.LAYOUT_REQUIREMENTS}`;
  }

  // Get tone-specific instructions
  private static getToneSpecificInstructions(tone: string): string {
    const toneInstructions: Record<string, string> = {
      'funny': '- Include appropriate humor that fits the occasion',
      'genz-humor': '- Use GenZ humor with internet slang, memes, and chaotic energy - think "no cap", "periodt", "it\'s giving...", "slay", etc. Be unhinged but endearing',
      'professional': '- Keep it formal and business-appropriate',
      'romantic': '- Include loving and romantic language',
      'playful': '- Use fun and energetic language'
    };

    return toneInstructions[tone] || '';
  }

  // Apply reference photo instructions if using GPT-1
  static enhancePromptWithReferencePhotos(prompt: string, hasReferencePhotos: boolean, model?: string): string {
    if (hasReferencePhotos && model === 'gpt-image-1') {
      return `${prompt}\n\n${this.REFERENCE_PHOTO_INSTRUCTIONS}`;
    }
    return prompt;
  }

  // Format prompt generation query for JSON response
  static formatPromptGenerationQuery(context: string, requirements: string, jsonStructure: string): string {
    return `Create prompts for a greeting card.

${context}

Requirements:
${this.LAYOUT_REQUIREMENTS}
${this.SAFETY_REQUIREMENTS}
${requirements}

Return JSON:
${jsonStructure}`;
  }
}