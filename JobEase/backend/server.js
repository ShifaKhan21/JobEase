require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-3-flash-preview';

async function callGemini(prompt) {
  try {
    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API error:", error);
    throw error;
  }
}

function extractJSON(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end >= start) {
      return JSON.parse(text.substring(start, end + 1));
    }
  } catch (e) {
    console.error("JSON parsing error:", e);
  }
  return null;
}


async function generateFollowUpQuestion(previousQuestion, response) {
  const prompt = `Task: Generate Follow-up Question\nPrevious Question: ${previousQuestion}\nResponse: ${response}\nGenerate a highly relevant follow-up question based on the user's response:`;
  try {
    const text = await callGemini(prompt);
    return text.trim();
  } catch(e) {
    return "Can you elaborate on your response further?";
  }
}

async function generateQuestion(context) {
  // Truncate resume text to avoid token limits (approx 3000 chars)
  const resumeContext = context.resumeText ? context.resumeText.substring(0, 3000) : "No resume text provided.";

  let performanceContext = "";
  if (context.previousPerformance) {
     const score = Math.floor((context.previousPerformance.communication + context.previousPerformance.techAccuracy + context.previousPerformance.contentQuality)/3) || 80;
     if (score > 85) {
        performanceContext = `CRITICAL: The candidate performed exceptionally well in their last interview (Score: ${score}%). You MUST ask ADVANCED, deeper level scenario and architecture questions. Do NOT ask basic definitional questions.`;
     } else if (score < 70) {
        performanceContext = `CRITICAL: The candidate struggled in their last interview (Score: ${score}%). Ensure the questions are slightly foundational but relevant. Keep difficulty moderate to easy.`;
     } else {
        performanceContext = `The candidate had an average performance in their last interview (Score: ${score}%). Maintain a standard level of difficulty.`;
     }
  }

  let typeSpecificInstructions = "";
  if (context.interviewType === 'technical') {
    if (context.isFollowUp) {
      typeSpecificInstructions = `You MUST ask a strictly TECHNICAL FOLLOW-UP question that digs deeper into the candidate's last answer. ASSESS THEIR ANSWER STRENGTH: If their answer was strong/accurate, SIGNIFICANTLY INCREASE the difficulty level of the follow-up question. If it was weak, ask a foundational/easier follow-up. Do NOT change the topic abruptly. Ensure the question probes their technical understanding of ${context.domain} based on what they just stated.`;
    } else {
      typeSpecificInstructions = `You MUST ask a strictly TECHNICAL question based on the extracted skills (${context.domain}). Focus on coding concepts, architecture, debugging, or specific tools.`;
    }
  } else if (context.interviewType === 'behavioral') {
    if (context.isFollowUp) {
      typeSpecificInstructions = `You MUST ask a BEHAVIORAL/HR FOLLOW-UP question based on their last answer. ASSESS THEIR ANSWER STRENGTH: If their answer lacked detail, ask a more pressing follow-up. Ask for a specific example, or probe their conflict resolution, leadership, or teamwork regarding what they just described.`;
    } else {
      typeSpecificInstructions = "You MUST ask an HR/BEHAVIORAL question (e.g., leadership, past failures, teamwork). Do NOT ask technical implementation questions.";
    }
  } else {
    if (context.isFollowUp) {
      typeSpecificInstructions = `You MUST ask a FOLLOW-UP question based on the user's last answer, probing deeper. ASSESS THEIR ANSWER STRENGTH: Increase/decrease difficulty based on if they answered well. Depending on what they just said, evaluate their technical skills (${context.domain}) or their behavioral traits.`;
    } else {
      typeSpecificInstructions = `Since the interview type is Mixed, you MUST ask either a technical question about their skills (${context.domain}) OR a behavioral/HR question. Mix them up.`;
    }
  }

  let lastAnswerSection = context.isFollowUp ? `\nLAST ANSWER GIVEN BY USER:\n${context.lastAnswer}` : "";

  const prompt = `You are JobEase AI Interviewer conducting a ${context.interviewType} interview.

CRITICAL BEHAVIOR (MUST FOLLOW):
1. You are NOT a generic question generator.
2. ${typeSpecificInstructions}
3. If referring to past experience, make sure it is linked to a project, experience, or skill mentioned in the resume.
4. STRICTLY FORBIDDEN:
   - Repeating any previous question.
   - Hallucinating technologies not in resume or skills.
5. Ask ONLY ONE question at a time.
6. ${performanceContext}

RESUME:
${resumeContext}

SKILLS / DOMAIN:
${context.domain}

ALREADY ASKED:
${(context.previousQuestions || []).join('\n')}${lastAnswerSection}

INSTRUCTIONS:
Generate exactly ONE interview question. Return ONLY a valid JSON object. Do not include markdown blocks.

{
  "question": "Your interview question goes here",
  "from": "project/exp/skill name or behavioral trait",
  "intent": "concept/design/debug/behavioral/HR",
  "difficulty": "easy/medium/hard"
}`;

  try {
    const rawOutput = await callGemini(prompt);
    const parsed = extractJSON(rawOutput);
    if (parsed && parsed.question) {
      return parsed.question;
    }
    return rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
  } catch (error) {
    console.error("Error in generateQuestion:", error);
    return "Could you describe your technical background?";
  }
}

