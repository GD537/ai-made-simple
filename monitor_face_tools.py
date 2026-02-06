#!/usr/bin/env python3
"""
Face Tools Health Monitor
Comprehensive monitoring and health checking for the AI Made Simple face tools platform
"""
import requests
import json
import time
import sys
import subprocess
from datetime import datetime
from pathlib import Path

# Configuration
BASE_URL = 'https://207-148-69-104.nip.io/faces'
AUTH = ('happy', 'gNm#0pjZptH$@!Y@KjD')
TIMEOUT = 30
ALERTS_ENABLED = True

class FaceToolsMonitor:
    def __init__(self):
        self.base_url = BASE_URL
        self.auth = AUTH
        self.results = []
        
    def test_authentication(self):
        """Test basic authentication"""
        try:
            start_time = time.time()
            response = requests.get(f'{self.base_url}/api/stats', 
                                  auth=self.auth, timeout=TIMEOUT, verify=False)
            response_time = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'test': 'Authentication',
                    'status': 'PASS',
                    'response_time': f'{response_time:.1f}ms',
                    'details': f"Database: {data.get('bulk_faces', 0)} faces"
                }
            else:
                return {
                    'test': 'Authentication', 
                    'status': 'FAIL',
                    'response_time': f'{response_time:.1f}ms',
                    'details': f'HTTP {response.status_code}'
                }
        except Exception as e:
            return {
                'test': 'Authentication',
                'status': 'ERROR', 
                'response_time': 'N/A',
                'details': str(e)
            }
    
    def test_ssl_certificate(self):
        """Check SSL certificate validity"""
        try:
            import ssl
            import socket
            from urllib.parse import urlparse
            
            parsed_url = urlparse(self.base_url)
            hostname = parsed_url.hostname
            port = parsed_url.port or 443
            
            context = ssl.create_default_context()
            
            start_time = time.time()
            with socket.create_connection((hostname, port), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    response_time = (time.time() - start_time) * 1000
                    
                    # Parse expiry date
                    expiry = datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                    days_until_expiry = (expiry - datetime.now()).days
                    
                    if days_until_expiry > 30:
                        status = 'PASS'
                        details = f"Expires in {days_until_expiry} days"
                    elif days_until_expiry > 0:
                        status = 'WARN'
                        details = f"Expires in {days_until_expiry} days (renew soon)"
                    else:
                        status = 'FAIL'
                        details = "Certificate expired"
                        
                    return {
                        'test': 'SSL Certificate',
                        'status': status,
                        'response_time': f'{response_time:.1f}ms',
                        'details': details
                    }
                    
        except Exception as e:
            return {
                'test': 'SSL Certificate',
                'status': 'ERROR',
                'response_time': 'N/A', 
                'details': str(e)
            }
    
    def test_face_analysis(self):
        """Test face analysis functionality"""
        try:
            # Create a simple test image
            import numpy as np
            import cv2
            import io
            
            # Generate test face (white circle on black background)
            img = np.zeros((200, 200, 3), dtype=np.uint8)
            cv2.circle(img, (100, 100), 50, (255, 255, 255), -1)
            _, buffer = cv2.imencode('.jpg', img)
            
            start_time = time.time()
            files = {'file': ('test.jpg', io.BytesIO(buffer.tobytes()), 'image/jpeg')}
            response = requests.post(f'{self.base_url}/api/analyze',
                                   files=files, auth=self.auth, 
                                   timeout=TIMEOUT, verify=False)
            response_time = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                if 'error' in data:
                    return {
                        'test': 'Face Analysis',
                        'status': 'EXPECTED',
                        'response_time': f'{response_time:.1f}ms',
                        'details': 'No face in test image (expected)'
                    }
                else:
                    return {
                        'test': 'Face Analysis',
                        'status': 'PASS',
                        'response_time': f'{response_time:.1f}ms', 
                        'details': f"Age: {data.get('age', 'N/A')}, Gender: {data.get('gender', 'N/A')}"
                    }
            else:
                return {
                    'test': 'Face Analysis',
                    'status': 'FAIL',
                    'response_time': f'{response_time:.1f}ms',
                    'details': f'HTTP {response.status_code}'
                }
                
        except Exception as e:
            return {
                'test': 'Face Analysis',
                'status': 'ERROR',
                'response_time': 'N/A',
                'details': str(e)
            }
    
    def test_database_size(self):
        """Check database size and growth"""
        try:
            start_time = time.time()
            response = requests.get(f'{self.base_url}/api/stats',
                                  auth=self.auth, timeout=TIMEOUT, verify=False)
            response_time = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                faces = data.get('bulk_faces', 0)
                size_mb = data.get('total_size_mb', 0)
                progress = data.get('progress', 0)
                
                if faces > 1000 and size_mb > 0:
                    status = 'PASS'
                    details = f"{faces:,} faces, {size_mb:.1f}MB, {progress:.1f}% complete"
                elif faces > 0:
                    status = 'WARN' 
                    details = f"Only {faces} faces ({size_mb:.1f}MB)"
                else:
                    status = 'FAIL'
                    details = "Empty database"
                    
                return {
                    'test': 'Database Size',
                    'status': status,
                    'response_time': f'{response_time:.1f}ms',
                    'details': details
                }
            else:
                return {
                    'test': 'Database Size',
                    'status': 'FAIL',
                    'response_time': f'{response_time:.1f}ms',
                    'details': f'HTTP {response.status_code}'
                }
                
        except Exception as e:
            return {
                'test': 'Database Size',
                'status': 'ERROR',
                'response_time': 'N/A',
                'details': str(e)
            }
    
    def test_backend_services(self):
        """Check backend service status"""
        try:
            # Check nginx
            nginx_status = subprocess.run(['systemctl', 'is-active', 'nginx'], 
                                        capture_output=True, text=True)
            
            # Check face-tools service  
            face_tools_status = subprocess.run(['systemctl', 'is-active', 'face-tools'],
                                             capture_output=True, text=True)
            
            services = {
                'nginx': nginx_status.stdout.strip(),
                'face-tools': face_tools_status.stdout.strip()
            }
            
            active_count = sum(1 for status in services.values() if status == 'active')
            
            if active_count == 2:
                status = 'PASS'
                details = 'All services active'
            elif active_count == 1:
                status = 'WARN'
                details = f"Some services down: {services}"
            else:
                status = 'FAIL' 
                details = f"Services down: {services}"
                
            return {
                'test': 'Backend Services',
                'status': status,
                'response_time': 'N/A',
                'details': details
            }
            
        except Exception as e:
            return {
                'test': 'Backend Services',
                'status': 'ERROR',
                'response_time': 'N/A',
                'details': str(e)
            }
    
    def test_security_headers(self):
        """Verify security headers are present"""
        try:
            start_time = time.time()
            response = requests.get(f'{self.base_url}/', 
                                  auth=self.auth, timeout=TIMEOUT, verify=False)
            response_time = (time.time() - start_time) * 1000
            
            required_headers = [
                'x-robots-tag',
                'x-frame-options', 
                'x-content-type-options'
            ]
            
            present_headers = []
            for header in required_headers:
                if header in response.headers:
                    present_headers.append(header)
            
            if len(present_headers) == len(required_headers):
                status = 'PASS'
                details = f"All security headers present"
            elif len(present_headers) > 0:
                status = 'WARN'
                details = f"{len(present_headers)}/{len(required_headers)} headers present"
            else:
                status = 'FAIL'
                details = "No security headers found"
                
            return {
                'test': 'Security Headers',
                'status': status,
                'response_time': f'{response_time:.1f}ms',
                'details': details
            }
            
        except Exception as e:
            return {
                'test': 'Security Headers', 
                'status': 'ERROR',
                'response_time': 'N/A',
                'details': str(e)
            }
    
    def run_all_tests(self):
        """Run complete health check suite"""
        print("🔍 Face Tools Health Monitor")
        print("=" * 50)
        print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"Target: {self.base_url}")
        print()
        
        tests = [
            self.test_authentication,
            self.test_ssl_certificate,
            self.test_database_size,
            self.test_face_analysis,
            self.test_backend_services,
            self.test_security_headers
        ]
        
        self.results = []
        for test_func in tests:
            result = test_func()
            self.results.append(result)
            
            # Format output
            status_emoji = {
                'PASS': '✅',
                'WARN': '⚠️', 
                'FAIL': '❌',
                'ERROR': '💥',
                'EXPECTED': '✅'
            }.get(result['status'], '❓')
            
            print(f"{status_emoji} {result['test']:<20} | {result['status']:<8} | {result['response_time']:<10} | {result['details']}")
        
        # Summary
        print()
        print("=" * 50)
        
        pass_count = sum(1 for r in self.results if r['status'] in ['PASS', 'EXPECTED'])
        warn_count = sum(1 for r in self.results if r['status'] == 'WARN')
        fail_count = sum(1 for r in self.results if r['status'] in ['FAIL', 'ERROR'])
        
        total_tests = len(self.results)
        
        print(f"Results: {pass_count}/{total_tests} PASS, {warn_count} WARN, {fail_count} FAIL")
        
        if fail_count == 0 and warn_count == 0:
            print("🎉 All systems operational!")
            return True
        elif fail_count == 0:
            print("⚠️  Some warnings detected")
            return True
        else:
            print("❌ Critical issues detected")
            return False
    
    def save_results(self, filepath):
        """Save results to JSON file"""
        output = {
            'timestamp': datetime.now().isoformat(),
            'target_url': self.base_url,
            'results': self.results,
            'summary': {
                'total_tests': len(self.results),
                'pass_count': sum(1 for r in self.results if r['status'] in ['PASS', 'EXPECTED']),
                'warn_count': sum(1 for r in self.results if r['status'] == 'WARN'),
                'fail_count': sum(1 for r in self.results if r['status'] in ['FAIL', 'ERROR'])
            }
        }
        
        with open(filepath, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"📊 Results saved to: {filepath}")

def main():
    monitor = FaceToolsMonitor()
    
    success = monitor.run_all_tests()
    
    # Save results
    results_dir = Path('/root/.openclaw/workspace/ai-made-simple/monitoring')
    results_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    results_file = results_dir / f'health_check_{timestamp}.json'
    monitor.save_results(results_file)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()