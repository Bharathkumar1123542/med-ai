import React from 'react';
import { Link } from 'react-router-dom';
import { Stethoscope, Mic, Camera, Shield, Zap, Users, ArrowRight, CheckCircle, Star, Play } from 'lucide-react';
import { motion } from 'framer-motion';

const LandingPage: React.FC = () => {
  const features = [
    {
      icon: <Mic className="h-8 w-8" />,
      title: "Voice-First Diagnosis",
      description: "Speak naturally to describe symptoms. Our AI understands and responds with voice feedback for a more human experience."
    },
    {
      icon: <Camera className="h-8 w-8" />,
      title: "Medical Image Analysis",
      description: "Upload X-rays, CT scans, MRIs, and more. Advanced AI analyzes images and provides preliminary assessments."
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "Instant Results",
      description: "Get AI-powered preliminary diagnoses in seconds, not hours. Perfect for remote healthcare scenarios."
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Follow-up Tracking",
      description: "Complete patient journey management with follow-up notes, status tracking, and progress monitoring."
    },
    {
      icon: <CheckCircle className="h-8 w-8" />,
      title: "Professional Reports",
      description: "Generate detailed PDF reports with confidence scores, explanations, and medical disclaimers."
    }
  ];

//   const testimonials = [
//     {
//       name: "Dr. Sarah Chen",
//       role: "Rural Health Clinic Director",
//       content: "This voice-enabled AI has revolutionized how we handle remote consultations. Patients love the natural conversation flow.",
//       rating: 5
//     },
//     {
//       name: "Marcus Rodriguez",
//       role: "Community Health Worker",
//       content: "The voice interface makes it accessible for patients who struggle with traditional apps. Game-changing technology.",
//       rating: 5
//     },
//     {
//       name: "Dr. Aisha Patel",
//       role: "Emergency Medicine Physician",
//       content: "Quick preliminary assessments help us prioritize cases. The follow-up system keeps everything organized.",
//       rating: 5
//     }
//   ];

  const stats = [
    { number: "10,000+", label: "Diagnoses Processed" },
    { number: "95%", label: "User Satisfaction" },
    { number: "24/7", label: "Availability" },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
                <Stethoscope className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">MedAI Diagnosis</h1>
                <p className="text-xs text-gray-600">Voice-Enabled Healthcare AI</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-lg transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                The Future of
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"> Voice-Enabled</span>
                <br />Healthcare AI
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Speak naturally, upload medical images, and receive AI-powered preliminary diagnoses 
                with voice responses. Making healthcare AI more accessible and human.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link
                  to="/register"
                  className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                >
                  <span className="font-semibold">Start Free Trial</span>
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <button className="flex items-center justify-center space-x-2 border border-gray-300 text-gray-700 px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors">
                  <Play className="h-5 w-5" />
                  <span>Watch Demo</span>
                </button>
              </div>

              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>No credit card required</span>
                </div>
                
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Mic className="h-6 w-6 text-blue-600" />
                    <div className="flex-1 bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-gray-700">"I have a persistent cough and uploaded my chest X-ray..."</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                      <Stethoscope className="h-3 w-3 text-white" />
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-lg p-3">
                      <p className="text-sm text-gray-700">"Based on your symptoms and X-ray, I can see some areas of concern..."</p>
                      <div className="mt-2 flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-gray-500">AI responding with voice</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Floating elements */}
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                <Camera className="h-8 w-8 text-blue-600" />
              </div>
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <Shield className="h-6 w-6 text-indigo-600" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl lg:text-4xl font-bold text-blue-600 mb-2">{stat.number}</div>
                <div className="text-gray-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Revolutionizing Healthcare with AI
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our voice-enabled platform combines cutting-edge AI with intuitive design 
              to make medical diagnosis more accessible and human-centered.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow"
              >
                <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mb-6 text-blue-600">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Trusted by Healthcare Professionals
            </h2>
            <p className="text-xl text-gray-600">
              See what doctors and healthcare workers are saying about our platform
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white p-8 rounded-xl shadow-sm border border-gray-100"
              >
                <div className="flex items-center mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic">"{testimonial.content}"</p>
                <div>
                  <div className="font-semibold text-gray-900">{testimonial.name}</div>
                  <div className="text-sm text-gray-600">{testimonial.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section> */}

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-bold text-white mb-6">
              Ready to Transform Healthcare?
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              Join thousands of healthcare professionals using voice-enabled AI for better patient care.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center space-x-2 bg-white text-blue-600 px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors font-semibold shadow-lg"
            >
              <span>Start Your Free Trial</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
                  <Stethoscope className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">MedAI Diagnosis</h3>
                  <p className="text-xs text-gray-400">Voice-Enabled Healthcare AI</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Making healthcare AI more accessible through voice-enabled technology.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">HIPAA Compliance</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
            <p>&copy; 2024 MedAI Diagnosis. All rights reserved. Built for healthcare innovation.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;