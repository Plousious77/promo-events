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