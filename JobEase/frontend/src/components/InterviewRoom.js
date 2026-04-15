import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import './InterviewRoom.css';

const InterviewRoom = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { type } = location.state || { type: 'technical' };
  const { currentUser } = useAuth();
  const [previousPerformance, setPreviousPerformance] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const fetchPerf = async () => {
      try {
        const q = query(
          collection(db, 'performanceReports'),
          where('userId', '==', currentUser.uid),
          where('interviewType', '==', type),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setPreviousPerformance(snap.docs[0].data());
        }
      } catch (e) {
        console.error('Error fetching past performance:', e);
      }
    };
    fetchPerf();
  }, [currentUser, type]);

  const [resume, setResume] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedSkillsStage, setExtractedSkillsStage] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [userResponse, setUserResponse] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [skills, setSkills] = useState([]);
  const [interviewHistory, setInterviewHistory] = useState([]);
  const [interimUserText, setInterimUserText] = useState('');
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [notes, setNotes] = useState('');
  const [isInterviewEnding, setIsInterviewEnding] = useState(false);

  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const interviewHistoryRef = useRef([]);

  useEffect(() => {
    interviewHistoryRef.current = interviewHistory;
  }, [interviewHistory]);

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (interimTranscript) setInterimUserText(interimTranscript);
        if (finalTranscript) {
          setUserResponse(prev => (prev ? prev + ' ' : '') + finalTranscript);
          setInterimUserText('');
        }
      };

      recognitionRef.current.onend = () => {
        // Automatically restart speech recognition if it stops while recording is active
        // This is a known workaround for Web Speech API silently halting
        const micBtn = document.querySelector('.mic-button');
        if (micBtn && micBtn.classList.contains('recording')) {
           try { recognitionRef.current.start(); } catch(e){}
        }
      };
    }
  }, []);

  const handleResumeUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      setResume(file);
    } else {
      alert('Please upload a PDF file');
    }
  };

  const processResume = async (resumeFile) => {
    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('type', type);

    try {
      const response = await fetch('/api/process-resume', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process resume');
      }

      const data = await response.json();
      return { skills: data.skills || [], resumeText: data.resumeText || '' };
    } catch (error) {
      console.error('Error processing resume:', error);
      return {
        skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL'],
        resumeText: ''
      };
    }
  };

  const generateQuestions = async (currentSkills, interviewType) => {
    try {
      const response = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: currentSkills,
          interviewType: interviewType,
          previousQuestions: [],
          previousPerformance
        }),
      });

      if (!response.ok) throw new Error('Failed to generate questions');
      const data = await response.json();
      return [data.question];
    } catch (error) {
      console.error('Error generating questions:', error);
      const questions = {
        technical: [
          "Explain the difference between let, const, and var in JavaScript.",
          "How would you optimize a React component that's re-rendering too frequently?"
        ],
        behavioral: [
          "Tell me about a time when you had to work under pressure."
        ]
      };
      // Fix fallback access
      const fallbackList = questions[interviewType] || questions.technical;
      return fallbackList;
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1;
      utterance.volume = 1.0;
      speechSynthesis.speak(utterance);
    }
  };

  const handleAnalyzeResume = async () => {
    if (!resume) {
      alert('Please upload your resume first');
      return;
    }
    setIsAnalyzing(true);
    try {
      const { skills: extractedSkills, resumeText: extractedText } = await processResume(resume);
      setSkills(extractedSkills);
      setResumeText(extractedText);
      setExtractedSkillsStage(true);
    } catch (error) {
       console.error(error);
       alert('Failed to analyze resume.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  const handleAddSkill = () => {
    if (newSkill && !skills.includes(newSkill)) {
      setSkills([...skills, newSkill]);
      setNewSkill('');
    }
  };

  const startInterview = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/start-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, skills, interviewType: type, previousPerformance })
      });
      const data = await response.json();
      let finalQuestions = data.questions;

      if (!finalQuestions || finalQuestions.length === 0) {
        finalQuestions = await generateQuestions(skills, type);
      }

      setIsInterviewStarted(true);
      setCurrentQuestion(finalQuestions[0]);
      setInterviewHistory([{ type: 'ai', content: finalQuestions[0] }]);

      // Auto-speak first question
      speakText(finalQuestions[0]);

      // Start 10-minute timer
      const endAt = Date.now() + 10 * 60 * 1000;
      setTimeLeftMs(endAt - Date.now());
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const remaining = endAt - Date.now();
        setTimeLeftMs(Math.max(0, remaining));
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          endInterview();
        }
      }, 500);
    } catch (error) {
      console.error('Error starting interview:', error);
      alert('Failed to start interview. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Removed MediaRecorder functions, using purely SpeechRecognition

  const startSpeechRecognition = () => {
    if (recognitionRef.current) recognitionRef.current.start();
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  const nextQuestion = async () => {
    try {
      let finalUser = userResponse || interimUserText;
      setInterimUserText('');
      setUserResponse('');

      // Render a temporary message immediately if local speech recognition failed
      if (!finalUser) {
        setInterviewHistory(prev => [...prev, { type: 'user', content: '(Processing audio...)' }]);
      } else {
        setInterviewHistory(prev => [...prev, { type: 'user', content: finalUser }]);
      }

      const feedbackResp = await fetch('/api/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: finalUser,
          question: currentQuestion,
          interviewType: type
        })
      }).catch(() => null);

      if (feedbackResp && feedbackResp.ok) {
        const feedbackData = await feedbackResp.json();
        
        // Update empty user response with backend transcription if available
        if (!finalUser && feedbackData.transcription) {
           finalUser = feedbackData.transcription;
           setInterviewHistory(prev => {
             const newHistory = [...prev];
             // Find the last user message and replace it
             for (let i = newHistory.length - 1; i >= 0; i--) {
               if (newHistory[i].type === 'user' && newHistory[i].content === '(Processing audio...)') {
                 newHistory[i].content = finalUser;
                 break;
               }
             }
             return newHistory;
           });
        }

        if (feedbackData?.feedback) {
          let feedbackText = '';
          if (typeof feedbackData.feedback === 'string') {
            feedbackText = feedbackData.feedback;
          } else if (typeof feedbackData.feedback === 'object') {
            const { summary, score, suggestions } = feedbackData.feedback;
            feedbackText = [
              summary ? `Feedback: ${summary}` : null,
              Number.isFinite(score) ? `Score: ${score}/100` : null,
              Array.isArray(suggestions) && suggestions.length ? `Suggestions: ${suggestions.join('; ')}` : null
            ].filter(Boolean).join('\n\n');
          }
          if (feedbackText) {
            setInterviewHistory(prev => [...prev, { type: 'ai', content: feedbackText }]);
          }
        }
      }

      const response = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: skills.length > 0 ? skills : ['JavaScript', 'React'],
          interviewType: type,
          previousQuestions: interviewHistory.filter(msg => msg.type === 'ai').map(msg => msg.content),
          userResponse: finalUser,
          previousPerformance
        })
      });

      let nextQ = 'What are your thoughts on this approach?';
      if (response.ok) {
        const data = await response.json();
        nextQ = data.question;
      }

      setCurrentQuestion(nextQ);
      setInterviewHistory(prev => [...prev, { type: 'ai', content: nextQ }]);
      setUserResponse('');
      speakText(nextQ);
    } catch (error) {
      console.error('Error generating next turn:', error);
      const nextQ = 'Could you elaborate on that?';
      setCurrentQuestion(nextQ);
      setInterviewHistory(prev => [...prev, { type: 'ai', content: nextQ }]);
      setUserResponse('');
      speakText(nextQ);
    }
  };

  const endInterview = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsInterviewEnding(true);
    setTimeout(() => {
      navigate('/performance', { state: { interviewHistory: interviewHistoryRef.current, interviewType: type } });
    }, 1500);
  };

  if (isInterviewEnding) {
    return (
      <div className="interview-room" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2 style={{ color: 'white', marginBottom: '20px' }}>Interview Ended!</h2>
        <p style={{ color: 'lightgray' }}>Generating your feedback report...</p>
        <div style={{ marginTop: '20px', width: '50px', height: '50px', border: '5px solid #f3f3f3', borderTop: '5px solid #002147', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vintage-cream flex flex-col font-sans">
      <nav className="bg-white border-b border-vintage-gray px-4 py-4 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h2 className="text-2xl font-serif font-bold text-vintage-navy cursor-pointer" onClick={() => navigate('/')}>
            JobEase
          </h2>
          <div className="flex items-center gap-6">
            <span className="text-vintage-dark/80 font-medium font-mono text-lg bg-vintage-cream px-3 py-1 rounded border border-vintage-gray shadow-inner">
              ⏱ {(() => {
                const totalSec = Math.ceil(timeLeftMs / 1000);
                const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
                const s = (totalSec % 60).toString().padStart(2, '0');
                return `${m}:${s}`;
              })()}
            </span>
            <span className={`px-4 py-1.5 rounded-sm text-sm font-bold ${isInterviewStarted ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-vintage-gray/30 text-vintage-navy border border-vintage-gray'}`}>
              {isInterviewStarted ? 'Live Session' : 'Ready'}
            </span>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col">
        {!isInterviewStarted ? (
          !extractedSkillsStage ? (
            <div className="max-w-2xl mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center">
              <div className="vintage-card bg-white p-10 rounded-sm shadow-vintage hover:shadow-vintage-hover transition-shadow text-center border-t-4 border-vintage-navy">
                <h3 className="text-3xl font-serif font-bold text-vintage-navy mb-4">Welcome to your Interview</h3>
                <p className="text-vintage-dark/70 mb-8 text-lg">Please upload your resume to begin the personalized session.</p>

                <div className="mb-8">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleResumeUpload}
                    id="resume-upload"
                    className="hidden"
                  />
                  <label htmlFor="resume-upload" className="inline-block px-6 py-4 border-2 border-dashed border-vintage-gold/50 text-vintage-navy font-medium rounded-sm cursor-pointer hover:bg-vintage-cream transition-colors w-full">
                    {resume ? `📄 Selected: ${resume.name}` : '📁 Click to Select Resume (PDF)'}
                  </label>
                </div>

                <button
                  onClick={handleAnalyzeResume}
                  disabled={!resume || isAnalyzing}
                  className={`w-full py-3 text-white font-bold rounded-sm transition-all ${!resume || isAnalyzing ? 'bg-vintage-gray cursor-not-allowed' : 'bg-vintage-navy hover:bg-vintage-dark shadow-md'}`}
                >
                  {isAnalyzing ? 'Analyzing Resume...' : 'Analyze Resume'}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center">
              <div className="vintage-card bg-white p-10 rounded-sm shadow-vintage hover:shadow-vintage-hover transition-shadow border-t-4 border-vintage-gold">
                <h3 className="text-3xl font-serif font-bold text-vintage-navy mb-3">Verify Extracted Skills</h3>
                <p className="text-vintage-dark/70 mb-8">We've extracted the following skills. These will be used to dynamically focus your questions.</p>
                
                <div className="flex flex-wrap gap-3 mb-8 bg-vintage-cream/50 p-6 rounded border border-vintage-gray border-dashed min-h-[100px]">
                  {skills.map((skill, index) => (
                    <span key={index} className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-vintage-navy/20 text-vintage-navy font-medium shadow-sm">
                      {skill}
                      <button onClick={() => handleRemoveSkill(skill)} className="text-red-500 hover:text-red-700 font-bold ml-1 transition-colors">×</button>
                    </span>
                  ))}
                  {skills.length === 0 && <span className="text-vintage-dark/50 italic mt-2">No skills extracted. Add manual skills below.</span>}
                </div>

                <div className="flex gap-4 mb-10">
                  <input 
                    type="text" 
                    value={newSkill} 
                    onChange={(e) => setNewSkill(e.target.value)} 
                    placeholder="Add extra target skill..." 
                    className="flex-1 px-4 py-3 rounded-sm border border-vintage-gray focus:outline-none focus:border-vintage-gold"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
                  />
                  <button onClick={handleAddSkill} className="px-6 py-3 bg-vintage-navy text-white font-medium rounded-sm hover:bg-vintage-dark transition-colors">Add Skill</button>
                </div>

                <button
                  onClick={startInterview}
                  disabled={isAnalyzing}
                  className="w-full py-4 bg-vintage-accent text-white font-bold rounded-sm shadow-md hover:bg-vintage-gold transition-colors text-lg"
                >
                  {isAnalyzing ? 'Preparing Session...' : 'Start Interview'}
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="max-w-[1600px] w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
            {/* LEFT PANEL: Log */}
            <div className="lg:col-span-3 vintage-card bg-white rounded-sm shadow-vintage p-5 flex flex-col border border-vintage-gray overflow-hidden max-h-[80vh]">
              <div className="text-lg font-serif font-bold text-vintage-navy mb-4 border-b border-vintage-gray pb-3 flex items-center gap-2">
                <span>📝</span> Conversation Log
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar">
                {interviewHistory.map((msg, i) => (
                  <div key={i} className={`p-4 rounded-sm shadow-sm border ${msg.type === 'ai' ? 'bg-vintage-cream border-vintage-gray/50 text-vintage-navy' : 'bg-vintage-navy border-vintage-dark text-white ml-6'}`}>
                    <div className="text-xs font-bold opacity-70 mb-1">{msg.type === 'ai' ? 'AI INTERVIEWER' : 'YOU'}</div>
                    <div className="text-sm leading-relaxed">{msg.content}</div>
                  </div>
                ))}
                {interimUserText && (
                  <div className="p-4 rounded-sm shadow-sm border bg-vintage-navy border-vintage-dark text-white ml-6 opacity-70 animate-pulse">
                    <div className="text-xs font-bold opacity-70 mb-1">YOU (Listening...)</div>
                    <div className="text-sm italic">{interimUserText}</div>
                  </div>
                )}
              </div>
            </div>

            {/* CENTER PANEL: Main Interaction */}
            <div className="lg:col-span-6 vintage-card bg-white rounded-sm shadow-vintage p-8 flex flex-col items-center justify-between border border-vintage-gold/40 relative">
              
              <div className="absolute top-4 right-4">
                 <span className="text-xs uppercase tracking-wider font-bold text-vintage-dark/40 bg-vintage-cream px-2 py-1 rounded">
                    {type} round
                 </span>
              </div>

              <div className="w-full flex-1 flex flex-col items-center justify-center my-8">
                <div className="bg-vintage-cream w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-inner borderborder-vintage-gray mb-8">
                  🤖
                </div>
                <div className="text-3xl lg:text-4xl font-serif text-center text-vintage-navy italic leading-snug px-6">
                  "{currentQuestion}"
                </div>
              </div>

              <div className="w-full max-w-lg flex flex-col items-center gap-6 mt-6">
                <button
                  onClick={async () => {
                    if (isRecording) {
                      stopSpeechRecognition();
                      setIsRecording(false);
                      nextQuestion();
                    } else {
                      setIsRecording(true);
                      startSpeechRecognition();
                    }
                  }}
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-lg border-4 ${isRecording ? 'bg-red-500 text-white border-red-200 animate-pulse hover:bg-red-600' : 'bg-vintage-navy text-white border-vintage-cream hover:bg-vintage-dark hover:scale-105'}`}
                  title={isRecording ? "Stop & Submit" : "Click to Speak"}
                >
                  {isRecording ? '⏹' : '🎤'}
                </button>
                
                <div className="w-full flex flex-col gap-3">
                  <textarea 
                    placeholder="Speech-to-text not working? Type your answer manually here..."
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    className="w-full px-4 py-3 rounded-sm border border-vintage-gray focus:outline-none focus:border-vintage-gold min-h-[80px] bg-vintage-cream/30 text-sm"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setIsRecording(false); stopSpeechRecognition(); }} 
                      className="px-4 py-2 border border-vintage-gray text-vintage-dark font-medium rounded-sm hover:bg-vintage-gray/30 transition-colors flex-1"
                    >
                      ⏸ Pause Mic
                    </button>
                    <button 
                      onClick={() => { setIsRecording(false); stopSpeechRecognition(); nextQuestion(); }} 
                      className={`px-4 py-2 text-white font-bold rounded-sm transition-colors flex-1 ${!userResponse && !interimUserText && !isRecording ? 'bg-vintage-gray cursor-not-allowed' : 'bg-vintage-accent hover:bg-vintage-gold'}`}
                      disabled={!userResponse && !interimUserText && !isRecording}
                    >
                      Submit Answer
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Tools */}
            <div className="lg:col-span-3 vintage-card bg-white rounded-sm shadow-vintage p-5 flex flex-col border border-vintage-gray max-h-[80vh]">
               <div className="text-lg font-serif font-bold text-vintage-navy mb-4 border-b border-vintage-gray pb-3 flex items-center gap-2">
                 <span>🛠</span> Tools & Notes
               </div>
               
               <div className="flex flex-col gap-3 mb-8">
                 <button className="w-full text-left px-4 py-3 text-sm border border-vintage-navy/20 text-vintage-navy font-medium rounded-sm hover:bg-vintage-navy hover:text-white transition-colors" onClick={() => speakText(currentQuestion)}>
                   🔊 Repeat Question
                 </button>
                 <button className="w-full text-left px-4 py-3 text-sm border border-vintage-navy/20 text-vintage-navy font-medium rounded-sm hover:bg-vintage-navy hover:text-white transition-colors" onClick={() => nextQuestion()}>
                   ⏭ Skip Question
                 </button>
                 <button className="w-full text-left px-4 py-3 text-sm border border-vintage-navy/20 text-vintage-navy font-medium rounded-sm hover:bg-vintage-navy hover:text-white transition-colors" onClick={() => alert("Take your time! The AI is waiting indefinitely.")}>
                   ⏳ Pause Timer
                 </button>
               </div>

               <div className="flex-1 flex flex-col mb-4">
                 <label className="text-sm font-bold text-vintage-navy mb-2">Private Scratchpad</label>
                 <textarea
                   className="flex-1 w-full p-3 rounded-sm border border-vintage-gray focus:outline-none focus:border-vintage-gold text-sm bg-vintage-cream/30 resize-none"
                   placeholder="Jot down formulas, keywords, or structures..."
                   value={notes}
                   onChange={(e) => setNotes(e.target.value)}
                 />
               </div>

               <button className="w-full mt-auto py-4 bg-red-50 text-red-600 border border-red-200 font-bold rounded-sm hover:bg-red-600 hover:text-white transition-all shadow-sm" onClick={endInterview}>
                 🔴 End Interview Now
               </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default InterviewRoom;
