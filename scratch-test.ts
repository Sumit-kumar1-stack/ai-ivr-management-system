import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key beginning with:", apiKey ? apiKey.substring(0, 10) + "..." : "undefined");

const ai = new GoogleGenAI({
  apiKey: apiKey,
});

async function test() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello",
    });
    console.log("Success:", response.text);
  } catch (error: any) {
    console.log("--- ERROR CAUGHT ---");
    console.log("Name:", error.name);
    console.log("Status:", error.status);
    console.log("Status Code:", error.statusCode);
    console.log("Message:", error.message);
    console.log("Error properties:", Object.keys(error));
    console.log("Full error object structure:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  }
}

test();
