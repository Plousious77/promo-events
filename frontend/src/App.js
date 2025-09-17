import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
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

// Super Admin Dashboard
const SuperAdminDashboard = () => {
  const { user, logout, changePassword, API } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);
  const [accessCodes, setAccessCodes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [trainingVideos, setTrainingVideos] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [donations, setDonations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [codeForm, setCodeForm] = useState({
    phone_last_four: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'admin-requests') fetchAdminRequests();
    if (activeTab === 'access-codes') fetchAccessCodes();
    if (activeTab === 'groups') fetchGroups();
    if (activeTab === 'training') fetchTrainingVideos();
    if (activeTab === 'meetings') fetchMeetings();
    if (activeTab === 'finances') fetchDonationStats();
    if (activeTab === 'analytics') fetchAnalytics();
    if (activeTab === 'activities') fetchActivities();
  }, [activeTab]);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchAdminRequests = async () => {
    try {
      const response = await axios.get(`${API}/admin/requests`);
      setAdminRequests(response.data);
    } catch (error) {
      console.error('Failed to fetch admin requests:', error);
    }
  };

  const fetchAccessCodes = async () => {
    try {
      const response = await axios.get(`${API}/admin/access-codes`);
      setAccessCodes(response.data);
    } catch (error) {
      console.error('Failed to fetch access codes:', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API}/admin/groups/all`);
      setGroups(response.data);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };

  const fetchTrainingVideos = async () => {
    try {
      const response = await axios.get(`${API}/admin/training/videos`);
      setTrainingVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch training videos:', error);
    }
  };

  const fetchMeetings = async () => {
    try {
      const response = await axios.get(`${API}/admin/meetings`);
      setMeetings(response.data);
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
    }
  };

  const fetchDonationStats = async () => {
    try {
      const response = await axios.get(`${API}/admin/donations/stats`);
      setDonations(response.data);
    } catch (error) {
      console.error('Failed to fetch donation stats:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API}/admin/analytics/overview`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await axios.get(`${API}/admin/activities`);
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

  const generateAccessCode = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/admin/generate-access-code`, codeForm);
      setMessage({ type: 'success', text: `Access code ${response.data.access_code} generated successfully!` });
      setCodeForm({ phone_last_four: '' });
      fetchAccessCodes();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to generate access code' });
    }

    setLoading(false);
  };

  const approveRequest = async (requestId, notes = '') => {
    try {
      await axios.post(`${API}/admin/requests/${requestId}/approve`, { notes });
      setMessage({ type: 'success', text: 'Admin request approved successfully!' });
      fetchAdminRequests();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to approve request' });
    }
  };

  const denyRequest = async (requestId, notes = '') => {
    try {
      await axios.post(`${API}/admin/requests/${requestId}/deny`, { notes });
      setMessage({ type: 'success', text: 'Admin request denied' });
      fetchAdminRequests();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to deny request' });
    }
  };

  const updateUserRole = async (userId, newRole) => {
    try {
      await axios.put(`${API}/admin/users/${userId}/role`, { role: newRole });
      setMessage({ type: 'success', text: 'User role updated successfully!' });
      fetchUsers();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to update user role' });
    }
  };

  const updateUserStatus = async (userId, newStatus) => {
    try {
      await axios.put(`${API}/admin/users/${userId}/status`, { status: newStatus });
      setMessage({ type: 'success', text: 'User status updated successfully!' });
      fetchUsers();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to update user status' });
    }
  };

  const bulkUserAction = async (action, value = null) => {
    if (selectedUsers.length === 0) {
      setMessage({ type: 'error', text: 'Please select users first' });
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${API}/admin/users/bulk-action`, {
        user_ids: selectedUsers,
        action: action,
        value: value
      });
      setMessage({ type: 'success', text: `Bulk ${action} completed successfully!` });
      setSelectedUsers([]);
      fetchUsers();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || `Failed to perform bulk ${action}` });
    } finally {
      setLoading(false);
    }
  };

  const resetUserPassword = async (userId) => {
    try {
      const response = await axios.post(`${API}/admin/users/${userId}/reset-password`, {
        user_id: userId,
        send_email: true
      });
      setMessage({ 
        type: 'success', 
        text: `Password reset! Temporary password: ${response.data.temporary_password}` 
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to reset password' });
    }
  };

  const createGroup = async (groupData) => {
    try {
      setLoading(true);
      await axios.post(`${API}/admin/groups`, groupData);
      setMessage({ type: 'success', text: 'Group created successfully!' });
      fetchGroups();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to create group' });
    } finally {
      setLoading(false);
    }
  };

  const createTrainingVideo = async (videoData) => {
    try {
      setLoading(true);
      await axios.post(`${API}/admin/training/videos`, videoData);
      setMessage({ type: 'success', text: 'Training video created successfully!' });
      fetchTrainingVideos();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to create training video' });
    } finally {
      setLoading(false);
    }
  };

  const createMeeting = async (meetingData) => {
    try {
      setLoading(true);
      await axios.post(`${API}/admin/meetings`, meetingData);
      setMessage({ type: 'success', text: 'Meeting created successfully!' });
      fetchMeetings();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to create meeting' });
    } finally {
      setLoading(false);
    }
  };

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: '🏠' },
    { id: 'users', name: 'User Management', icon: '👥' },
    { id: 'groups', name: 'Group Management', icon: '🫂' },
    { id: 'training', name: 'Training Center', icon: '🎓' },
    { id: 'meetings', name: 'Meeting Management', icon: '📅' },
    { id: 'finances', name: 'Financial Dashboard', icon: '💰' },
    { id: 'analytics', name: 'System Analytics', icon: '📊' },
    { id: 'admin-requests', name: 'Admin Requests', icon: '📋' },
    { id: 'access-codes', name: 'Access Codes', icon: '🔑' },
    { id: 'activities', name: 'System Activities', icon: '📝' },
    { id: 'settings', name: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">👑</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{user?.full_name}</h3>
              <p className="text-sm text-purple-600 font-medium">Super Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navigation.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === item.id
                      ? 'bg-purple-50 text-purple-700 border-l-4 border-purple-500'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <span className="text-xl">🚪</span>
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              {navigation.find(item => item.id === activeTab)?.name || 'Dashboard'}
            </h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-gradient-to-r from-purple-100 to-pink-200 px-4 py-2 rounded-full">
                <span className="text-2xl">💰</span>
                <span className="font-bold text-purple-700">{user?.coins?.toLocaleString() || 0} YHWH Coins</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          {message.text && (
            <div className={`mb-4 px-4 py-3 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-600' 
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {message.text}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Users</p>
                      <p className="text-3xl font-bold text-gray-900">{analytics?.users?.total || users.length}</p>
                      <p className="text-xs text-gray-400">
                        {analytics?.users?.active || 0} active • {analytics?.users?.inactive || 0} inactive
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">👥</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Groups</p>
                      <p className="text-3xl font-bold text-gray-900">{analytics?.groups?.total || groups.length}</p>
                      <p className="text-xs text-gray-400">Active groups</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🫂</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pending Requests</p>
                      <p className="text-3xl font-bold text-gray-900">
                        {adminRequests.filter(req => req.status === 'pending').length}
                      </p>
                      <p className="text-xs text-gray-400">Admin requests</p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">📋</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-amber-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Your Coins</p>
                      <p className="text-3xl font-bold text-gray-900">{user?.coins?.toLocaleString() || 0}</p>
                      <p className="text-xs text-gray-400">YHWH Kingdom Coins</p>
                    </div>
                    <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">💰</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Donations</p>
                      <p className="text-3xl font-bold text-gray-900">
                        ${donations?.total_amount?.toLocaleString() || '0'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {donations?.total_count || 0} donations
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">💝</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-indigo-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Training Videos</p>
                      <p className="text-3xl font-bold text-gray-900">{trainingVideos.length}</p>
                      <p className="text-xs text-gray-400">Active videos</p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🎓</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-pink-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Upcoming Meetings</p>
                      <p className="text-3xl font-bold text-gray-900">
                        {meetings.filter(m => new Date(m.scheduled_date) > new Date()).length}
                      </p>
                      <p className="text-xs text-gray-400">Scheduled meetings</p>
                    </div>
                    <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">📅</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-teal-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Recent Activity</p>
                      <p className="text-3xl font-bold text-gray-900">
                        {analytics?.activity?.recent_actions || activities.length}
                      </p>
                      <p className="text-xs text-gray-400">Last 7 days</p>
                    </div>
                    <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">📊</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Welcome to Super Admin Dashboard</h3>
                <p className="text-gray-600 mb-4">
                  You have complete control over the Glory of Elshaddai Christian Center Connect system.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">Quick Actions</h4>
                    <button 
                      onClick={() => setActiveTab('admin-requests')}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">📋</span>
                        <span className="font-medium">Review Admin Requests</span>
                      </div>
                    </button>
                    <button 
                      onClick={() => setActiveTab('access-codes')}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">🔑</span>
                        <span className="font-medium">Generate Access Codes</span>
                      </div>
                    </button>
                    <button 
                      onClick={() => setActiveTab('users')}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">👥</span>
                        <span className="font-medium">Manage Users</span>
                      </div>
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">System Status</h4>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600">✅ System Running Normally</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">ℹ️ All Services Online</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-sm text-purple-600">👑 Super Admin Access Active</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Bulk Actions Bar */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium text-gray-700">
                      {selectedUsers.length} user(s) selected
                    </span>
                    {selectedUsers.length > 0 && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => bulkUserAction('activate')}
                          className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition-colors"
                        >
                          Activate
                        </button>
                        <button
                          onClick={() => bulkUserAction('deactivate')}
                          className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600 transition-colors"
                        >
                          Deactivate
                        </button>
                        <button
                          onClick={() => bulkUserAction('reset_password')}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                        >
                          Reset Passwords
                        </button>
                        <select
                          onChange={(e) => e.target.value && bulkUserAction('change_role', e.target.value)}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                          defaultValue=""
                        >
                          <option value="">Change Role...</option>
                          <option value="member">To Member</option>
                          <option value="team_leader">To Team Leader</option>
                          <option value="group_admin">To Group Admin</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedUsers([])}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers(users.map(u => u.id));
                              } else {
                                setSelectedUsers([]);
                              }
                            }}
                            checked={selectedUsers.length === users.length && users.length > 0}
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points/Coins</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((userItem) => (
                        <tr key={userItem.id} className={selectedUsers.includes(userItem.id) ? 'bg-purple-50' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(userItem.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUsers([...selectedUsers, userItem.id]);
                                } else {
                                  setSelectedUsers(selectedUsers.filter(id => id !== userItem.id));
                                }
                              }}
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{userItem.full_name}</div>
                              <div className="text-sm text-gray-500">{userItem.email}</div>
                              {userItem.phone && (
                                <div className="text-xs text-gray-400">{userItem.phone}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={userItem.role}
                              onChange={(e) => updateUserRole(userItem.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="member">Member</option>
                              <option value="team_leader">Team Leader</option>
                              <option value="group_admin">Group Admin</option>
                              <option value="super_admin">Super Admin</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={userItem.status}
                              onChange={(e) => updateUserStatus(userItem.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                              <option value="locked">Locked</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center space-x-2">
                              <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-full text-xs">
                                {userItem.points} pts
                              </span>
                              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                                {userItem.coins} coins
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                userItem.status === 'active' ? 'bg-green-100 text-green-800' :
                                userItem.status === 'suspended' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {userItem.status}
                              </span>
                              <button
                                onClick={() => resetUserPassword(userItem.id)}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                                title="Reset Password"
                              >
                                🔑 Reset
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin-requests' && (
            <div className="space-y-6">
              {adminRequests.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                  <p className="text-gray-500">No admin requests found</p>
                </div>
              ) : (
                adminRequests.map((request) => (
                  <div key={request.id} className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{request.full_name}</h3>
                        <p className="text-gray-600">{request.email}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {request.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-500">Requested Role</p>
                        <p className="font-medium">{request.requested_role.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Ministry Area</p>
                        <p className="font-medium">{request.ministry_area}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="font-medium">{request.phone}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Reference Contact</p>
                        <p className="font-medium">{request.reference_contact}</p>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-sm text-gray-500">Experience</p>
                      <p className="font-medium">{request.experience}</p>
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-sm text-gray-500">Reason for Request</p>
                      <p className="font-medium">{request.reason}</p>
                    </div>
                    
                    {request.status === 'pending' && (
                      <div className="flex space-x-4">
                        <button
                          onClick={() => approveRequest(request.id)}
                          className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => denyRequest(request.id)}
                          className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'access-codes' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate New Access Code</h3>
                <form onSubmit={generateAccessCode} className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last 4 Digits of Phone Number
                    </label>
                    <input
                      type="text"
                      value={codeForm.phone_last_four}
                      onChange={(e) => setCodeForm({ phone_last_four: e.target.value })}
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="1234"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
                    >
                      Generate Code
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Access Codes</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Last 4</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {accessCodes.map((code) => (
                        <tr key={code.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">
                            {code.code}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {code.phone_last_four}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              code.used_at ? 'bg-gray-100 text-gray-800' :
                              new Date(code.expires_at) < new Date() ? 'bg-red-100 text-red-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {code.used_at ? 'Used' : 
                               new Date(code.expires_at) < new Date() ? 'Expired' : 'Active'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(code.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(code.expires_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <GroupManagementContent 
              groups={groups}
              users={users}
              createGroup={createGroup}
              loading={loading}
            />
          )}

          {activeTab === 'training' && (
            <TrainingCenterContent 
              trainingVideos={trainingVideos}
              createTrainingVideo={createTrainingVideo}
              loading={loading}
            />
          )}

          {activeTab === 'meetings' && (
            <MeetingManagementContent 
              meetings={meetings}
              users={users}
              createMeeting={createMeeting}
              loading={loading}
            />
          )}

          {activeTab === 'finances' && (
            <FinancialDashboardContent donations={donations} />
          )}

          {activeTab === 'analytics' && (
            <SystemAnalyticsContent analytics={analytics} />
          )}

          {activeTab === 'activities' && (
            <SystemActivitiesContent activities={activities} users={users} />
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must be 8+ characters with uppercase, lowercase, and numbers
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Changing...' : 'Change Password'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// Regular User Dashboard (simplified for now)
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Coming Soon</h2>
          <p className="text-gray-600">
            Your regular user dashboard is under construction. The super admin system is now active!
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

# Enhanced Content Components
const GroupManagementContent = ({ groups, users, createGroup, loading }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    group_type: 'Ministry',
    privacy_setting: 'public',
    max_members: '',
    meeting_schedule: ''
  });

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    await createGroup(newGroup);
    setNewGroup({
      name: '',
      description: '',
      group_type: 'Ministry',
      privacy_setting: 'public',
      max_members: '',
      meeting_schedule: ''
    });
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Group Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
        >
          Create New Group
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Create New Group</h3>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Type</label>
                <select
                  value={newGroup.group_type}
                  onChange={(e) => setNewGroup({ ...newGroup, group_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="Ministry">Ministry</option>
                  <option value="Age Group">Age Group</option>
                  <option value="Service Team">Service Team</option>
                  <option value="Leadership Circle">Leadership Circle</option>
                  <option value="Interest Group">Interest Group</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={newGroup.description}
                onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Privacy Setting</label>
                <select
                  value={newGroup.privacy_setting}
                  onChange={(e) => setNewGroup({ ...newGroup, privacy_setting: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="invite_only">Invite Only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Members (Optional)</label>
                <input
                  type="number"
                  value={newGroup.max_members}
                  onChange={(e) => setNewGroup({ ...newGroup, max_members: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Schedule</label>
                <input
                  type="text"
                  value={newGroup.meeting_schedule}
                  onChange={(e) => setNewGroup({ ...newGroup, meeting_schedule: e.target.value })}
                  placeholder="e.g., Sundays 10:00 AM"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => (
          <div key={group.id} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">{group.name.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                  <p className="text-sm text-gray-500">{group.group_type}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                group.privacy_setting === 'public' ? 'bg-green-100 text-green-800' :
                group.privacy_setting === 'private' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {group.privacy_setting}
              </span>
            </div>
            
            {group.description && (
              <p className="text-gray-600 mb-4 text-sm">{group.description}</p>
            )}
            
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Members:</span>
                <span className="font-medium">{group.members?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Leaders:</span>
                <span className="font-medium">{group.leaders?.length || 0}</span>
              </div>
              {group.max_members && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Max Members:</span>
                  <span className="font-medium">{group.max_members}</span>
                </div>
              )}
              {group.meeting_schedule && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Schedule:</span>
                  <span className="font-medium text-xs">{group.meeting_schedule}</span>
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex space-x-2">
                <button className="flex-1 bg-purple-50 text-purple-600 px-3 py-2 rounded-lg text-sm hover:bg-purple-100 transition-colors">
                  Manage Members
                </button>
                <button className="flex-1 bg-gray-50 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors">
                  Edit Group
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrainingCenterContent = ({ trainingVideos, createTrainingVideo, loading }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newVideo, setNewVideo] = useState({
    title: '',
    description: '',
    category: 'General',
    mandatory: false,
    target_roles: []
  });

  const handleCreateVideo = async (e) => {
    e.preventDefault();
    await createTrainingVideo(newVideo);
    setNewVideo({
      title: '',
      description: '',
      category: 'General',
      mandatory: false,
      target_roles: []
    });
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Training Center</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors"
        >
          Add Training Video
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Add Training Video</h3>
          <form onSubmit={handleCreateVideo} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video Title</label>
                <input
                  type="text"
                  value={newVideo.title}
                  onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={newVideo.category}
                  onChange={(e) => setNewVideo({ ...newVideo, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="General">General</option>
                  <option value="New User">New User</option>
                  <option value="Admin Training">Admin Training</option>
                  <option value="Leadership">Leadership</option>
                  <option value="Technical">Technical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={newVideo.description}
                onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newVideo.mandatory}
                  onChange={(e) => setNewVideo({ ...newVideo, mandatory: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Mandatory Training</span>
              </label>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-500 text-white px-6 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Adding...' : 'Add Video'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trainingVideos.map((video) => (
          <div key={video.id} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                video.category === 'New User' ? 'bg-blue-100 text-blue-800' :
                video.category === 'Admin Training' ? 'bg-purple-100 text-purple-800' :
                video.category === 'Leadership' ? 'bg-green-100 text-green-800' :
                video.category === 'Technical' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {video.category}
              </span>
              {video.mandatory && (
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
                  Required
                </span>
              )}
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{video.title}</h3>
            {video.description && (
              <p className="text-gray-600 mb-4 text-sm">{video.description}</p>
            )}
            
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <span className="text-sm text-gray-500">
                Created: {new Date(video.created_at).toLocaleDateString()}
              </span>
              <div className="flex space-x-2">
                <button className="text-indigo-600 hover:text-indigo-800 text-sm">
                  Edit
                </button>
                <button className="text-red-600 hover:text-red-800 text-sm">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MeetingManagementContent = ({ meetings, users, createMeeting, loading }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    description: '',
    meeting_type: 'Admin',
    scheduled_date: '',
    duration_minutes: 60,
    location: '',
    agenda: '',
    attendees: [],
    required_attendees: []
  });

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    const meetingData = {
      ...newMeeting,
      scheduled_date: new Date(newMeeting.scheduled_date).toISOString()
    };
    await createMeeting(meetingData);
    setNewMeeting({
      title: '',
      description: '',
      meeting_type: 'Admin',
      scheduled_date: '',
      duration_minutes: 60,
      location: '',
      agenda: '',
      attendees: [],
      required_attendees: []
    });
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Meeting Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600 transition-colors"
        >
          Schedule Meeting
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Schedule New Meeting</h3>
          <form onSubmit={handleCreateMeeting} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Type</label>
                <select
                  value={newMeeting.meeting_type}
                  onChange={(e) => setNewMeeting({ ...newMeeting, meeting_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                >
                  <option value="Admin">Admin</option>
                  <option value="Ministry">Ministry</option>
                  <option value="Leadership">Leadership</option>
                  <option value="All-Hands">All-Hands</option>
                  <option value="Emergency">Emergency</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={newMeeting.scheduled_date}
                  onChange={(e) => setNewMeeting({ ...newMeeting, scheduled_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={newMeeting.duration_minutes}
                  onChange={(e) => setNewMeeting({ ...newMeeting, duration_minutes: parseInt(e.target.value) })}
                  min="15"
                  step="15"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={newMeeting.location}
                  onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                  placeholder="Room, Zoom link, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={newMeeting.description}
                onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agenda</label>
              <textarea
                value={newMeeting.agenda}
                onChange={(e) => setNewMeeting({ ...newMeeting, agenda: e.target.value })}
                rows={3}
                placeholder="Meeting agenda and topics..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
            
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Scheduling...' : 'Schedule Meeting'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {meetings.map((meeting) => (
          <div key={meeting.id} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{meeting.title}</h3>
                <p className="text-sm text-gray-500">{meeting.meeting_type} Meeting</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                new Date(meeting.scheduled_date) > new Date() 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {new Date(meeting.scheduled_date) > new Date() ? 'Upcoming' : 'Past'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Date & Time:</span>
                <p className="font-medium">
                  {new Date(meeting.scheduled_date).toLocaleDateString()} at {' '}
                  {new Date(meeting.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Duration:</span>
                <p className="font-medium">{meeting.duration_minutes} minutes</p>
              </div>
              <div>
                <span className="text-gray-500">Location:</span>
                <p className="font-medium">{meeting.location || 'TBD'}</p>
              </div>
            </div>
            
            {meeting.description && (
              <div className="mt-4">
                <span className="text-gray-500 text-sm">Description:</span>
                <p className="text-sm mt-1">{meeting.description}</p>
              </div>
            )}
            
            {meeting.agenda && (
              <div className="mt-4">
                <span className="text-gray-500 text-sm">Agenda:</span>
                <p className="text-sm mt-1 whitespace-pre-line">{meeting.agenda}</p>
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
              <span className="text-sm text-gray-500">
                Attendees: {meeting.attendees?.length || 0} invited
              </span>
              <div className="flex space-x-2">
                <button className="text-pink-600 hover:text-pink-800 text-sm">
                  Edit
                </button>
                <button className="text-gray-600 hover:text-gray-800 text-sm">
                  Manage Attendees
                </button>
                <button className="text-red-600 hover:text-red-800 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FinancialDashboardContent = ({ donations }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Financial Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Donations</p>
              <p className="text-3xl font-bold text-gray-900">
                ${donations?.total_amount?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💝</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Donors</p>
              <p className="text-3xl font-bold text-gray-900">{donations?.total_count || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Average Donation</p>
              <p className="text-3xl font-bold text-gray-900">
                ${Math.round(donations?.average_donation || 0).toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Recent (30 days)</p>
              <p className="text-3xl font-bold text-gray-900">
                ${donations?.recent_amount?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📈</span>
            </div>
          </div>
        </div>
      </div>
      
      {donations?.categories && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Donations by Category</h3>
          <div className="space-y-4">
            {Object.entries(donations.categories).map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between">
                <span className="text-gray-700">{category}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full"
                      style={{ 
                        width: `${(amount / donations.total_amount) * 100}%` 
                      }}
                    ></div>
                  </div>
                  <span className="font-medium text-gray-900">
                    ${amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SystemAnalyticsContent = ({ analytics }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">System Analytics</h2>
      
      {analytics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Users</span>
                  <span className="font-bold text-2xl text-purple-600">{analytics.users.total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Active Users</span>
                  <span className="font-bold text-lg text-green-600">{analytics.users.active}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">New (7 days)</span>
                  <span className="font-bold text-lg text-blue-600">{analytics.users.recent}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Inactive</span>
                  <span className="font-bold text-lg text-red-600">{analytics.users.inactive}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Group Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Groups</span>
                  <span className="font-bold text-2xl text-blue-600">{analytics.groups.total}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Recent Actions</span>
                  <span className="font-bold text-2xl text-teal-600">{analytics.activity.recent_actions}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">User Growth Chart</h3>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">Chart visualization would go here</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const SystemActivitiesContent = ({ activities, users }) => {
  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? user.full_name : 'Unknown User';
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'create_group': return '🫂';
      case 'bulk_activate': return '✅';
      case 'bulk_deactivate': return '❌';
      case 'reset_password': return '🔑';
      case 'group_membership_add': return '➕';
      case 'group_membership_remove': return '➖';
      default: return '📝';
    }
  };

  const getActionDescription = (activity) => {
    switch (activity.action) {
      case 'create_group':
        return `Created group "${activity.details?.group_name}"`;
      case 'bulk_activate':
        return 'Activated multiple user accounts';
      case 'bulk_deactivate':
        return 'Deactivated multiple user accounts';
      case 'reset_password':
        return `Reset password for ${activity.details?.target_user}`;
      case 'group_membership_add':
        return 'Added members to a group';
      case 'group_membership_remove':
        return 'Removed members from a group';
      default:
        return activity.action.replace('_', ' ');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">System Activities</h2>
      
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activities</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {activities.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No recent activities found
            </div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="px-6 py-4 flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <span className="text-2xl">{getActionIcon(activity.action)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      {getUserName(activity.user_id)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600">
                    {getActionDescription(activity)}
                  </p>
                  {activity.target_type && (
                    <p className="text-xs text-gray-400">
                      Target: {activity.target_type}
                      {activity.ip_address && ` • IP: ${activity.ip_address}`}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Dashboard Router Component
const Dashboard = () => {
  const { user } = useAuth();
  
  if (user?.role === 'super_admin') {
    return <SuperAdminDashboard />;
  }
  
  return <RegularDashboard />;
};

export default App;