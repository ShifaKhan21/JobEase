import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const handleInterviewTypeSelect = (type) => {
    navigate('/interview', { state: { type } });
  };

  return (
    <div className="min-h-screen bg-vintage-cream">
      {/* Navigation */}
      <nav className="bg-white border-b border-vintage-gray px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h2 className="text-2xl font-serif font-bold text-vintage-navy cursor-pointer" onClick={() => navigate('/')}>
            JobEase
          </h2>
          <div className="flex items-center gap-6">
            <button
               onClick={() => navigate('/performance')}
               className="text-vintage-dark/80 font-medium hover:text-vintage-navy transition-colors"
            >
               Performance Analysis
            </button>
            <span className="text-vintage-dark/80 font-medium">Hello, {currentUser?.displayName || 'Candidate'}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-vintage-gray hover:border-vintage-navy text-vintage-navy rounded-sm transition-colors text-sm font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Welcome Section */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-serif text-vintage-navy mb-4">Start Your Practice Session</h1>
          <p className="text-xl text-vintage-dark/60 font-light">Select an interview style to begin your AI assessment</p>
        </div>

        {/* Interview Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="vintage-card group hover:-translate-y-1 transition-transform duration-300">
            <div className="bg-vintage-cream w-16 h-16 rounded-full flex items-center justify-center mb-6 group-hover:bg-vintage-gold/20 transition-colors">
              <span className="text-3xl">💻</span>
            </div>
            <h3 className="text-xl font-serif font-bold text-vintage-navy mb-3">Technical Interview</h3>
            <p className="text-vintage-dark/70 mb-8 min-h-[3rem]">Master algorithms, data structures, and coding challenges.</p>
            <button
              onClick={() => handleInterviewTypeSelect('technical')}
              className="w-full py-3 border border-vintage-navy text-vintage-navy font-medium hover:bg-vintage-navy hover:text-white transition-all rounded-sm"
            >
              Begin Session
            </button>
          </div>

          <div className="vintage-card group hover:-translate-y-1 transition-transform duration-300">
            <div className="bg-vintage-cream w-16 h-16 rounded-full flex items-center justify-center mb-6 group-hover:bg-vintage-gold/20 transition-colors">
              <span className="text-3xl">🤝</span>
            </div>
            <h3 className="text-xl font-serif font-bold text-vintage-navy mb-3">Behavioral Interview</h3>
            <p className="text-vintage-dark/70 mb-8 min-h-[3rem]">Perfect your STAR method responses and soft skills examples.</p>
            <button
              onClick={() => handleInterviewTypeSelect('behavioral')}
              className="w-full py-3 border border-vintage-navy text-vintage-navy font-medium hover:bg-vintage-navy hover:text-white transition-all rounded-sm"
            >
              Begin Session
            </button>
          </div>

          <div className="vintage-card group hover:-translate-y-1 transition-transform duration-300">
            <div className="bg-vintage-cream w-16 h-16 rounded-full flex items-center justify-center mb-6 group-hover:bg-vintage-gold/20 transition-colors">
              <span className="text-3xl">🎯</span>
            </div>
            <h3 className="text-xl font-serif font-bold text-vintage-navy mb-3">Mixed Interview</h3>
            <p className="text-vintage-dark/70 mb-8 min-h-[3rem]">A comprehensive blend of technical and behavioral questions.</p>
            <button
              onClick={() => handleInterviewTypeSelect('mixed')}
              className="w-full py-3 border border-vintage-navy text-vintage-navy font-medium hover:bg-vintage-navy hover:text-white transition-all rounded-sm"
            >
              Begin Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
