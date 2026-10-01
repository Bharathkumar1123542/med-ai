import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './components/Landing/LandingPage';
import LoginForm from './components/Auth/LoginForm';
import RegisterForm from './components/Auth/RegisterForm';
import Dashboard from './components/Dashboard/Dashboard';
import DiagnosisForm from './components/Diagnosis/DiagnosisForm';
import VoiceDiagnosisForm from './components/Diagnosis/VoiceDiagnosisForm';
import DiagnosisDetail from './components/Diagnosis/DiagnosisDetail';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginForm />} />
            <Route path="/register" element={<RegisterForm />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/diagnose"
              element={
                <ProtectedRoute>
                  <DiagnosisForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/voice-diagnose"
              element={
                <ProtectedRoute>
                  <VoiceDiagnosisForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/diagnosis/:id"
              element={
                <ProtectedRoute>
                  <DiagnosisDetail />
                </ProtectedRoute>
              }
            />
          </Routes>
          
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;