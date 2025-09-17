import requests
import sys
import json
from datetime import datetime

class ChurchYouthAppTester:
    def __init__(self, base_url="https://ecclesia-hub.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.member_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_task_id = None
        self.created_group_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.json()}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_register_admin(self):
        """Test admin user registration"""
        admin_data = {
            "email": f"admin_{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "AdminPass123!",
            "full_name": "Test Admin",
            "phone": "+1234567890",
            "role": "super_admin"
        }
        
        success, response = self.run_test(
            "Admin Registration",
            "POST",
            "auth/register",
            200,
            data=admin_data
        )
        
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            print(f"   Admin registered: {admin_data['email']}")
            return True, admin_data['email']
        return False, None

    def test_register_member(self):
        """Test member user registration"""
        member_data = {
            "email": f"member_{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "MemberPass123!",
            "full_name": "Test Member",
            "phone": "+1234567891",
            "role": "member"
        }
        
        success, response = self.run_test(
            "Member Registration",
            "POST",
            "auth/register",
            200,
            data=member_data
        )
        
        if success and 'access_token' in response:
            self.member_token = response['access_token']
            print(f"   Member registered: {member_data['email']}")
            return True, member_data['email']
        return False, None

    def test_login(self, email, password, expected_role):
        """Test user login"""
        success, response = self.run_test(
            f"Login as {expected_role}",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        
        if success and response.get('user', {}).get('role') == expected_role:
            print(f"   Logged in as {expected_role}: {email}")
            return True, response['access_token']
        return False, None

    def test_get_current_user(self, token, expected_role):
        """Test getting current user info"""
        success, response = self.run_test(
            f"Get Current User ({expected_role})",
            "GET",
            "auth/me",
            200,
            token=token
        )
        
        if success and response.get('role') == expected_role:
            print(f"   Current user role: {response.get('role')}")
            return True
        return False

    def test_create_task(self):
        """Test task creation (admin only)"""
        task_data = {
            "title": "Test Task - Bible Study Preparation",
            "description": "Prepare materials for next week's Bible study session",
            "points_reward": 25,
            "coins_reward": 10,
            "priority": "high"
        }
        
        success, response = self.run_test(
            "Create Task (Admin)",
            "POST",
            "tasks",
            200,
            data=task_data,
            token=self.admin_token
        )
        
        if success and 'id' in response:
            self.created_task_id = response['id']
            print(f"   Task created with ID: {self.created_task_id}")
            return True
        return False

    def test_create_task_as_member(self):
        """Test task creation as member (should fail)"""
        task_data = {
            "title": "Unauthorized Task",
            "description": "This should fail",
            "points_reward": 10,
            "coins_reward": 5,
            "priority": "low"
        }
        
        success, response = self.run_test(
            "Create Task (Member - Should Fail)",
            "POST",
            "tasks",
            403,
            data=task_data,
            token=self.member_token
        )
        
        return success

    def test_get_tasks(self, token, role):
        """Test getting tasks"""
        success, response = self.run_test(
            f"Get Tasks ({role})",
            "GET",
            "tasks",
            200,
            token=token
        )
        
        if success:
            print(f"   Found {len(response)} tasks")
            return True
        return False

    def test_update_task_status(self):
        """Test updating task status"""
        if not self.created_task_id:
            print("❌ No task ID available for status update test")
            return False
            
        success, response = self.run_test(
            "Update Task Status to In Progress",
            "PUT",
            f"tasks/{self.created_task_id}/status",
            200,
            data={"status": "in_progress"},
            token=self.admin_token
        )
        
        return success

    def test_complete_and_approve_task(self):
        """Test completing and approving a task"""
        if not self.created_task_id:
            print("❌ No task ID available for completion test")
            return False
            
        # Complete the task
        success1, _ = self.run_test(
            "Complete Task",
            "PUT",
            f"tasks/{self.created_task_id}/status",
            200,
            data={"status": "completed"},
            token=self.admin_token
        )
        
        if not success1:
            return False
            
        # Approve the task
        success2, _ = self.run_test(
            "Approve Task and Distribute Rewards",
            "PUT",
            f"tasks/{self.created_task_id}/approve",
            200,
            token=self.admin_token
        )
        
        return success2

    def test_create_group(self):
        """Test group creation (admin only)"""
        group_data = {
            "name": "Youth Ministry Team",
            "description": "Main youth ministry coordination group",
            "group_type": "Ministry"
        }
        
        success, response = self.run_test(
            "Create Group (Admin)",
            "POST",
            "groups",
            200,
            data=group_data,
            token=self.admin_token
        )
        
        if success and 'id' in response:
            self.created_group_id = response['id']
            print(f"   Group created with ID: {self.created_group_id}")
            return True
        return False

    def test_create_group_as_member(self):
        """Test group creation as member (should fail)"""
        group_data = {
            "name": "Unauthorized Group",
            "description": "This should fail",
            "group_type": "Ministry"
        }
        
        success, response = self.run_test(
            "Create Group (Member - Should Fail)",
            "POST",
            "groups",
            403,
            data=group_data,
            token=self.member_token
        )
        
        return success

    def test_get_groups(self, token, role):
        """Test getting groups"""
        success, response = self.run_test(
            f"Get Groups ({role})",
            "GET",
            "groups",
            200,
            token=token
        )
        
        if success:
            print(f"   Found {len(response)} groups")
            return True
        return False

    def test_send_message(self):
        """Test sending a message to group"""
        if not self.created_group_id:
            print("❌ No group ID available for message test")
            return False
            
        message_data = {
            "content": "Hello everyone! This is a test message for our youth group.",
            "group_id": self.created_group_id
        }
        
        success, response = self.run_test(
            "Send Group Message",
            "POST",
            "messages",
            200,
            data=message_data,
            token=self.admin_token
        )
        
        return success

    def test_get_group_messages(self):
        """Test getting group messages"""
        if not self.created_group_id:
            print("❌ No group ID available for messages test")
            return False
            
        success, response = self.run_test(
            "Get Group Messages",
            "GET",
            f"messages/group/{self.created_group_id}",
            200,
            token=self.admin_token
        )
        
        if success:
            print(f"   Found {len(response)} messages")
            return True
        return False

    def test_get_leaderboard(self, token, role):
        """Test getting leaderboard"""
        success, response = self.run_test(
            f"Get Leaderboard ({role})",
            "GET",
            "leaderboard",
            200,
            token=token
        )
        
        if success:
            print(f"   Leaderboard has {len(response)} entries")
            return True
        return False

    def test_get_user_stats(self, token, role):
        """Test getting user statistics"""
        success, response = self.run_test(
            f"Get User Stats ({role})",
            "GET",
            "stats/user",
            200,
            token=token
        )
        
        if success:
            stats = response
            print(f"   Stats - Total tasks: {stats.get('total_tasks', 0)}, Completed: {stats.get('completed_tasks', 0)}")
            print(f"   Points: {stats.get('points', 0)}, Coins: {stats.get('coins', 0)}")
            return True
        return False

def main():
    print("🚀 Starting Glory of Elshaddai Christian Center Connect API Tests")
    print("=" * 70)
    
    tester = ChurchYouthAppTester()
    
    # Test user registration and authentication
    print("\n📝 AUTHENTICATION TESTS")
    print("-" * 30)
    
    admin_success, admin_email = tester.test_register_admin()
    if not admin_success:
        print("❌ Admin registration failed, stopping tests")
        return 1
    
    member_success, member_email = tester.test_register_member()
    if not member_success:
        print("❌ Member registration failed, stopping tests")
        return 1
    
    # Test login functionality
    admin_login_success, admin_token = tester.test_login(admin_email, "AdminPass123!", "super_admin")
    if admin_login_success:
        tester.admin_token = admin_token
    
    member_login_success, member_token = tester.test_login(member_email, "MemberPass123!", "member")
    if member_login_success:
        tester.member_token = member_token
    
    # Test current user endpoints
    tester.test_get_current_user(tester.admin_token, "super_admin")
    tester.test_get_current_user(tester.member_token, "member")
    
    # Test task management
    print("\n📋 TASK MANAGEMENT TESTS")
    print("-" * 30)
    
    tester.test_create_task()
    tester.test_create_task_as_member()  # Should fail
    tester.test_get_tasks(tester.admin_token, "admin")
    tester.test_get_tasks(tester.member_token, "member")
    tester.test_update_task_status()
    tester.test_complete_and_approve_task()
    
    # Test group management
    print("\n👥 GROUP MANAGEMENT TESTS")
    print("-" * 30)
    
    tester.test_create_group()
    tester.test_create_group_as_member()  # Should fail
    tester.test_get_groups(tester.admin_token, "admin")
    tester.test_get_groups(tester.member_token, "member")
    
    # Test chat system
    print("\n💬 CHAT SYSTEM TESTS")
    print("-" * 30)
    
    tester.test_send_message()
    tester.test_get_group_messages()
    
    # Test leaderboard and stats
    print("\n🏆 LEADERBOARD & STATS TESTS")
    print("-" * 30)
    
    tester.test_get_leaderboard(tester.admin_token, "admin")
    tester.test_get_leaderboard(tester.member_token, "member")
    tester.test_get_user_stats(tester.admin_token, "admin")
    tester.test_get_user_stats(tester.member_token, "member")
    
    # Print final results
    print("\n" + "=" * 70)
    print(f"📊 FINAL RESULTS: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed! Backend API is working correctly.")
        return 0
    else:
        failed_tests = tester.tests_run - tester.tests_passed
        print(f"⚠️  {failed_tests} test(s) failed. Please check the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())