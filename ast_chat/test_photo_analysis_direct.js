// Test photo analysis using chatWithAI directly
import { chatWithAI } from './hooks/cardStudio/utils.js';
import fs from 'fs';
import path from 'path';

async function testPhotoAnalysis() {
  console.log('🧪 Testing photo analysis with chatWithAI...');
  
  try {
    // Read the test image
    const imagePath = '/var/www/flask_app/ast_chat/test_image.jpg';
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    
    console.log('📸 Image loaded, size:', imageBuffer.length, 'bytes');
    
    const analysisPrompt = `Analyze this photo and identify all people visible. For each person:
1. Describe their position in the image (far-left, left, center-left, center, center-right, right, far-right)
2. Provide a brief description of their appearance
3. Estimate their apparent age range (e.g., "20-25", "40s", "elderly")
4. Note their hair color and style
5. Describe their clothing
6. Note any distinguishing features
7. Describe their expression/mood
8. Also note if there are any pets, the background/setting, overall mood, and lighting

Return a detailed JSON response following the schema provided.`;

    const jsonSchema = {
      type: "object",
      properties: {
        peopleCount: { type: "number", description: "Total number of people in the photo" },
        people: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier like 'person-1'" },
              position: { 
                type: "string", 
                enum: ["far-left", "left", "center-left", "center", "center-right", "right", "far-right"],
                description: "Position in the image"
              },
              description: { type: "string", description: "Brief description of appearance" },
              apparentAge: { type: "string", description: "Estimated age range" },
              hairColor: { type: "string", description: "Hair color" },
              hairStyle: { type: "string", description: "Hair style description" },
              clothing: { type: "string", description: "Description of clothing" },
              distinguishingFeatures: { type: "string", description: "Notable features" },
              expression: { type: "string", description: "Facial expression or mood" }
            },
            required: ["id", "position", "description", "apparentAge", "hairColor", "clothing", "expression"]
          }
        },
        pets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "Type of pet (dog, cat, etc.)" },
              description: { type: "string", description: "Description of the pet" },
              position: { type: "string", description: "Position in image" }
            }
          }
        },
        backgroundSetting: { type: "string", description: "Description of background/setting" },
        overallMood: { type: "string", description: "Overall mood of the photo" },
        lighting: { type: "string", description: "Lighting conditions" },
        recommendedCardTone: {
          type: "string",
          enum: ["funny", "heartfelt", "romantic", "professional", "inspirational", "cute"],
          description: "Recommended card tone based on photo mood"
        }
      },
      required: ["peopleCount", "people", "backgroundSetting", "overallMood", "lighting"]
    };

    console.log('🚀 Calling chatWithAI with photo analysis request...');
    
    const result = await chatWithAI(analysisPrompt, {
      attachments: [base64Image],
      model: "gemini-2.5-pro", 
      jsonSchema: jsonSchema
    });
    
    console.log('✅ Analysis complete!');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error during photo analysis:', error);
  }
}

// Run the test
testPhotoAnalysis();