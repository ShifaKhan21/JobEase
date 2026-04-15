import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, addDoc, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import './PerformanceReport.css';

// generateDetailedReport removed, now using backend API
const PerformanceReport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    if (!currentUser) {
       navigate('/login');
       return;
    }

    const fetchReports = async () => {
      try {
        setLoading(true);
        let currentReports = [];
        let newRepData = null;

        // Fetch existing with timeout to prevent infinite buffer
        try {
          const q = query(collection(db, 'performanceReports'), where('userId', '==', currentUser.uid), orderBy('timestamp', 'desc'));
          const snap = await Promise.race([
            getDocs(q),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), 4000))
          ]);
          currentReports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn('Could not fetch past reports', e);
        }

        // Check if we need to generate a new report mapping from interview
        if (location.state?.interviewHistory && !location.state?.processed) {
          let reportBody = {
            communication: 75,
            techAccuracy: 70,
            contentQuality: 80,
            strengths: ["Clear communication"],
            improvements: ["Could provide better real-world examples"],
            analysis: "Simulated fallback report. Candidate displayed average proficiency."
          };
          
          try {
            const resp = await fetch('/api/generate-report', {
               method: 'POST',
               headers: {'Content-Type': 'application/json'},
               body: JSON.stringify({ 
                 interviewHistory: location.state.interviewHistory, 
                 type: location.state.interviewType || 'technical'
               })
            });
            const data = await resp.json();
            if (data && data.report) {
               reportBody = data.report;
            }
          } catch(e) {
             console.error("Failed to generate report from API", e);
          }

          const newDoc = {
            userId: currentUser.uid,
            timestamp: new Date().toISOString(),
            ...reportBody,
            interviewType: location.state.interviewType || 'technical'
          };
          // Fire and forget so we don't break UI if Firebase config is missing
          addDoc(collection(db, 'performanceReports'), newDoc).catch(e => console.warn('Firebase save error', e));
          newRepData = { id: Date.now().toString(), ...newDoc };
          
          currentReports.unshift(newRepData);

          // prevent double save on page refresh
          window.history.replaceState({ ...location.state, processed: true }, document.title);
        }

        // Enforce maximum 10 reports threshold (LRU/FIFO)
        if (currentReports.length > 10) {
          const toDelete = currentReports.slice(10);
          for (let r of toDelete) {
            await deleteDoc(doc(db, 'performanceReports', r.id));
          }
          currentReports = currentReports.slice(0, 10);
        }

        setReports(currentReports);
        if (currentReports.length > 0) {
          setSelectedReport(newRepData || currentReports[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [currentUser, location, navigate]);

  if (loading) {
    return (
      <div className="pr-loading-screen">
        <div className="pr-spinner"></div>
        <h2 className="loading-text" style={{color: 'white', marginTop: '20px'}}>Generating AI Feedback from your Interview...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vintage-cream font-sans">
      {/* Navigation */}
      <nav className="bg-white border-b border-vintage-gray px-4 py-4 mb-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h2 className="text-2xl font-serif font-bold text-vintage-navy cursor-pointer" onClick={() => navigate('/')}>
            JobEase
          </h2>
          <button className="px-6 py-2 border border-vintage-navy text-vintage-navy font-bold rounded-sm hover:bg-vintage-navy hover:text-white transition-colors" onClick={() => navigate('/')}>
             Dashboard
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 pb-12 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar List */}
        <div className="lg:col-span-1">
          <div className="vintage-card bg-white rounded-sm shadow-vintage border-t-4 border-vintage-navy overflow-hidden">
            <div className="bg-vintage-cream px-6 py-4 border-b border-vintage-gray">
               <h3 className="font-serif font-bold text-vintage-navy text-lg">Your Reports ({reports.length}/10)</h3>
            </div>
            <div className="flex flex-col divide-y divide-vintage-gray/50 max-h-[600px] overflow-y-auto custom-scrollbar">
              {reports.length === 0 ? (
                <p className="text-vintage-dark/50 p-6 italic text-center">No reports found.</p>
              ) : (
                reports.map(r => (
                  <div 
                    key={r.id} 
                    className={`p-5 cursor-pointer transition-colors hover:bg-vintage-cream/50 ${selectedReport?.id === r.id ? 'bg-vintage-cream border-l-4 border-vintage-gold' : 'border-l-4 border-transparent'}`}
                    onClick={() => setSelectedReport(r)}
                  >
                    <div className="flex justify-between items-center mb-2">
                       <h4 className="font-bold text-vintage-navy">{r.interviewType ? r.interviewType.charAt(0).toUpperCase() + r.interviewType.slice(1) : 'Technical'}</h4>
                       <span className="text-xs bg-white border border-vintage-gray px-2 py-1 rounded text-vintage-dark/70 shadow-sm">{new Date(r.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm font-medium text-vintage-dark/90">
                      Score: <span className={Math.floor((r.communication + (r.techAccuracy||r.confidence||80) + r.contentQuality)/3) > 75 ? 'text-green-600' : 'text-vintage-accent'}>{Math.floor((r.communication + (r.techAccuracy||r.confidence||80) + r.contentQuality)/3)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Details View */}
        <div className="lg:col-span-3">
          {selectedReport ? (
            <div className="vintage-card bg-white rounded-sm shadow-vintage border border-vintage-gray/50 p-8 lg:p-10">
              <div className="border-b border-vintage-gray pb-6 mb-8 text-center">
                <h2 className="text-4xl font-serif font-bold text-vintage-navy mb-2">{selectedReport.interviewType ? selectedReport.interviewType.charAt(0).toUpperCase() + selectedReport.interviewType.slice(1) : 'Interview'} Performance</h2>
                <p className="text-vintage-dark/60 font-medium tracking-wide uppercase text-sm">Detailed Analysis Report</p>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-vintage-cream/30 p-6 rounded-sm border border-vintage-gray text-center shadow-sm">
                  <div className="text-xs font-bold text-vintage-dark/70 uppercase tracking-wider mb-2">Communication</div>
                  <div className="text-4xl font-serif text-vintage-navy mb-3">{selectedReport.communication}%</div>
                  <div className="h-2 w-full bg-vintage-gray/50 rounded-full overflow-hidden">
                     <div className="h-full bg-vintage-gold transition-all duration-1000" style={{width: `${selectedReport.communication}%`}}></div>
                  </div>
                </div>
                <div className="bg-vintage-cream/30 p-6 rounded-sm border border-vintage-gray text-center shadow-sm">
                  <div className="text-xs font-bold text-vintage-dark/70 uppercase tracking-wider mb-2">Technical Accuracy</div>
                  <div className="text-4xl font-serif text-vintage-navy mb-3">{selectedReport.techAccuracy || selectedReport.confidence || 80}%</div>
                  <div className="h-2 w-full bg-vintage-gray/50 rounded-full overflow-hidden">
                     <div className="h-full bg-vintage-navy transition-all duration-1000" style={{width: `${selectedReport.techAccuracy || selectedReport.confidence || 80}%`}}></div>
                  </div>
                </div>
                <div className="bg-vintage-cream/30 p-6 rounded-sm border border-vintage-gray text-center shadow-sm">
                  <div className="text-xs font-bold text-vintage-dark/70 uppercase tracking-wider mb-2">Content Quality</div>
                  <div className="text-4xl font-serif text-vintage-navy mb-3">{selectedReport.contentQuality}%</div>
                  <div className="h-2 w-full bg-vintage-gray/50 rounded-full overflow-hidden">
                     <div className="h-full bg-vintage-accent transition-all duration-1000" style={{width: `${selectedReport.contentQuality}%`}}></div>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                <div className="bg-green-50/50 p-6 rounded-sm border border-green-100 h-full shadow-sm">
                  <h3 className="font-serif text-xl font-bold text-green-800 mb-4 flex items-center gap-2 border-b border-green-100 pb-2">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-green-600">
                       <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                       <polyline points="22 4 12 14.01 9 11.01"></polyline>
                     </svg>
                     Key Strengths
                  </h3>
                  <ul className="space-y-3 text-vintage-dark/80">
                    {(selectedReport.strengths || []).map((item, i) => (
                      <li key={i} className="flex items-start gap-2 leading-snug">
                        <span className="text-green-600 mt-0.5 font-bold">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-red-50/50 p-6 rounded-sm border border-red-100 h-full shadow-sm">
                  <h3 className="font-serif text-xl font-bold text-red-800 mb-4 flex items-center gap-2 border-b border-red-100 pb-2">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-red-600">
                       <circle cx="12" cy="12" r="10"></circle>
                       <line x1="12" y1="16" x2="12" y2="12"></line>
                       <line x1="12" y1="8" x2="12.01" y2="8"></line>
                     </svg>
                     Areas for Improvement
                  </h3>
                  <ul className="space-y-3 text-vintage-dark/80">
                    {(selectedReport.improvements || []).map((item, i) => (
                      <li key={i} className="flex items-start gap-2 leading-snug">
                        <span className="text-red-500 mt-0.5 font-bold">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Detailed Analysis */}
              <div className="bg-vintage-cream/20 p-8 rounded-sm border-l-4 border-vintage-navy shadow-inner">
                <h3 className="font-serif text-2xl font-bold text-vintage-navy mb-4">Detailed Analysis</h3>
                <p className="text-vintage-dark/80 leading-relaxed text-lg">{selectedReport.analysis}</p>
              </div>
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center h-full min-h-[400px] border-2 border-dashed border-vintage-gray rounded-sm opacity-60">
                <p className="text-vintage-dark/50 text-xl font-serif italic mb-4 mt-8">Select a report from the sidebar.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceReport;
