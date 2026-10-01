import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Stethoscope, LogOut, User, Home, FileText, Mic } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { motion } from "framer-motion";

const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white shadow-lg border-b border-blue-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>

            {/* Show this only on large screens and up */}
            <div className="hidden lg:block">
              <h1 className="text-xl font-bold text-gray-900">
                MedAI Diagnosis
              </h1>
              <p className="text-xs text-gray-600">
                Voice-Enabled Healthcare AI
              </p>
            </div>

            {/* Show this on small and medium screens */}
            <div className="block lg:hidden">
              <h1 className="text-lg font-bold text-gray-900">MedAI</h1>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-6">
            <Link
              to="/dashboard"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                isActive("/dashboard")
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:text-blue-600 hover:bg-blue-50"
              }`}
            >
              <Home className="h-4 w-4" />
              <span>Dashboard</span>
            </Link>

            <Link
              to="/voice-diagnose"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                isActive("/voice-diagnose")
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:text-blue-600 hover:bg-blue-50"
              }`}
            >
              <Mic className="h-4 w-4" />
              <span>Voice Diagnosis</span>
            </Link>

            <Link
              to="/diagnose"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                isActive("/diagnose")
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:text-blue-600 hover:bg-blue-50"
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Traditional</span>
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-gray-700">
              <User className="h-4 w-4" />
              <span className="text-sm font-medium">
                {user?.user_metadata?.full_name || user?.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