async function generateQuestions(resumeText, skills, interviewType, count = 10, previousQuestions = [], previousPerformance = null) {
  try {
    const questions = [];
    for (let i = 0; i < count; i++) {
      const context = {
        resumeText: resumeText || "",
        interviewType,
        domain: skills.slice(0, 5).join(', '),
        experienceLevel: 'mid-level',
        difficulty: 'medium',
        previousPerformance
      };
      const q = await generateQuestion({ ...context, previousQuestions: [...previousQuestions, ...questions] });
      questions.push(String(q).trim());
    }
    return questions;
  } catch (error) {
    console.error('Error generating questions with model:', error);
    // Build a non-repeating randomized list
    const pool = FALLBACK_QUESTIONS[interviewType] || FALLBACK_QUESTIONS.technical;
    const filtered = pool.filter(q => !previousQuestions.includes(q));
    // Shuffle
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
    return filtered.slice(0, Math.max(1, Math.min(count, filtered.length)));
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'JobEase API Server is running!' });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});

// Resume processing endpoint
app.post('/api/process-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No resume file uploaded' });
    }

    const resumePath = req.file.path;
    const interviewType = req.body.type || 'technical';

    // Extract skills and text from resume
    const { text: resumeText, skills } = await extractSkillsFromResume(resumePath);

    // Clean up uploaded file (ignore errors)
    try { fs.unlinkSync(resumePath); } catch { }

    res.json({ success: true, skills, resumeText, interviewType });
  } catch (error) {
    console.error('Error processing resume:', error);
    // Last-resort response with safe defaults
    res.status(200).json({
      success: true,
      skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL'],
      resumeText: "Fallback text",
      interviewType: req?.body?.type || 'technical'
    });
  }
});

// Endpoint to start interview (generates initial questions using modified skills)
app.post('/api/start-interview', async (req, res) => {
  try {
    const { resumeText, skills, interviewType, previousPerformance } = req.body;
    let questions = [];
    try {
      questions = await generateQuestions(resumeText, skills, interviewType, 5, [], previousPerformance);
    } catch (e) {
       console.error('Model generation failed, falling back:', e);
       const pool = FALLBACK_QUESTIONS[interviewType] || FALLBACK_QUESTIONS.technical;
       questions = pool.slice(0, 3);
    }
    res.json({ success: true, questions });
  } catch (error) {
    console.error('Error generating initial questions:', error);
    res.status(200).json({
      success: true,
      questions: [
        'Explain the difference between let, const, and var in JavaScript.',
        'How would you optimize a React component that re-renders frequently?'
      ]
    });
  }
});

