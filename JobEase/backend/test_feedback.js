require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-3-flash-preview';


async function testFeedback() {
    const prompt = `You are JobEase Performance Evaluator. Evaluate the candidate's interview performance based on the conversation log below.
    The interview type was: Technical.

    Log:
    INTERVIEWER: What is a closure in JS?
    CANDIDATE: A closure is the combination of a function bundled together with references to its surrounding state.
    INTERVIEWER: Can you give an example?
    CANDIDATE: Like when a function returns another function that uses a variable from the outer function.

    Instruction:
    Generate a detailed performance report. Return ONLY a valid JSON object matching exactly this structure:
    {
      "communication": (number 0-100),
      "techAccuracy": (number 0-100),
      "contentQuality": (number 0-100),
      "strengths": ["List of 3 strengths"],
      "improvements": ["List of 3 exact areas to improve, be highly specific to topics they missed"],
      "analysis": "A detailed 2-3 sentence overall analysis of their performance."
    }`;

    console.log("Generating feedback using Gemini...");
    try {
        const response = await genai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
        });
        console.log("\nFeedback Result:");
        console.log(response.text);
    } catch(e) {
        console.error("Error generating feedback:", e);
    }
}
testFeedback();
