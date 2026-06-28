import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure body-parser to support large image payloads
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  // API Route: Analyze Image
  app.post("/api/analyze-image", async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { imageBase64, mimeType, customApiKey, customModelId, customPrompt } = req.body;

      if (!imageBase64) {
        res.status(400).json({ error: "Rasm ma'lumotlari (base64) topilmadi." });
        return;
      }

      // 1. Initialize Gemini client
      // Use custom API key if provided by user in settings, otherwise fallback to server's GEMINI_API_KEY
      const apiKey = customApiKey ? customApiKey.trim() : process.env.GEMINI_API_KEY;

      if (!apiKey) {
        res.status(401).json({
          error: "Gemini API kaliti topilmadi. Sozlamalar bo'limidan shaxsiy kalitingizni kiriting yoki server sozlamalarini tekshiring."
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // 2. Select Model
      // Use custom model ID if provided, otherwise default to gemini-3.5-flash
      const modelId = customModelId ? customModelId.trim() : "gemini-3.5-flash";

      // 3. Prepare Image Part
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: cleanBase64,
        },
      };

      // 4. Prompt for Adobe Stock metadata guidelines
      const userPromptSnippet = customPrompt && typeof customPrompt === "string" && customPrompt.trim()
        ? `\n\nADDITIONAL USER INSTRUCTIONS (CRITICAL): ${customPrompt.trim()}`
        : "";

      const promptText = `Analyze this image and provide metadata optimized for Adobe Stock marketplace.
The output MUST be in English because Adobe Stock is a global marketplace and recommends metadata in English to maximize sales.

Guidelines:
1. Title: Create a high-quality, descriptive, commercially appealing title. Length should be 5-75 characters. Avoid search-spamming or repeating keywords. It should describe the main subject, setting, and style (e.g., 'Minimalist ceramic mug on wooden table in morning sunlight').
2. Keywords: Generate between 20 to 45 highly relevant, descriptive, commercial keywords. Lowercase only, single words or short natural phrases. DO NOT use generic spam keywords. Order them by relevance (most important keywords must come first, as Adobe Stock ranking prioritizes the first keywords).
3. Category: Choose the most accurate Adobe Stock category number (1 to 21) based on the following precise definitions:
   1 (Animals): Pets, wild animals, birds, insects, fish, marine life, and any scene where animals are the primary focus.
   2 (Buildings and Architecture): Interior or exterior of buildings, houses, skyscrapers, historical monuments, bridges, structures, or architectural details.
   3 (Business): Office environments, business people working, computers, financial charts, documents, corporate concepts, desks, currency/money, or professional meetings.
   4 (Drinks): Beverages, cups, mugs, bottles, pouring liquids, tea, coffee, wine, beer, cocktails, juices, or any drinks-focused visual.
   5 (The Environment): Ecological concepts, recycling, clean energy (solar panels, wind turbines), pollution, environmental preservation, climate change, or weather.
   6 (States of Mind): Abstract or conceptual graphics representing emotions, feelings, thoughts, love, happiness, stress, mental health, ideas, or dreams.
   7 (Food): Meals, dishes, ingredients, vegetables, fruits, baking, cooking, restaurants, culinary arts, or closeups of food plates.
   8 (Graphic Resources): Abstract backgrounds, textures, patterns, wallpapers, icons, isolated 3D graphics, frames, vectors, or mockups where the focus is the graphical element itself.
   9 (Religions): Religious objects, shrines, sacred texts, or scenes focusing purely on faith (if not covered by general Culture).
  10 (Industry): Factories, construction sites, heavy machinery, hand tools, manufacturing lines, warehouse operations, workers with safety gear, or engineering.
  11 (Landscapes): Mountain ranges, oceans, beaches, forests, sunsets, sunrises, wilderness, deserts, rivers, or scenery without any prominent human activity or city focus.
  12 (Lifestyle): Everyday life, family activities, friends hanging out, domestic scenes, hobbies, casual portraits showing people doing things in their daily environment.
  13 (People): Portraits, closeups of faces, hands, bodies, diverse individuals or groups where the main focus is the human subject itself, not their specific lifestyle activity.
  14 (Plants and Flowers): Macro shots of flowers, leaves, trees, gardens, houseplants, botanical details, or flora.
  15 (Culture and Religion): Art galleries, painting tools, musical instruments, traditional costumes, folk dances, historical artifacts, libraries, books, theaters, or cultural festivals.
  16 (Science): Laboratories, medical research, doctors, healthcare gear, microscopes, space, planets, DNA models, molecules, or scientific tests.
  17 (Social Issues): Poverty, protests, politics, human rights, social conflicts, accessibility, discrimination, or community issues.
  18 (Sports): Athletics, gyms, exercises, fitness, running, games (football, basketball, tennis), yoga, sports equipment, or sports venues.
  19 (Technology): Modern devices (smartphones, VR headsets, microchips), AI, programming, virtual screens, cloud computing, cyber security, robots, or futuristic concepts.
  20 (Transport): Cars, airplanes, trains, boats, bicycles, roads, public transit, engines, tires, or vehicle-focused closeups.
  21 (Travel): Landmarks (Eiffel Tower, pyramids, etc.), suitcases, passport, maps, tourists exploring, scenic vacation spots, or travel-specific experiences.

Return the response in valid JSON according to the specified schema.${userPromptSnippet}`;

      // 5. Call Gemini API with structured output
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [imagePart, { text: promptText }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "A descriptive, high-quality, commercial title in English. Max 75 characters.",
              },
              keywords: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                },
                description: "List of 20 to 45 highly relevant lowercase keywords, sorted by relevance.",
              },
              category: {
                type: Type.INTEGER,
                description: "The selected category number (1-21) according to Adobe Stock guidelines.",
              },
              categoryName: {
                type: Type.STRING,
                description: "English name of the selected category.",
              },
            },
            required: ["title", "keywords", "category", "categoryName"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Gemini API didn't return any text response.");
      }

      // Parse the JSON output and send back
      const metadata = JSON.parse(responseText.trim());
      res.json(metadata);

    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({
        error: error.message || "Rasm tahlil qilinayotganda kutilmagan xatolik yuz berdi.",
        details: error.toString(),
      });
    }
  });

  // Serve static files / Vite client middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