// Generate next question endpoint
app.post('/api/generate-question', async (req, res) => {
  try {
    const { skills, interviewType, previousQuestions = [], userResponse, previousPerformance } = req.body;

    let nextQuestion;
    try {
      nextQuestion = await generateNextQuestion(skills, interviewType, previousQuestions, userResponse, previousPerformance);
    } catch (e) {
      nextQuestion = 'What are your thoughts on this approach?';
    }

    console.log(`Generated follow-up question: ${nextQuestion}`);

    res.json({ success: true, question: nextQuestion });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(200).json({ success: true, question: 'Can you elaborate on that?' });
  }
});

// Process text response endpoint (formerly audio)
app.post('/api/process-audio', async (req, res) => {
  try {
    const { userText, question, interviewType } = req.body;

    const feedback = await processTextResponse(userText, question, interviewType);

    res.json({
      success: true,
      feedback: feedback
    });
  } catch (error) {
    console.error('Error processing response:', error);
    res.status(500).json({ error: 'Failed to process response' });
  }
});

// Endpoint to generate actual performance feedback using Gemini 2.0
app.post('/api/generate-report', async (req, res) => {
  try {
    const { interviewHistory, type } = req.body;
    
    // Check if enough data to evaluate
    if (!interviewHistory || interviewHistory.length < 2) {
      return res.status(400).json({ error: 'Not enough interview data to generate report' });
    }

    const conversationContext = interviewHistory.map(h => `${h.type.toUpperCase()}: ${h.content}`).join('\n');

    const prompt = `You are JobEase Performance Evaluator. Evaluate the candidate's interview performance based on the conversation log below.
    The interview type was: ${type || 'Technical'}.

    Log:
    ${conversationContext}

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

    const rawOutput = await callGemini(prompt);
    
    const parsedData = extractJSON(rawOutput);
    if (parsedData) {
      return res.json({ success: true, report: parsedData });
    } else {
      throw new Error("Invalid output format from model");
    }

  } catch(error) {
    console.error("Error generating report:", error);
    // Fallback object
    res.json({
      success: true, 
      report: {
        communication: 75,
        techAccuracy: 70,
        contentQuality: 80,
        strengths: ["Clear phrasing", "Positive attitude", "Basic understanding"],
        improvements: ["Dive deeper into specific tech tools", "Avoid short answers", "Provide real examples"],
        analysis: "Simulated report due to a generation error. The candidate displayed average proficiency."
      }
    });
  }
});

// Helper functions
async function extractSkillsFromResume(resumePath) {
  try {
    const dataBuffer = fs.readFileSync(resumePath);
    const data = await pdf(dataBuffer);
    const text = data.text;

    // Simple mock skill extraction based on text presence
    // In a real app, use a better NLP approach
    const possibleSkills = [
      'JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'MongoDB',
      'AWS', 'Docker', 'Git', 'TypeScript', 'Java', 'C++',
      'Machine Learning', 'Data Analysis', 'Project Management',
      'Communication', 'Leadership', 'Problem Solving'
    ];

    const foundSkills = possibleSkills.filter(skill =>
      text.toLowerCase().includes(skill.toLowerCase())
    );

    // If no skills found, fallback to random (or empty)
    const skills = foundSkills.length > 0 ? foundSkills :
      possibleSkills.slice(0, Math.floor(Math.random() * 5) + 3);

    return { text, skills };
  } catch (error) {
    console.error("PDF Parsing failed:", error);
    return { text: "", skills: ["JavaScript", "React"] };
  }
}

// This function is now imported from model_training_config.js

// Define fallback questions at top level
const FALLBACK_QUESTIONS = {
  technical: [
    "Explain the difference between let, const, and var in JavaScript.",
    "How would you optimize a React component that's re-rendering too frequently?",
    "Describe the event loop in Node.js and how it handles asynchronous operations.",
    "What's the difference between closures and scope in JavaScript?",
    "How would you implement a debounce function from scratch?",
    "Explain prototypal inheritance in JavaScript.",
    "What is memoization and when would you use it?",
    "How does HTTP/2 differ from HTTP/1.1?",
    "What are React keys and why are they important?",
    "Explain the CAP theorem."
  ],
  behavioral: [
    "Tell me about a time when you had to work under pressure.",
    "Describe a situation where you had to learn a new technology quickly.",
    "Give me an example of how you handled a difficult team member.",
    "Tell me about a project that didn't go as planned and how you handled it.",
    "Describe a time when you had to explain a complex technical concept to a non-technical person.",
    "Tell me about a time you received critical feedback and how you handled it.",
    "Describe a situation where you had conflicting priorities.",
    "How do you handle disagreements within a team?",
    "Give an example of taking initiative.",
    "Tell me about a time you failed and what you learned."
  ],
  mixed: [
    "Walk me through how you would debug a performance issue in a web application.",
    "Tell me about a challenging project you worked on and the technical decisions you made.",
    "How do you stay updated with the latest technologies in your field?",
    "Describe a time when you had to refactor legacy code. What was your approach?",
    "Tell me about a time when you had to work with a difficult stakeholder on a technical project.",
    "Explain a system you designed. What trade-offs did you make?",
    "How would you design a rate limiter?",
    "Describe a time you balanced speed vs. quality.",
    "When is it appropriate to use microservices?"
  ]
};

async function generateNextQuestion(skills, interviewType, previousQuestions, userResponse, previousPerformance = null) {
  const isFollowUp = userResponse && userResponse.trim().length > 0 && previousQuestions.length > 0;
  
  const context = {
    resumeText: "", 
    interviewType,
    domain: skills.slice(0, 5).join(', '),
    previousPerformance,
    previousQuestions,
    lastAnswer: userResponse,
    isFollowUp
  };

  // Directly ask the model to generate the next question matching exactly the category rules!
  const q = await generateQuestion(context);
  if (q) return q;

  // Fallback to follow-up questions
  const followUpQuestions = [
    "Could you elaborate on how your skills apply to this scenario?",
    "Can you walk me through your thought process for that?",
    "What specific challenges did you face previously?"
  ];

  return followUpQuestions[Math.floor(Math.random() * followUpQuestions.length)];
}

async function processTextResponse(userText, question, interviewType) {
  if (!userText || userText.trim().length === 0) {
    return {
      transcription: "",
      feedback: {
        summary: "No spoken response detected.",
        score: 0,
        suggestions: ["Please make sure your microphone is working and you speak clearly."]
      }
    };
  }

  try {
    const prompt = `You are an AI interviewer evaluating a candidate's text response.
The question asked was: "${question}".
The candidate's response is: "${userText}".
The interview type is: ${interviewType}.

Please evaluate the candidate's response, and provide detailed feedback in JSON format exactly matching this structure:
{
  "transcription": "The exact valid text of what the candidate said (formatted nicely and spell-checked)",
  "feedback": {
    "summary": "1-2 sentences summarizing their answer and its quality",
    "score": (a number between 0 and 100),
    "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
  }
}
Return ONLY valid JSON.`;

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

    const parsed = extractJSON(response.text);
    if (parsed) {
      return parsed;
    }
    
    throw new Error("Invalid output format from model");

  } catch (err) {
    console.error("Error processing response in processTextResponse:", err);
    return {
      transcription: userText,
      feedback: {
        summary: "Response could not be properly evaluated.",
        score: 50,
        suggestions: ["Try providing more detailed answers."]
      }
    };
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 JobEase server is running on port ${PORT}`);
  console.log(`📱 Frontend should connect to: http://localhost:${PORT}`);
});
