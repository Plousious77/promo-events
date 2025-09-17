#!/usr/bin/env python3
"""
Test script to verify video conferencing integration
"""
import os
import sys
sys.path.append('/app/backend')

def test_video_integration():
    """Test the video conferencing integration"""
    print("🧪 Testing Video Conferencing Integration...")
    
    # Test environment variables
    daily_api_key = os.environ.get("DAILY_API_KEY", "your-daily-api-key-here")
    daily_domain = os.environ.get("DAILY_DOMAIN", "your-domain.daily.co")
    
    print(f"📊 Daily API Key: {'✅ Set' if daily_api_key != 'your-daily-api-key-here' else '⚠️  Using default placeholder'}")
    print(f"📊 Daily Domain: {'✅ Set' if daily_domain != 'your-domain.daily.co' else '⚠️  Using default placeholder'}")
    
    # Test imports
    try:
        import httpx
        print("📦 httpx import: ✅ Success")
    except ImportError as e:
        print(f"📦 httpx import: ❌ Failed - {e}")
        return False
    
    # Test API endpoints availability
    import requests
    try:
        response = requests.get("http://localhost:8001/openapi.json", timeout=5)
        if response.status_code == 200:
            openapi_data = response.json()
            video_endpoints = [path for path in openapi_data['paths'].keys() if 'video' in path.lower()]
            print(f"🔗 Video endpoints registered: ✅ {len(video_endpoints)} endpoints")
            for endpoint in video_endpoints:
                print(f"   - {endpoint}")
        else:
            print(f"🔗 API check: ❌ Failed - Status {response.status_code}")
            return False
    except Exception as e:
        print(f"🔗 API check: ❌ Failed - {e}")
        return False
    
    print("\n✅ Video Conferencing Integration Test Complete!")
    print("\n📋 Next Steps:")
    print("1. Set DAILY_API_KEY environment variable with your Daily.co API key")
    print("2. Set DAILY_DOMAIN environment variable with your Daily.co domain")
    print("3. Test video room creation through the API endpoints")
    
    return True

if __name__ == "__main__":
    test_video_integration()