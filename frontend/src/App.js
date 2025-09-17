import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import AgoraUIKit from 'agora-react-uikit';
import './App.css';

// Context for authentication
const AuthContext = createContext();

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth Provider Component
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const API = `${BACKEND_URL}/api`;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Login failed' 
      };
    }
  };

  const register = async (userData) => {
    try {
      await axios.post(`${API}/auth/register`, userData);
      return { success: true, needsVerification: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Registration failed' 
      };
    }
  };

  const verifyEmail = async (email, code) => {
    try {
      await axios.post(`${API}/auth/verify-email`, { email, verification_code: code });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Verification failed' 
      };
    }
  };

  const resendVerification = async (email) => {
    try {
      await axios.post(`${API}/auth/resend-verification`, { email });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Failed to resend verification' 
      };
    }
  };

  const changePassword = async (currentPassword, newPassword, confirmPassword) => {
    try {
      await axios.post(`${API}/auth/change-password`, {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Password change failed' 
      };
    }
  };

  const updateProfile = async (profileData) => {
    try {
      await axios.put(`${API}/super-admin/profile`, profileData);
      await fetchCurrentUser(); // Refresh user data
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Profile update failed' 
      };
    }
  };

  const cleanVirginState = async () => {
    try {
      await axios.post(`${API}/system/clean-virgin-state`);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Failed to clean system' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      register, 
      verifyEmail,
      resendVerification,
      changePassword,
      updateProfile,
      cleanVirginState,
      logout, 
      loading, 
      API 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Login/Register Component
const AuthPage = () => {
  const [activeTab, setActiveTab] = useState('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    confirmPassword: ''
  });
  const [verificationData, setVerificationData] = useState({
    email: '',
    code: '',
    show: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { user, login, register, verifyEmail, resendVerification } = useAuth();

  // Redirect if already authenticated
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (activeTab === 'login') {
        const result = await login(formData.email, formData.password);
        if (!result.success) {
          setError(result.error);
        }
      } else {
        // Registration
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        const result = await register({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          phone: formData.phone
        });

        if (result.success) {
          setVerificationData({
            email: formData.email,
            code: '',
            show: true
          });
          setSuccess('Registration successful! Please check your email for verification code.');
          setFormData({ email: '', password: '', full_name: '', phone: '', confirmPassword: '' });
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await verifyEmail(verificationData.email, verificationData.code);
    
    if (result.success) {
      setSuccess('Email verified successfully! You can now log in.');
      setVerificationData({ email: '', code: '', show: false });
      setActiveTab('login');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const handleResendVerification = async () => {
    setLoading(true);
    const result = await resendVerification(verificationData.email);
    
    if (result.success) {
      setSuccess('Verification code resent. Please check your email.');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleVerificationChange = (e) => {
    setVerificationData({ ...verificationData, [e.target.name]: e.target.value });
  };

  if (verificationData.show) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Email</h1>
            <p className="text-gray-600">Enter the 6-digit code sent to {verificationData.email}</p>
          </div>

          <form onSubmit={handleVerification} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                type="text"
                name="code"
                value={verificationData.code}
                onChange={handleVerificationChange}
                maxLength={6}
                placeholder="Enter 6-digit code"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-center text-lg font-mono"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-2 px-4 rounded-lg font-medium hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={loading}
                className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
              >
                Resend verification code
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setVerificationData({ email: '', code: '', show: false })}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Back to registration
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Glory of Elshaddai</h1>
          <p className="text-gray-600">Christian Center Connect</p>
        </div>

        <div className="mb-6">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                activeTab === 'login' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                activeTab === 'register' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            {activeTab === 'register' && (
              <p className="text-xs text-gray-500 mt-1">
                Must be 8+ characters with uppercase, lowercase, and numbers
              </p>
            )}
          </div>

          {activeTab === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-2 px-4 rounded-lg font-medium hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Please wait...' : activeTab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {activeTab === 'register' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setVerificationData({ email: formData.email, code: '', show: true })}
              className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
            >
              Already have a verification code?
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Super Admin Portal Component
const SuperAdminPortal = () => {
  const { user, logout, changePassword, updateProfile, cleanVirginState, API } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [isUserView, setIsUserView] = useState(false); // New state for portal switching
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [systemStats, setSystemStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Form states
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    emergency_contact: user?.emergency_contact || '',
    time_zone: user?.time_zone || 'UTC',
    language: user?.language || 'en'
  });

  useEffect(() => {
    fetchSystemStats();
    if (activeTab === 'groups') fetchGroups();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'meetings') fetchMeetings();
    if (activeTab === 'activities') fetchActivities();
  }, [activeTab]);

  const fetchSystemStats = async () => {
    try {
      const response = await axios.get(`${API}/system/stats`);
      setSystemStats(response.data);
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API}/groups`);
      setGroups(response.data);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchMeetings = async () => {
    try {
      const response = await axios.get(`${API}/meetings`);
      setMeetings(response.data);
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await axios.get(`${API}/activities`);
      setActivities(response.data);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const result = await changePassword(
      passwordForm.currentPassword,
      passwordForm.newPassword,
      passwordForm.confirmPassword
    );

    if (result.success) {
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const result = await updateProfile(profileForm);

    if (result.success) {
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const handleCleanVirginState = async () => {
    if (window.confirm('This will remove all data except your super admin account. This action cannot be undone. Continue?')) {
      setLoading(true);
      const result = await cleanVirginState();
      
      if (result.success) {
        setMessage({ type: 'success', text: 'System cleaned to virgin state successfully!' });
        fetchSystemStats();
        fetchGroups();
        fetchUsers();
        fetchMeetings();
        fetchActivities();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
      setLoading(false);
    }
  };

  const navigation = [
    { id: 'overview', name: 'System Overview', icon: '🏠', color: 'bg-blue-500' },
    { id: 'groups', name: 'Group Management', icon: '🫂', color: 'bg-purple-500' },
    { id: 'users', name: 'User Management', icon: '👥', color: 'bg-green-500' },
    { id: 'meetings', name: 'Meeting Management', icon: '📅', color: 'bg-indigo-500' },
    { id: 'video-conference', name: 'Video Conference', icon: '📹', color: 'bg-red-500' },
    { id: 'time-tracking', name: 'Time Tracking', icon: '⏰', color: 'bg-yellow-500' },
    { id: 'activities', name: 'System Activities', icon: '📝', color: 'bg-orange-500' },
    { id: 'profile', name: 'My Profile', icon: '👤', color: 'bg-pink-500' },
    { id: 'system', name: 'System Tools', icon: '⚙️', color: 'bg-red-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Enhanced Sidebar - Hidden in User View */}
      {!isUserView && (
        <div className="w-72 bg-white shadow-xl flex flex-col border-r border-gray-200">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-2xl">👑</span>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{user?.full_name}</h3>
                <p className="text-purple-200 text-sm font-medium">Super Administrator</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                  activeTab === item.id
                    ? `${item.color} text-white shadow-lg transform scale-105`
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={logout}
              className="w-full flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors duration-200"
            >
              <span className="text-xl">🚪</span>
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {isUserView ? 'Member Dashboard' : (navigation.find(item => item.id === activeTab)?.name || 'Super Admin Portal')}
              </h1>
              <p className="text-gray-600 mt-1">
                {isUserView ? 'Regular member experience' : 'Complete system control and management'}
              </p>
              {isUserView && (
                <div className="mt-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium inline-block">
                  👁️ Viewing as Regular Member
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {/* Portal Switch Button */}
              <button
                onClick={() => setIsUserView(!isUserView)}
                className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                  isUserView 
                    ? 'bg-purple-500 text-white hover:bg-purple-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {isUserView ? '🔧 Switch to Admin View' : '👤 Switch to User View'}
              </button>
              
              {/* Sign Out Button - Only show in User View */}
              {isUserView && (
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium"
                >
                  🚪 Sign Out
                </button>
              )}
              
              <div className="flex items-center space-x-2 bg-gradient-to-r from-purple-100 to-purple-200 px-4 py-2 rounded-full">
                <span className="text-2xl">💰</span>
                <span className="font-bold text-purple-700">{user?.coins?.toLocaleString() || 0} YHWH Coins</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-8">
          {message.text && (
            <div className={`mb-6 px-4 py-3 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-600' 
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {message.text}
            </div>
          )}

          {isUserView ? (
            // User View - Show what regular members see
            <RegularMemberView user={user} />
          ) : (
            // Admin View - Show full admin dashboard
            <>
              {activeTab === 'overview' && (
                <SystemOverviewContent systemStats={systemStats} onCleanSystem={handleCleanVirginState} />
              )}

              {activeTab === 'groups' && (
                <GroupManagementContent 
                  groups={groups} 
                  users={users}
                  API={API}
                  onUpdate={fetchGroups}
                  setMessage={setMessage}
                />
              )}

              {activeTab === 'users' && (
                <UserManagementContent users={users} API={API} onUpdate={fetchUsers} setMessage={setMessage} />
              )}

              {activeTab === 'meetings' && (
                <MeetingManagementContent 
                  meetings={meetings} 
                  groups={groups} 
                  users={users}
                  API={API}
                  onUpdate={fetchMeetings}
                  setMessage={setMessage}
                />
              )}

              {activeTab === 'video-conference' && (
                <VideoConferenceContent 
                  API={API}
                  groups={groups}
                  users={users}
                  setMessage={setMessage}
                />
              )}

              {activeTab === 'time-tracking' && (
                <TimeTrackingContent 
                  API={API}
                  groups={groups}
                  users={users}
                  setMessage={setMessage}
                />
              )}

              {activeTab === 'activities' && (
                <SystemActivitiesContent activities={activities} users={users} />
              )}

              {activeTab === 'profile' && (
                <ProfileManagementContent 
                  user={user}
                  profileForm={profileForm}
                  setProfileForm={setProfileForm}
                  passwordForm={passwordForm}
                  setPasswordForm={setPasswordForm}
                  onProfileUpdate={handleProfileUpdate}
                  onPasswordChange={handlePasswordChange}
                  loading={loading}
                />
              )}

              {activeTab === 'system' && (
                <SystemToolsContent 
                  onCleanSystem={handleCleanVirginState}
                  systemStats={systemStats}
                  loading={loading}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

// Content Components
const SystemOverviewContent = ({ systemStats, onCleanSystem }) => {
  if (!systemStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-blue-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900">{systemStats.users.total}</p>
              <p className="text-xs text-green-600">
                {systemStats.users.active} active • {systemStats.users.total - systemStats.users.active} inactive
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-purple-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Groups</p>
              <p className="text-3xl font-bold text-gray-900">{systemStats.groups.total}</p>
              <p className="text-xs text-purple-600">Active groups</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🫂</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-green-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Meetings</p>
              <p className="text-3xl font-bold text-gray-900">{systemStats.meetings.total}</p>
              <p className="text-xs text-green-600">
                {systemStats.meetings.upcoming} upcoming • {systemStats.meetings.completed} completed
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-orange-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Recent Activity</p>
              <p className="text-3xl font-bold text-gray-900">{systemStats.activities.recent}</p>
              <p className="text-xs text-orange-600">Last 7 days</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
        </div>
      </div>

      {/* User Role Distribution */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">User Role Distribution</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-red-50 rounded-xl">
            <div className="text-2xl mb-2">👑</div>
            <p className="text-2xl font-bold text-red-600">{systemStats.users.super_admins}</p>
            <p className="text-sm text-gray-600">Super Admins</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-xl">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-2xl font-bold text-purple-600">{systemStats.users.group_admins}</p>
            <p className="text-sm text-gray-600">Group Admins</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="text-2xl mb-2">🎯</div>
            <p className="text-2xl font-bold text-blue-600">{systemStats.users.team_leaders}</p>
            <p className="text-sm text-gray-600">Team Leaders</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <div className="text-2xl mb-2">👤</div>
            <p className="text-2xl font-bold text-green-600">{systemStats.users.members}</p>
            <p className="text-sm text-gray-600">Members</p>
          </div>
        </div>
      </div>

      {/* System Actions */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">System Management</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={onCleanSystem}
            className="p-4 bg-red-50 hover:bg-red-100 rounded-xl border-2 border-red-200 hover:border-red-300 transition-all text-left"
          >
            <div className="text-2xl mb-2">🧹</div>
            <h4 className="font-bold text-red-700 mb-1">Clean to Virgin State</h4>
            <p className="text-sm text-red-600">Remove all data except super admin</p>
          </button>
          
          <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-200 text-left">
            <div className="text-2xl mb-2">💾</div>
            <h4 className="font-bold text-blue-700 mb-1">System Backup</h4>
            <p className="text-sm text-blue-600">Create full system backup</p>
          </div>
          
          <div className="p-4 bg-green-50 rounded-xl border-2 border-green-200 text-left">
            <div className="text-2xl mb-2">🔧</div>
            <h4 className="font-bold text-green-700 mb-1">System Health</h4>
            <p className="text-sm text-green-600">All systems operational</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const GroupManagementContent = ({ groups, users, API, onUpdate, setMessage }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showGroupDetail, setShowGroupDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ show: false, group: null, confirmText: '' });
  
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    group_type: 'Ministry',
    privacy_setting: 'public',
    max_members: '',
    color_theme: '#6366f1',
    meeting_location: '',
    tags: []
  });

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Validate form data
      if (!newGroup.name.trim()) {
        throw new Error('Group name is required');
      }
      
      if (!newGroup.description.trim()) {
        throw new Error('Group description is required');
      }
      
      const groupData = {
        ...newGroup,
        name: newGroup.name.trim(),
        description: newGroup.description.trim(),
        max_members: newGroup.max_members ? parseInt(newGroup.max_members) : null,
        tags: newGroup.tags.filter(tag => tag.trim())
      };
      
      const response = await axios.post(`${API}/groups`, groupData);
      setMessage({ type: 'success', text: `Group "${groupData.name}" created successfully!` });
      setNewGroup({
        name: '',
        description: '',
        group_type: 'Ministry',
        privacy_setting: 'public',
        max_members: '',
        color_theme: '#6366f1',
        meeting_location: '',
        tags: []
      });
      setShowCreateForm(false);
      onUpdate();
    } catch (error) {
      console.error('Group creation error:', error);
      setMessage({ 
        type: 'error', 
        text: error.message || error.response?.data?.detail || 'Failed to create group' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = (group) => {
    setDeleteConfirmation({ show: true, group, confirmText: '' });
  };

  const confirmDeleteGroup = async () => {
    const { group } = deleteConfirmation;
    
    if (deleteConfirmation.confirmText !== 'DELETE') {
      setMessage({ type: 'error', text: 'Please type DELETE to confirm deletion' });
      return;
    }
    
    try {
      setLoading(true);
      await axios.delete(`${API}/groups/${group.id}`);
      setMessage({ 
        type: 'success', 
        text: `Group "${group.name}" has been deleted successfully!` 
      });
      setDeleteConfirmation({ show: false, group: null, confirmText: '' });
      onUpdate();
    } catch (error) {
      console.error('Group deletion error:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to delete group' 
      });
    } finally {
      setLoading(false);
    }
  };

  const openGroupDetail = async (group) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/groups/${group.id}`);
      setSelectedGroup(response.data);
      setShowGroupDetail(true);
    } catch (error) {
      console.error('Failed to load group details:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to load group details. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const startGroupVideoMeeting = async (group) => {
    try {
      setLoading(true);
      
      // Create church video room for the group
      const roomData = {
        room_name: `${group.name} Group Meeting`,
        service_type: 'group_meeting',
        max_participants: Math.min(group.max_members || 200, 1000),
        enable_recording: true,
        enable_streaming: false,
        group_id: group.id
      };
      
      const response = await axios.post(`${API}/church-video/create`, roomData);
      
      // Generate Agora token for the user
      const tokenResponse = await axios.post(`${API}/agora/token`, {
        channel_name: response.data.channel_name,
        uid: Math.floor(Math.random() * 10000) + 1000,
        role: 'host',
        expire_time: 7200
      });
      
      setMessage({ 
        type: 'success', 
        text: `Video meeting started for ${group.name}! Room: ${response.data.channel_name}` 
      });
      
      // You could redirect to video meeting or show in modal
      // For now, we'll just show success message
      
    } catch (error) {
      console.error('Video meeting creation failed:', error);
      
      // Handle specific Agora error codes
      if (error.response?.status === 601) {
        setMessage({ 
          type: 'error', 
          text: 'Video service configuration error. Please contact administrator.' 
        });
      } else if (error.response?.status === 602 || error.response?.status === 604) {
        setMessage({ 
          type: 'error', 
          text: 'Authentication failed. Please refresh the page and try again.' 
        });
      } else if (error.response?.status === 606) {
        setMessage({ 
          type: 'error', 
          text: 'Video conferencing feature not available. Please contact administrator.' 
        });
      } else if (error.response?.status === 611) {
        setMessage({ 
          type: 'error', 
          text: 'Invalid meeting request. Please check group settings and try again.' 
        });
      } else {
        setMessage({ 
          type: 'error', 
          text: error.response?.data?.detail || 'Failed to start video meeting. Please try again.' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Group Management</h2>
          <p className="text-gray-600">Create and manage all church groups and communities</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-purple-500 text-white px-6 py-3 rounded-xl hover:bg-purple-600 transition-colors shadow-lg"
        >
          <span className="flex items-center space-x-2">
            <span>➕</span>
            <span>Create New Group</span>
          </span>
        </button>
      </div>

      {/* Enhanced Create Group Form */}
      {showCreateForm && (
        <div className="bg-white rounded-2xl shadow-lg p-6 border">
          <h3 className="text-xl font-bold mb-6">Create New Group</h3>
          <form onSubmit={handleCreateGroup} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name *</label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter group name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Type</label>
                <select
                  value={newGroup.group_type}
                  onChange={(e) => setNewGroup({ ...newGroup, group_type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="Ministry">Ministry</option>
                  <option value="Age Group">Age Group</option>
                  <option value="Service Team">Service Team</option>
                  <option value="Leadership Circle">Leadership Circle</option>
                  <option value="Interest Group">Interest Group</option>
                  <option value="Bible Study">Bible Study</option>
                  <option value="Worship Team">Worship Team</option>
                  <option value="Outreach Team">Outreach Team</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
              <textarea
                value={newGroup.description}
                onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                rows={4}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Describe the purpose and goals of this group"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Privacy Setting</label>
                <select
                  value={newGroup.privacy_setting}
                  onChange={(e) => setNewGroup({ ...newGroup, privacy_setting: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="public">Public - Anyone can join</option>
                  <option value="private">Private - Invite only</option>
                  <option value="invite_only">Invite Only - Admin approval required</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Members (Optional)</label>
                <input
                  type="number"
                  value={newGroup.max_members}
                  onChange={(e) => setNewGroup({ ...newGroup, max_members: e.target.value })}
                  min="1"
                  max="1000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color Theme</label>
                <input
                  type="color"
                  value={newGroup.color_theme}
                  onChange={(e) => setNewGroup({ ...newGroup, color_theme: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Meeting Location</label>
              <input
                type="text"
                value={newGroup.meeting_location}
                onChange={(e) => setNewGroup({ ...newGroup, meeting_location: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Physical location or virtual meeting room"
              />
            </div>
            
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-purple-500 text-white px-6 py-3 rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-colors shadow-lg"
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-300 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enhanced Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-2xl shadow-lg">
            <div className="text-6xl mb-4">🫂</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Groups Created</h3>
            <p className="text-gray-600 mb-6">Get started by creating your first group to build community</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-purple-500 text-white px-6 py-3 rounded-xl hover:bg-purple-600 transition-colors"
            >
              Create First Group
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-200 border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg"
                    style={{ backgroundColor: group.color_theme }}
                  >
                    {group.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{group.name}</h3>
                    <p className="text-sm text-gray-500">{group.group_type}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  group.privacy_setting === 'public' ? 'bg-green-100 text-green-800' :
                  group.privacy_setting === 'private' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {group.privacy_setting}
                </span>
              </div>
              
              {group.description && (
                <p className="text-gray-600 mb-4 text-sm line-clamp-2">{group.description}</p>
              )}
              
              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Members:</span>
                  <span className="font-medium text-gray-900">
                    {group.member_count || 0}
                    {group.max_members && ` / ${group.max_members}`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Leaders:</span>
                  <span className="font-medium text-gray-900">{group.leaders?.length || 0}</span>
                </div>
                {group.meeting_location && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Location:</span>
                    <span className="font-medium text-gray-900 text-xs truncate">{group.meeting_location}</span>
                  </div>
                )}
              </div>
              
              {/* Enhanced Action Buttons */}
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <button
                    onClick={() => openGroupDetail(group)}
                    disabled={loading}
                    className="flex-1 bg-purple-50 text-purple-600 px-3 py-2 rounded-lg text-sm hover:bg-purple-100 transition-colors font-medium disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'View Details'}
                  </button>
                  <button
                    onClick={() => startGroupVideoMeeting(group)}
                    disabled={loading}
                    className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm hover:bg-red-100 transition-colors font-medium disabled:opacity-50"
                  >
                    📹 Meet
                  </button>
                </div>
                <button
                  onClick={() => handleDeleteGroup(group)}
                  className="w-full bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm hover:bg-red-100 transition-colors font-medium"
                >
                  Delete Group
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Enhanced Delete Confirmation Modal */}
      {deleteConfirmation.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Group</h3>
              <p className="text-gray-600">
                Are you sure you want to delete "<strong>{deleteConfirmation.group?.name}</strong>"?
              </p>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-red-800 mb-2">This action will:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• Remove all group members</li>
                <li>• Delete group history and data</li>
                <li>• Cancel scheduled meetings</li>
                <li>• Cannot be undone</li>
              </ul>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmation.confirmText}
                onChange={(e) => setDeleteConfirmation({ 
                  ...deleteConfirmation, 
                  confirmText: e.target.value 
                })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Type DELETE"
              />
            </div>
            
            <div className="flex space-x-4">
              <button
                onClick={() => setDeleteConfirmation({ show: false, group: null, confirmText: '' })}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteGroup}
                disabled={loading || deleteConfirmation.confirmText !== 'DELETE'}
                className="flex-1 bg-red-500 text-white px-4 py-3 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Deleting...' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Group Detail Modal */}
      {showGroupDetail && selectedGroup && (
        <EnhancedGroupDetailModal 
          group={selectedGroup}
          users={users}
          API={API}
          onClose={() => setShowGroupDetail(false)}
          onUpdate={onUpdate}
          setMessage={setMessage}
        />
      )}
    </div>
  );
};

// Enhanced Group Detail Modal Component
const EnhancedGroupDetailModal = ({ group, users, API, onClose, onUpdate, setMessage }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const [editForm, setEditForm] = useState({
    name: group.name,
    description: group.description || '',
    group_type: group.group_type,
    privacy_setting: group.privacy_setting,
    max_members: group.max_members || '',
    color_theme: group.color_theme,
    meeting_location: group.meeting_location || ''
  });

  useEffect(() => {
    fetchGroupMembers();
    fetchAvailableUsers();
  }, []);

  const fetchGroupMembers = async () => {
    try {
      const response = await axios.get(`${API}/groups/${group.id}/members`);
      setGroupMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch group members:', error);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      // Get users not in this group
      const response = await axios.get(`${API}/users`);
      const allUsers = response.data;
      const currentMemberIds = groupMembers.map(member => member.id);
      setAvailableUsers(allUsers.filter(user => !currentMemberIds.includes(user.id)));
    } catch (error) {
      console.error('Failed to fetch available users:', error);
    }
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const updateData = {
        ...editForm,
        max_members: editForm.max_members ? parseInt(editForm.max_members) : null
      };
      
      await axios.put(`${API}/groups/${group.id}`, updateData);
      setMessage({ type: 'success', text: 'Group updated successfully!' });
      setEditMode(false);
      onUpdate();
      onClose();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to update group' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) {
      setMessage({ type: 'error', text: 'Please select users to add' });
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/groups/${group.id}/members`, {
        user_ids: selectedUsers
      });
      setMessage({ 
        type: 'success', 
        text: `Added ${selectedUsers.length} member(s) to ${group.name}` 
      });
      setSelectedUsers([]);
      fetchGroupMembers();
      fetchAvailableUsers();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to add members' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (window.confirm(`Remove ${memberName} from ${group.name}?`)) {
      try {
        await axios.delete(`${API}/groups/${group.id}/members/${memberId}`);
        setMessage({ type: 'success', text: `${memberName} removed from group` });
        fetchGroupMembers();
        fetchAvailableUsers();
      } catch (error) {
        setMessage({ 
          type: 'error', 
          text: error.response?.data?.detail || 'Failed to remove member' 
        });
      }
    }
  };

  const startGroupVideoMeeting = async () => {
    try {
      setLoading(true);
      
      const roomData = {
        room_name: `${group.name} Group Meeting`,
        service_type: 'group_meeting',
        max_participants: Math.min(group.max_members || 200, 1000),
        enable_recording: true,
        enable_streaming: false,
        group_id: group.id
      };
      
      const response = await axios.post(`${API}/church-video/create`, roomData);
      
      const tokenResponse = await axios.post(`${API}/agora/token`, {
        channel_name: response.data.channel_name,
        uid: Math.floor(Math.random() * 10000) + 1000,
        role: 'host',
        expire_time: 7200
      });
      
      setMessage({ 
        type: 'success', 
        text: `Video meeting started for ${group.name}! Channel: ${response.data.channel_name}` 
      });
      
    } catch (error) {
      console.error('Video meeting creation failed:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to start video meeting' 
      });
    } finally {
      setLoading(false);
    }
  };

  const scheduleGroupMeeting = async () => {
    // This would open a meeting scheduling interface
    setMessage({ 
      type: 'info', 
      text: 'Meeting scheduling interface will be implemented in the next update' 
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Enhanced Modal Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ backgroundColor: `${group.color_theme}15` }}>
          <div className="flex items-center space-x-4">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg"
              style={{ backgroundColor: group.color_theme }}
            >
              {group.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{group.name}</h2>
              <p className="text-gray-600">{group.group_type} • {groupMembers.length} members</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={startGroupVideoMeeting}
              disabled={loading}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              📹 Start Meeting
            </button>
            <button
              onClick={scheduleGroupMeeting}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              📅 Schedule
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
            >
              {editMode ? 'Cancel Edit' : 'Edit Group'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'members', name: 'Members', icon: '👥' },
              { id: 'meetings', name: 'Meetings', icon: '📅' },
              { id: 'activities', name: 'Activities', icon: '📝' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {editMode ? (
            <form onSubmit={handleUpdateGroup} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Group Type</label>
                  <select
                    value={editForm.group_type}
                    onChange={(e) => setEditForm({ ...editForm, group_type: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="Ministry">Ministry</option>
                    <option value="Age Group">Age Group</option>
                    <option value="Service Team">Service Team</option>
                    <option value="Leadership Circle">Leadership Circle</option>
                    <option value="Interest Group">Interest Group</option>
                    <option value="Bible Study">Bible Study</option>
                    <option value="Worship Team">Worship Team</option>
                    <option value="Outreach Team">Outreach Team</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Privacy Setting</label>
                  <select
                    value={editForm.privacy_setting}
                    onChange={(e) => setEditForm({ ...editForm, privacy_setting: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                    <option value="invite_only">Invite Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Members</label>
                  <input
                    type="number"
                    value={editForm.max_members}
                    onChange={(e) => setEditForm({ ...editForm, max_members: e.target.value })}
                    min="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color Theme</label>
                  <input
                    type="color"
                    value={editForm.color_theme}
                    onChange={(e) => setEditForm({ ...editForm, color_theme: e.target.value })}
                    className="w-full h-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Meeting Location</label>
                <input
                  type="text"
                  value={editForm.meeting_location}
                  onChange={(e) => setEditForm({ ...editForm, meeting_location: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="bg-gray-300 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-purple-500 text-white px-6 py-3 rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Updating...' : 'Update Group'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700">Description</h4>
                        <p className="text-gray-900">{group.description || 'No description provided'}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-700">Privacy Setting</h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          group.privacy_setting === 'public' ? 'bg-green-100 text-green-800' :
                          group.privacy_setting === 'private' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {group.privacy_setting.charAt(0).toUpperCase() + group.privacy_setting.slice(1)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700">Member Limits</h4>
                        <p className="text-gray-900">
                          {groupMembers.length} / {group.max_members || 'Unlimited'} members
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-700">Meeting Location</h4>
                        <p className="text-gray-900">{group.meeting_location || 'Not specified'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Group Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-center">
                      <div className="text-2xl font-bold text-blue-600">{groupMembers.length}</div>
                      <div className="text-sm text-blue-600">Total Members</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-xl text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {groupMembers.filter(m => m.role === 'leader').length}
                      </div>
                      <div className="text-sm text-purple-600">Leaders</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-xl text-center">
                      <div className="text-2xl font-bold text-green-600">0</div>
                      <div className="text-sm text-green-600">Active Meetings</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-xl text-center">
                      <div className="text-2xl font-bold text-orange-600">0</div>
                      <div className="text-sm text-orange-600">Upcoming Events</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Members Tab */}
              {activeTab === 'members' && (
                <div className="space-y-6">
                  {/* Add Members Section */}
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <h4 className="font-medium text-gray-700 mb-4">Add New Members</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <select
                          multiple
                          value={selectedUsers}
                          onChange={(e) => setSelectedUsers(Array.from(e.target.selectedOptions, option => option.value))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          size="4"
                        >
                          {availableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.full_name} ({user.email})
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple users</p>
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={handleAddMembers}
                          disabled={loading || selectedUsers.length === 0}
                          className="w-full bg-purple-500 text-white px-4 py-3 rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-colors"
                        >
                          {loading ? 'Adding...' : `Add ${selectedUsers.length} Member(s)`}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Current Members List */}
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4">Current Members ({groupMembers.length})</h4>
                    <div className="space-y-2">
                      {groupMembers.map((member) => (
                        <div key={member.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                              {member.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{member.full_name}</p>
                              <p className="text-sm text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              member.role === 'leader' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {member.role || 'Member'}
                            </span>
                            <button
                              onClick={() => handleRemoveMember(member.id, member.full_name)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Meetings Tab */}
              {activeTab === 'meetings' && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📅</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Group Meetings</h3>
                  <p className="text-gray-600 mb-6">Meeting management will be available soon</p>
                  <button
                    onClick={startGroupVideoMeeting}
                    disabled={loading}
                    className="bg-red-500 text-white px-6 py-3 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Starting...' : '📹 Start Video Meeting Now'}
                  </button>
                </div>
              )}

              {/* Activities Tab */}
              {activeTab === 'activities' && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Group Activities</h3>
                  <p className="text-gray-600">Activity tracking will be available soon</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Placeholder components for other sections
const UserManagementContent = ({ users }) => (
  <div className="text-center py-12">
    <div className="text-6xl mb-4">👥</div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">User Management</h3>
    <p className="text-gray-600">Manage {users.length} users in the system</p>
  </div>
);

const MeetingManagementContent = ({ meetings }) => (
  <div className="text-center py-12">
    <div className="text-6xl mb-4">📅</div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">Meeting Management</h3>
    <p className="text-gray-600">{meetings.length} meetings scheduled</p>
  </div>
);

const SystemActivitiesContent = ({ activities }) => (
  <div className="text-center py-12">
    <div className="text-6xl mb-4">📝</div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">System Activities</h3>
    <p className="text-gray-600">{activities.length} recent activities</p>
  </div>
);

const ProfileManagementContent = ({ 
  user, 
  profileForm, 
  setProfileForm, 
  passwordForm, 
  setPasswordForm, 
  onProfileUpdate, 
  onPasswordChange, 
  loading 
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    {/* Profile Information */}
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-bold mb-6">Profile Information</h3>
      <form onSubmit={onProfileUpdate} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
          <input
            type="text"
            value={profileForm.full_name}
            onChange={(e) => setProfileForm({...profileForm, full_name: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
          <input
            type="tel"
            value={profileForm.phone}
            onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
          <textarea
            value={profileForm.bio}
            onChange={(e) => setProfileForm({...profileForm, bio: e.target.value})}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact</label>
          <input
            type="text"
            value={profileForm.emergency_contact}
            onChange={(e) => setProfileForm({...profileForm, emergency_contact: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-500 text-white py-3 rounded-xl hover:bg-purple-600 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Updating...' : 'Update Profile'}
        </button>
      </form>
    </div>

    {/* Password Change */}
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-bold mb-6">Change Password</h3>
      <form onSubmit={onPasswordChange} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
          <input
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
          <input
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
          <input
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-red-500 text-white py-3 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  </div>
);

const SystemToolsContent = ({ onCleanSystem, systemStats, loading }) => (
  <div className="space-y-6">
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-bold mb-6">System Maintenance Tools</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={onCleanSystem}
          disabled={loading}
          className="p-6 bg-red-50 hover:bg-red-100 rounded-xl border-2 border-red-200 hover:border-red-300 transition-all text-left disabled:opacity-50"
        >
          <div className="text-3xl mb-3">🧹</div>
          <h4 className="font-bold text-red-700 mb-2">Clean to Virgin State</h4>
          <p className="text-sm text-red-600">Remove all data except super admin account. Creates a fresh, empty system ready for production use.</p>
        </button>
        
        <div className="p-6 bg-blue-50 rounded-xl border-2 border-blue-200 text-left">
          <div className="text-3xl mb-3">💾</div>
          <h4 className="font-bold text-blue-700 mb-2">System Backup</h4>
          <p className="text-sm text-blue-600">Create comprehensive backup of all system data and configurations.</p>
        </div>
      </div>
    </div>
    
    {systemStats && (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-bold mb-6">Current System Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{systemStats.users.total}</div>
            <div className="text-sm text-gray-600">Total Users</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{systemStats.groups.total}</div>
            <div className="text-sm text-gray-600">Active Groups</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{systemStats.meetings.total}</div>
            <div className="text-sm text-gray-600">Total Meetings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{systemStats.activities.recent}</div>
            <div className="text-sm text-gray-600">Recent Activities</div>
          </div>
        </div>
      </div>
    )}
  </div>
);

// Regular User Dashboard (simplified)
const RegularDashboard = () => {
  const { user, logout } = useAuth();
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.full_name}</h1>
          <button
            onClick={logout}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>
      
      <main className="p-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Regular User Dashboard</h2>
          <p className="text-gray-600">
            Your regular user features are coming soon. The super admin system is now fully operational!
          </p>
          <div className="mt-4">
            <p className="text-sm text-gray-500">Your role: <span className="font-medium">{user?.role}</span></p>
            <p className="text-sm text-gray-500">Status: <span className="font-medium">{user?.status}</span></p>
          </div>
        </div>
      </main>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/auth" />;
};

// Main App Component
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

// Dashboard Router Component
const Dashboard = () => {
  const { user } = useAuth();
  
  if (user?.role === 'super_admin') {
    return <SuperAdminPortal />;
  }
  
  return <RegularDashboard />;
};

// Regular Member View Component (What normal users see)
const RegularMemberView = ({ user }) => {
  const { API } = useAuth();
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchUpcomingTasks();
    fetchAttendanceStats();
  }, []);

  const fetchUpcomingTasks = async () => {
    try {
      const response = await axios.get(`${API}/my-tasks/upcoming`);
      setUpcomingTasks(response.data);
    } catch (error) {
      console.error('Failed to fetch upcoming tasks:', error);
    }
  };

  const fetchAttendanceStats = async () => {
    try {
      const response = await axios.get(`${API}/my-attendance/stats`);
      setAttendanceStats(response.data);
    } catch (error) {
      console.error('Failed to fetch attendance stats:', error);
    }
  };

  const handlePunchIn = async (taskId) => {
    setLoading(true);
    try {
      // Get user's location for GPS verification
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const response = await axios.post(`${API}/tasks/${taskId}/punch-in`, {
                task_id: taskId,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              });
              
              setMessage({ 
                type: response.data.reward_status.includes('NO REWARDS') ? 'error' : 'success', 
                text: `${response.data.message} - ${response.data.reward_status}` 
              });
              fetchUpcomingTasks();
              fetchAttendanceStats();
            } catch (error) {
              setMessage({ 
                type: 'error', 
                text: error.response?.data?.detail || 'Failed to punch in' 
              });
            } finally {
              setLoading(false);
            }
          },
          async () => {
            // Location denied, punch in without GPS
            try {
              const response = await axios.post(`${API}/tasks/${taskId}/punch-in`, {
                task_id: taskId
              });
              
              setMessage({ 
                type: response.data.reward_status.includes('NO REWARDS') ? 'error' : 'success', 
                text: `${response.data.message} - ${response.data.reward_status}` 
              });
              fetchUpcomingTasks();
              fetchAttendanceStats();
            } catch (error) {
              setMessage({ 
                type: 'error', 
                text: error.response?.data?.detail || 'Failed to punch in' 
              });
            } finally {
              setLoading(false);
            }
          }
        );
      } else {
        // No geolocation support
        const response = await axios.post(`${API}/tasks/${taskId}/punch-in`, {
          task_id: taskId
        });
        
        setMessage({ 
          type: response.data.reward_status.includes('NO REWARDS') ? 'error' : 'success', 
          text: `${response.data.message} - ${response.data.reward_status}` 
        });
        fetchUpcomingTasks();
        fetchAttendanceStats();
        setLoading(false);
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to punch in' 
      });
      setLoading(false);
    }
  };

  const handlePunchOut = async (taskId) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/tasks/${taskId}/punch-out`, {
        task_id: taskId,
        task_rating: 5 // Default good rating
      });
      
      setMessage({ 
        type: 'success', 
        text: `${response.data.message} Total earned: ${response.data.total_points_earned}pts + ${response.data.total_coins_earned} coins` 
      });
      fetchUpcomingTasks();
      fetchAttendanceStats();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to punch out' 
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getTimeUntilStart = (minutes) => {
    if (minutes < 0) return 'Started';
    if (minutes === 0) return 'Starting now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Message Display */}
      {message && (
        <div className={`px-4 py-3 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-600' 
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {message.text}
        </div>
      )}

      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.full_name || 'Member'}!</h2>
            <p className="text-blue-100 text-lg">Ready to serve and grow together</p>
          </div>
          <div className="text-right">
            <div className="text-4xl mb-2">🙏</div>
            <p className="text-blue-100">Member Dashboard</p>
          </div>
        </div>
      </div>

      {/* Member Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">My Points</p>
              <p className="text-3xl font-bold text-green-600">{user?.points || 0}</p>
              <p className="text-xs text-green-500">Earned through service</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⭐</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">YHWH Coins</p>
              <p className="text-3xl font-bold text-purple-600">{user?.coins?.toLocaleString() || 0}</p>
              <p className="text-xs text-purple-500">Kingdom rewards</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
          </div>
        </div>

        {attendanceStats && (
          <>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Punctuality Rate</p>
                  <p className="text-3xl font-bold text-blue-600">{attendanceStats.punctuality_rate}%</p>
                  <p className="text-xs text-blue-500">On-time arrivals</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">⏰</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Current Streak</p>
                  <p className="text-3xl font-bold text-orange-600">{attendanceStats.current_streak}</p>
                  <p className="text-xs text-orange-500">On-time tasks</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🔥</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upcoming Tasks - Real Implementation */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">My Upcoming Tasks</h3>
        {upcomingTasks.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">📅</div>
            <p className="text-gray-600">No upcoming tasks assigned</p>
            <p className="text-sm text-gray-500 mt-2">Check back later for new assignments</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingTasks.map((taskData) => {
              const task = taskData.task;
              const attendance = taskData.attendance;
              const timeUntilStart = taskData.time_until_start;
              const canPunchIn = taskData.can_punch_in;
              
              return (
                <div key={task.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold">
                      ⏰
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{task.name}</h4>
                      <p className="text-sm text-gray-600">{task.category} • {formatDateTime(task.start_datetime)}</p>
                      <p className="text-xs text-gray-500">
                        {timeUntilStart < 0 ? 'Started' : `Starts in ${getTimeUntilStart(timeUntilStart)}`}
                        {task.location_address && ` • ${task.location_address}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">+{task.points_reward + task.punctuality_bonus_points} Points</p>
                      <p className="text-sm text-purple-600">+{task.coins_reward + task.punctuality_bonus_coins} Coins</p>
                      <p className="text-xs text-gray-500">
                        {timeUntilStart > 15 ? 'Future task' : 
                         timeUntilStart > 0 ? 'Ready to punch in' : 
                         timeUntilStart > -15 ? 'Grace period (50% rewards)' : 
                         'No rewards available'}
                      </p>
                    </div>
                    
                    {/* Punch In/Out Buttons */}
                    <div className="flex flex-col space-y-2">
                      {!attendance?.punch_in_time ? (
                        <button
                          onClick={() => handlePunchIn(task.id)}
                          disabled={loading || !canPunchIn}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            canPunchIn
                              ? 'bg-green-500 text-white hover:bg-green-600'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {loading ? 'Punching In...' : 'Punch In'}
                        </button>
                      ) : !attendance?.punch_out_time ? (
                        <button
                          onClick={() => handlePunchOut(task.id)}
                          disabled={loading}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                        >
                          {loading ? 'Punching Out...' : 'Punch Out'}
                        </button>
                      ) : (
                        <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium">
                          Completed
                        </span>
                      )}
                      
                      {attendance?.punch_in_time && (
                        <div className="text-xs text-center">
                          <p className="text-gray-500">Punched in:</p>
                          <p className="font-medium">{formatDateTime(attendance.punch_in_time)}</p>
                          {attendance.is_late && (
                            <p className={`font-medium ${attendance.is_within_grace_period ? 'text-yellow-600' : 'text-red-600'}`}>
                              {attendance.minutes_late} min late
                              {attendance.is_within_grace_period ? ' (Grace)' : ' (No Rewards)'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="p-4 bg-blue-50 hover:bg-blue-100 rounded-xl border-2 border-blue-200 hover:border-blue-300 transition-all text-center">
            <div className="text-3xl mb-2">📋</div>
            <h4 className="font-semibold text-blue-700">All My Tasks</h4>
            <p className="text-sm text-blue-600">View all assignments</p>
          </button>
          
          <button className="p-4 bg-green-50 hover:bg-green-100 rounded-xl border-2 border-green-200 hover:border-green-300 transition-all text-center">
            <div className="text-3xl mb-2">📊</div>
            <h4 className="font-semibold text-green-700">My Stats</h4>
            <p className="text-sm text-green-600">Attendance analytics</p>
          </button>
          
          <button className="p-4 bg-purple-50 hover:bg-purple-100 rounded-xl border-2 border-purple-200 hover:border-purple-300 transition-all text-center">
            <div className="text-3xl mb-2">🫂</div>
            <h4 className="font-semibold text-purple-700">My Groups</h4>
            <p className="text-sm text-purple-600">View communities</p>
          </button>
          
          <button className="p-4 bg-orange-50 hover:bg-orange-100 rounded-xl border-2 border-orange-200 hover:border-orange-300 transition-all text-center">
            <div className="text-3xl mb-2">🏆</div>
            <h4 className="font-semibold text-orange-700">Achievements</h4>
            <p className="text-sm text-orange-600">View rewards earned</p>
          </button>
        </div>
      </div>

      {/* Member Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">ℹ️</span>
          <div>
            <h4 className="font-semibold text-blue-900">Member Experience Preview</h4>
            <p className="text-blue-700">This is what regular members see when they log in. You can switch back to Admin View using the toggle button above.</p>
            <p className="text-blue-700 mt-1"><strong>Time Tracking System:</strong> Members can punch in/out of assigned tasks and earn rewards based on punctuality!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Church Video Conference Content Component - Complete Agora Implementation
const VideoConferenceContent = ({ API, groups, users, setMessage }) => {
  const { user } = useAuth(); // Get current user for role mapping
  const [churchVideoRooms, setChurchVideoRooms] = useState([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [videoCall, setVideoCall] = useState(false);
  const [agoraConfig, setAgoraConfig] = useState(null);
  const [scriptureDisplay, setScriptureDisplay] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Room creation form state
  const [newRoom, setNewRoom] = useState({
    room_name: '',
    service_type: 'main_service',
    max_participants: 1000,
    enable_recording: true,
    enable_streaming: false,
    streaming_platforms: [],
    group_id: ''
  });

  // Map user role to Agora role for church-specific permissions
  const getUserAgoraRole = (userType) => {
    switch(userType) {
      case 'super_admin':
      case 'group_admin':
      case 'team_leader':
        return 'host'; // Church leaders get host privileges
      case 'member':
      default:
        return 'audience'; // Regular members are audience
    }
  };

  useEffect(() => {
    fetchChurchVideoRooms();
  }, []);

  // Add safety check for user availability
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading user profile...</p>
          </div>
        </div>
      </div>
    );
  }

  const fetchChurchVideoRooms = async () => {
    try {
      const response = await axios.get(`${API}/church-video/rooms`);
      setChurchVideoRooms(response.data);
    } catch (error) {
      console.error('Failed to fetch church video rooms:', error);
      setMessage({ type: 'error', text: 'Failed to fetch video rooms' });
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/church-video/create`, newRoom);
      setMessage({ type: 'success', text: 'Church video room created successfully!' });
      setNewRoom({
        room_name: '',
        service_type: 'main_service',
        max_participants: 1000,
        enable_recording: true,
        enable_streaming: false,
        streaming_platforms: [],
        group_id: ''
      });
      setShowCreateRoom(false);
      fetchChurchVideoRooms();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to create video room' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (room) => {
    setLoading(true);
    try {
      // Determine user's Agora role based on church role
      const userAgoraRole = getUserAgoraRole(user?.role);
      
      // Generate Agora token
      const tokenResponse = await axios.post(`${API}/agora/token`, {
        channel_name: room.channel_name,
        uid: Math.floor(Math.random() * 10000) + 1000,
        role: userAgoraRole, // Use the mapped role
        expire_time: 7200
      });

      const config = {
        appId: process.env.REACT_APP_AGORA_APP_ID || 'default-application_10499703',
        channel: room.channel_name,
        token: tokenResponse.data.token,
        uid: tokenResponse.data.uid,
        role: userAgoraRole, // This must never be undefined
      };

      // Validate config before setting
      if (!config.role || (config.role !== 'host' && config.role !== 'audience')) {
        console.error('Invalid Agora role detected:', config.role);
        config.role = 'audience'; // Fallback to audience
      }

      setAgoraConfig(config);
      setActiveRoom(room);
      setVideoCall(true);
      
      setMessage({ type: 'success', text: 'Joined church video conference successfully!' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to join video room' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveRoom = () => {
    setVideoCall(false);
    setActiveRoom(null);
    setAgoraConfig(null);
    setScriptureDisplay('');
    setIsStreaming(false);
    setMessage({ type: 'success', text: 'Left video conference' });
  };

  const handleStartStreaming = async () => {
    if (!activeRoom) return;
    
    try {
      const streamingConfig = [
        {
          platform: 'youtube',
          rtmp_url: 'rtmp://a.rtmp.youtube.com/live2/',
          stream_key: 'your-youtube-stream-key',
          title: `${activeRoom.room_name} - Live Service`,
          description: 'Live church service streaming'
        }
      ];

      await axios.post(`${API}/church-video/${activeRoom.id}/streaming/start`, streamingConfig);
      setIsStreaming(true);
      setMessage({ type: 'success', text: 'Live streaming started!' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to start streaming' 
      });
    }
  };

  const handleScriptureUpdate = async (scripture) => {
    if (!activeRoom) return;
    
    try {
      await axios.post(`${API}/church-video/${activeRoom.id}/scripture`, {
        scripture_text: scripture,
        verse_reference: 'Scripture Display',
        display_position: 'bottom',
        font_size: 24,
        background_opacity: 0.8
      });
      
      setScriptureDisplay(scripture);
      setMessage({ type: 'success', text: 'Scripture display updated!' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to update scripture' 
      });
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm('Are you sure you want to delete this video room? This action cannot be undone.')) {
      try {
        await axios.delete(`${API}/church-video/${roomId}`);
        setMessage({ type: 'success', text: 'Video room deleted successfully!' });
        fetchChurchVideoRooms();
      } catch (error) {
        setMessage({ 
          type: 'error', 
          text: error.response?.data?.detail || 'Failed to delete video room' 
        });
      }
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getServiceTypeIcon = (serviceType) => {
    const icons = {
      'main_service': '⛪',
      'bible_study': '📖',
      'youth_meeting': '👨‍👩‍👧‍👦',
      'prayer': '🙏',
      'worship': '🎵'
    };
    return icons[serviceType] || '📹';
  };

  const rtcCallbacks = {
    EndCall: () => handleLeaveRoom(),
    UserJoined: (uid) => {
      console.log('User joined:', uid);
    },
    UserLeft: (uid) => {
      console.log('User left:', uid);
    },
  };

  // If user is in an active room, show the video conference interface
  if (videoCall && agoraConfig) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {activeRoom?.room_name || 'Church Video Conference'}
              </h2>
              <p className="text-gray-600">
                {activeRoom?.service_type?.replace('_', ' ').toUpperCase()} • Channel: {activeRoom?.channel_name}
              </p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleStartStreaming}
                disabled={isStreaming}
                className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                  isStreaming
                    ? 'bg-red-100 text-red-600 cursor-not-allowed'
                    : 'bg-red-500 text-white hover:bg-red-600'
                }`}
              >
                {isStreaming ? '🔴 Live Streaming' : '📡 Start Streaming'}
              </button>
              <button
                onClick={handleLeaveRoom}
                className="bg-gray-500 text-white px-6 py-3 rounded-xl hover:bg-gray-600 transition-colors"
              >
                Leave Meeting
              </button>
            </div>
          </div>
          
          {/* Church-Specific Controls */}
          <div className="mb-6 p-4 bg-purple-50 rounded-xl">
            <h3 className="text-lg font-semibold text-purple-900 mb-3">Church Service Controls</h3>
            <div className="flex space-x-4">
              <input
                type="text"
                placeholder="Display scripture verse (e.g., John 3:16 - For God so loved the world...)"
                value={scriptureDisplay}
                onChange={(e) => setScriptureDisplay(e.target.value)}
                className="flex-1 px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <button
                onClick={() => handleScriptureUpdate(scriptureDisplay)}
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors"
              >
                Update Scripture
              </button>
            </div>
          </div>
          
          {/* Agora Video Interface */}
          <div className="bg-black rounded-xl overflow-hidden" style={{ height: '600px' }}>
            {agoraConfig && (
              <AgoraUIKit
                rtcProps={agoraConfig}
                callbacks={rtcCallbacks}
                styleProps={{
                  localBtnContainer: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    borderRadius: '12px',
                    padding: '10px'
                  },
                  maxViewContainer: {
                    borderRadius: '12px'
                  }
                }}
              />
            )}
            {!agoraConfig && (
              <div className="flex items-center justify-center h-full text-white">
                <p>Loading video conference...</p>
              </div>
            )}
          </div>
          
          {/* Scripture Overlay */}
          {scriptureDisplay && (
            <div className="absolute bottom-32 left-8 right-8 bg-black bg-opacity-80 text-white p-4 rounded-lg text-center">
              <p className="text-xl font-light font-serif">{scriptureDisplay}</p>
            </div>
          )}
          
          <div className="mt-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-blue-800">
              <strong>🎥 Professional Church Broadcasting:</strong> Use the scripture display to share verses with your congregation. 
              Start live streaming to reach members who cannot attend in person.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Church Video Conference System</h2>
          <p className="text-gray-600">Professional video conferencing with scripture display and live streaming</p>
        </div>
        <button
          onClick={() => setShowCreateRoom(true)}
          className="bg-red-500 text-white px-6 py-3 rounded-xl hover:bg-red-600 transition-colors shadow-lg"
        >
          <span className="flex items-center space-x-2">
            <span>⛪</span>
            <span>Create Church Room</span>
          </span>
        </button>
      </div>

      {/* Create Room Form */}
      {showCreateRoom && (
        <div className="bg-white rounded-2xl shadow-lg p-6 border">
          <h3 className="text-xl font-bold mb-6">Create New Church Video Room</h3>
          <form onSubmit={handleCreateRoom} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Room Name *</label>
                <input
                  type="text"
                  required
                  value={newRoom.room_name}
                  onChange={(e) => setNewRoom({ ...newRoom, room_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="Sunday Morning Service"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Service Type</label>
                <select
                  value={newRoom.service_type}
                  onChange={(e) => setNewRoom({ ...newRoom, service_type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="main_service">⛪ Main Service</option>
                  <option value="bible_study">📖 Bible Study</option>
                  <option value="youth_meeting">👨‍👩‍👧‍👦 Youth Meeting</option>
                  <option value="prayer">🙏 Prayer Meeting</option>
                  <option value="worship">🎵 Worship Service</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Participants</label>
                <select
                  value={newRoom.max_participants}
                  onChange={(e) => setNewRoom({ ...newRoom, max_participants: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value={50}>50 participants</option>
                  <option value={200}>200 participants</option>
                  <option value={500}>500 participants</option>
                  <option value={1000}>1,000 participants (Full Capacity)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Group</label>
                <select
                  value={newRoom.group_id}
                  onChange={(e) => setNewRoom({ ...newRoom, group_id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                >
                  <option value="">All Church Members</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="bg-red-50 rounded-xl p-4">
              <h4 className="font-semibold text-gray-900 mb-4">Church Service Features</h4>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newRoom.enable_recording}
                    onChange={(e) => setNewRoom({ ...newRoom, enable_recording: e.target.checked })}
                    className="w-5 h-5 text-red-600 border border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">Enable Automatic Cloud Recording</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newRoom.enable_streaming}
                    onChange={(e) => setNewRoom({ ...newRoom, enable_streaming: e.target.checked })}
                    className="w-5 h-5 text-red-600 border border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">Enable Live Streaming (YouTube, Facebook)</span>
                </label>
              </div>
            </div>
            
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-red-500 text-white px-6 py-3 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors shadow-lg"
              >
                {loading ? 'Creating...' : 'Create Church Room'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateRoom(false)}
                className="bg-gray-300 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Church Video Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {churchVideoRooms.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-2xl shadow-lg">
            <div className="text-6xl mb-4">⛪</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Church Video Rooms Created</h3>
            <p className="text-gray-600 mb-6">Create your first church video room to start broadcasting services</p>
            <button
              onClick={() => setShowCreateRoom(true)}
              className="bg-red-500 text-white px-6 py-3 rounded-xl hover:bg-red-600 transition-colors"
            >
              Create First Room
            </button>
          </div>
        ) : (
          churchVideoRooms.map((room) => (
            <div key={room.id} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-200 border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {getServiceTypeIcon(room.service_type)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{room.room_name}</h3>
                    <p className="text-sm text-gray-500">{room.service_type.replace('_', ' ').toUpperCase()}</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
              
              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Channel:</span>
                  <span className="font-medium text-gray-900">{room.channel_name}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Max Participants:</span>
                  <span className="font-medium text-gray-900">{room.max_participants.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Recording:</span>
                  <span className="font-medium text-gray-900">
                    {room.enable_recording ? '✅ Enabled' : '❌ Disabled'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Live Streaming:</span>
                  <span className="font-medium text-gray-900">
                    {room.enable_streaming ? '🔴 Ready' : '📡 Available'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Created:</span>
                  <span className="font-medium text-gray-900 text-xs">
                    {formatDateTime(room.created_at)}
                  </span>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => handleJoinRoom(room)}
                  disabled={loading}
                  className="flex-1 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm hover:bg-red-100 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Joining...' : 'Join Service'}
                </button>
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Professional Features Info */}
      <div className="bg-gradient-to-r from-purple-500 to-red-500 rounded-2xl shadow-lg p-6 text-white">
        <h3 className="text-xl font-bold mb-4">Professional Church Broadcasting Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl mb-2">📖</div>
            <h4 className="font-semibold mb-2">Scripture Display</h4>
            <p className="text-sm opacity-90">Display Bible verses with professional formatting during services</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">🔴</div>
            <h4 className="font-semibold mb-2">Multi-Platform Streaming</h4>
            <p className="text-sm opacity-90">Stream simultaneously to YouTube, Facebook, and other platforms</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">☁️</div>
            <h4 className="font-semibold mb-2">Cloud Recording</h4>
            <p className="text-sm opacity-90">Automatic recording with 7TB storage for all church services</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Time Tracking & Punctuality System Component - Phase 2
const TimeTrackingContent = ({ API, groups, users, setMessage }) => {
  const [tasks, setTasks] = useState([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskAttendance, setTaskAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState('tasks'); // 'tasks', 'attendance', 'analytics'

  // Task creation form state
  const [newTask, setNewTask] = useState({
    name: '',
    description: '',
    category: 'Ministry',
    task_type: 'individual',
    assigned_users: [],
    assigned_groups: [],
    start_datetime: '',
    end_datetime: '',
    location_address: '',
    virtual_link: '',
    gps_latitude: null,
    gps_longitude: null,
    check_in_radius_meters: 100,
    points_reward: 10,
    coins_reward: 5,
    punctuality_bonus_points: 5,
    punctuality_bonus_coins: 2,
    instructions: '',
    required_materials: '',
    contact_person: '',
    max_participants: null,
    min_age: null,
    is_recurring: false
  });

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API}/tasks/`);
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      setMessage({ type: 'error', text: 'Failed to fetch tasks' });
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert datetime strings to proper format
      const taskData = {
        ...newTask,
        start_datetime: new Date(newTask.start_datetime).toISOString(),
        end_datetime: new Date(newTask.end_datetime).toISOString(),
      };

      const response = await axios.post(`${API}/tasks/`, taskData);
      setMessage({ type: 'success', text: 'Task created successfully!' });
      setNewTask({
        name: '',
        description: '',
        category: 'Ministry',
        task_type: 'individual',
        assigned_users: [],
        assigned_groups: [],
        start_datetime: '',
        end_datetime: '',
        location_address: '',
        virtual_link: '',
        gps_latitude: null,
        gps_longitude: null,
        check_in_radius_meters: 100,
        points_reward: 10,
        coins_reward: 5,
        punctuality_bonus_points: 5,
        punctuality_bonus_coins: 2,
        instructions: '',
        required_materials: '',
        contact_person: '',
        max_participants: null,
        min_age: null,
        is_recurring: false
      });
      setShowCreateTask(false);
      fetchTasks();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to create task' 
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskAttendance = async (taskId) => {
    try {
      const response = await axios.get(`${API}/tasks/${taskId}/attendance`);
      setTaskAttendance(response.data);
      setSelectedTask(taskId);
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to fetch attendance data' 
      });
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      try {
        await axios.delete(`${API}/tasks/${taskId}`);
        setMessage({ type: 'success', text: 'Task deleted successfully!' });
        fetchTasks();
      } catch (error) {
        setMessage({ 
          type: 'error', 
          text: error.response?.data?.detail || 'Failed to delete task' 
        });
      }
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getTaskStatusColor = (task) => {
    const now = new Date();
    const startTime = new Date(task.start_datetime);
    const endTime = new Date(task.end_datetime);
    
    if (now < startTime) return 'bg-blue-100 text-blue-800';
    if (now >= startTime && now <= endTime) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getTaskStatusText = (task) => {
    const now = new Date();
    const startTime = new Date(task.start_datetime);
    const endTime = new Date(task.end_datetime);
    
    if (now < startTime) return 'Scheduled';
    if (now >= startTime && now <= endTime) return 'Active';
    return 'Completed';
  };

  return (
    <div className="space-y-6">
      {/* Header with View Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Time Tracking & Punctuality System</h2>
          <p className="text-gray-600">Manage tasks, monitor attendance, and enforce punctuality</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* View Selector */}
          <div className="bg-white rounded-xl border border-gray-300 p-1 flex">
            {[
              { id: 'tasks', name: 'Tasks', icon: '📋' },
              { id: 'attendance', name: 'Attendance', icon: '👥' },
              { id: 'analytics', name: 'Analytics', icon: '📊' }
            ].map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeView === view.id
                    ? 'bg-yellow-500 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="mr-2">{view.icon}</span>
                {view.name}
              </button>
            ))}
          </div>
          
          {activeView === 'tasks' && (
            <button
              onClick={() => setShowCreateTask(true)}
              className="bg-yellow-500 text-white px-6 py-3 rounded-xl hover:bg-yellow-600 transition-colors shadow-lg"
            >
              <span className="flex items-center space-x-2">
                <span>⏰</span>
                <span>Create Task</span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Tasks View */}
      {activeView === 'tasks' && (
        <>
          {/* Create Task Form */}
          {showCreateTask && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border">
              <h3 className="text-xl font-bold mb-6">Create New Task</h3>
              <form onSubmit={handleCreateTask} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Task Name *</label>
                    <input
                      type="text"
                      required
                      value={newTask.name}
                      onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                      placeholder="Enter task name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select
                      value={newTask.category}
                      onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    >
                      <option value="Ministry">Ministry</option>
                      <option value="Service">Service</option>
                      <option value="Study">Study</option>
                      <option value="Worship">Worship</option>
                      <option value="Outreach">Outreach</option>
                      <option value="Leadership">Leadership</option>
                      <option value="Special Event">Special Event</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date & Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={newTask.start_datetime}
                      onChange={(e) => setNewTask({ ...newTask, start_datetime: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date & Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={newTask.end_datetime}
                      onChange={(e) => setNewTask({ ...newTask, end_datetime: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    placeholder="Describe the task requirements and expectations"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Groups</label>
                    <select
                      multiple
                      value={newTask.assigned_groups}
                      onChange={(e) => setNewTask({ 
                        ...newTask, 
                        assigned_groups: Array.from(e.target.selectedOptions, option => option.value)
                      })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                      size="4"
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple groups</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location Address</label>
                    <input
                      type="text"
                      value={newTask.location_address}
                      onChange={(e) => setNewTask({ ...newTask, location_address: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                      placeholder="Physical location or 'Virtual'"
                    />
                  </div>
                </div>

                {/* Reward Settings */}
                <div className="bg-yellow-50 rounded-xl p-4">
                  <h4 className="font-semibold text-gray-900 mb-4">Reward & Punctuality Settings</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Points Reward</label>
                      <input
                        type="number"
                        min="0"
                        value={newTask.points_reward}
                        onChange={(e) => setNewTask({ ...newTask, points_reward: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Coins Reward</label>
                      <input
                        type="number"
                        min="0"
                        value={newTask.coins_reward}
                        onChange={(e) => setNewTask({ ...newTask, coins_reward: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">On-Time Bonus Points</label>
                      <input
                        type="number"
                        min="0"
                        value={newTask.punctuality_bonus_points}
                        onChange={(e) => setNewTask({ ...newTask, punctuality_bonus_points: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">On-Time Bonus Coins</label>
                      <input
                        type="number"
                        min="0"
                        value={newTask.punctuality_bonus_coins}
                        onChange={(e) => setNewTask({ ...newTask, punctuality_bonus_coins: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-yellow-500 text-white px-6 py-3 rounded-xl hover:bg-yellow-600 disabled:opacity-50 transition-colors shadow-lg"
                  >
                    {loading ? 'Creating...' : 'Create Task'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateTask(false)}
                    className="bg-gray-300 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tasks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.length === 0 ? (
              <div className="col-span-full text-center py-12 bg-white rounded-2xl shadow-lg">
                <div className="text-6xl mb-4">⏰</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Tasks Created</h3>
                <p className="text-gray-600 mb-6">Create your first task to start tracking attendance and punctuality</p>
                <button
                  onClick={() => setShowCreateTask(true)}
                  className="bg-yellow-500 text-white px-6 py-3 rounded-xl hover:bg-yellow-600 transition-colors"
                >
                  Create First Task
                </button>
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-200 border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                        ⏰
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{task.name}</h3>
                        <p className="text-sm text-gray-500">{task.category}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTaskStatusColor(task)}`}>
                      {getTaskStatusText(task)}
                    </span>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Start Time:</span>
                      <span className="font-medium text-gray-900 text-xs">{formatDateTime(task.start_datetime)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">End Time:</span>
                      <span className="font-medium text-gray-900 text-xs">{formatDateTime(task.end_datetime)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Rewards:</span>
                      <span className="font-medium text-green-600">{task.points_reward}pts + {task.coins_reward} coins</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">On-Time Bonus:</span>
                      <span className="font-medium text-blue-600">+{task.punctuality_bonus_points}pts + {task.punctuality_bonus_coins} coins</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => fetchTaskAttendance(task.id)}
                      className="flex-1 bg-yellow-50 text-yellow-600 px-3 py-2 rounded-lg text-sm hover:bg-yellow-100 transition-colors font-medium"
                    >
                      View Attendance
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Attendance View */}
      {activeView === 'attendance' && selectedTask && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-bold mb-6">Task Attendance Details</h3>
          {taskAttendance.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">👥</div>
              <p className="text-gray-600">No attendance records found for this task</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Punch In</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Punch Out</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Minutes Late</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rewards</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {taskAttendance.map((attendance) => (
                    <tr key={attendance.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {users.find(u => u.id === attendance.user_id)?.full_name || attendance.user_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          attendance.status === 'completed' 
                            ? 'bg-green-100 text-green-800'
                            : attendance.status === 'punched_in'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {attendance.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {attendance.punch_in_time ? formatDateTime(attendance.punch_in_time) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {attendance.punch_out_time ? formatDateTime(attendance.punch_out_time) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={attendance.is_late ? 'text-red-600 font-medium' : 'text-green-600'}>
                          {attendance.minutes_late || 0} min
                          {attendance.is_late && !attendance.is_within_grace_period && ' (No Rewards)'}
                          {attendance.is_late && attendance.is_within_grace_period && ' (Grace Period)'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                        {attendance.points_earned}pts + {attendance.coins_earned} coins
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Analytics View */}
      {activeView === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                  <p className="text-3xl font-bold text-blue-600">{tasks.length}</p>
                  <p className="text-xs text-blue-500">All time</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📋</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Tasks</p>
                  <p className="text-3xl font-bold text-green-600">
                    {tasks.filter(task => {
                      const now = new Date();
                      const start = new Date(task.start_datetime);
                      const end = new Date(task.end_datetime);
                      return now >= start && now <= end;
                    }).length}
                  </p>
                  <p className="text-xs text-green-500">Currently running</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🟢</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Scheduled Tasks</p>
                  <p className="text-3xl font-bold text-yellow-600">
                    {tasks.filter(task => new Date(task.start_datetime) > new Date()).length}
                  </p>
                  <p className="text-xs text-yellow-500">Upcoming</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">⏰</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed Tasks</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {tasks.filter(task => new Date(task.end_datetime) < new Date()).length}
                  </p>
                  <p className="text-xs text-purple-500">Finished</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Punctuality Enforcement Rules</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <h4 className="font-semibold text-green-800">On Time</h4>
                </div>
                <p className="text-sm text-green-700 mb-2">Arrival at or before scheduled start time</p>
                <p className="text-xs text-green-600 font-medium">• Full rewards + punctuality bonus</p>
                <p className="text-xs text-green-600 font-medium">• Perfect attendance record</p>
              </div>

              <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm">~</span>
                  </div>
                  <h4 className="font-semibold text-yellow-800">Grace Period</h4>
                </div>
                <p className="text-sm text-yellow-700 mb-2">Arrival within 15 minutes of start time</p>
                <p className="text-xs text-yellow-600 font-medium">• 50% of rewards</p>
                <p className="text-xs text-yellow-600 font-medium">• Counts as on-time for streaks</p>
              </div>

              <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm">✗</span>
                  </div>
                  <h4 className="font-semibold text-red-800">Too Late</h4>
                </div>
                <p className="text-sm text-red-700 mb-2">Arrival 15+ minutes after start time</p>
                <p className="text-xs text-red-600 font-medium">• ZERO rewards</p>
                <p className="text-xs text-red-600 font-medium">• Permanent late record</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;