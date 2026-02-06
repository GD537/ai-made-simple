#!/usr/bin/env python3
"""
Face Tools Status Page Generator
Creates a real-time status dashboard showing system health, database stats, and performance metrics
"""
import json
import time
import subprocess
import requests
from datetime import datetime, timedelta
from pathlib import Path

class FaceToolsStatusMonitor:
    def __init__(self):
        self.base_url = 'https://207-148-69-104.nip.io/faces'
        self.auth = ('happy', 'gNm#0pjZptH$@!Y@KjD')
        self.status_file = Path('/root/.openclaw/workspace/ai-made-simple/status.json')
        
    def check_service_health(self):
        """Check if face-tools service is running"""
        try:
            result = subprocess.run(['systemctl', 'is-active', 'face-tools'], 
                                  capture_output=True, text=True)
            return result.stdout.strip() == 'active'
        except:
            return False
    
    def check_nginx_health(self):
        """Check if nginx is running"""
        try:
            result = subprocess.run(['systemctl', 'is-active', 'nginx'], 
                                  capture_output=True, text=True)
            return result.stdout.strip() == 'active'
        except:
            return False
    
    def check_database_stats(self):
        """Get database statistics"""
        try:
            response = requests.get(f'{self.base_url}/api/stats', 
                                  auth=self.auth, timeout=10, verify=False)
            if response.status_code == 200:
                return response.json()
            return None
        except:
            return None
    
    def check_api_response_time(self):
        """Measure API response time"""
        try:
            start_time = time.time()
            response = requests.get(f'{self.base_url}/api/stats', 
                                  auth=self.auth, timeout=10, verify=False)
            response_time = (time.time() - start_time) * 1000  # ms
            
            if response.status_code == 200:
                return response_time
            return None
        except:
            return None
    
    def check_ssl_certificate(self):
        """Check SSL certificate validity"""
        try:
            import ssl
            import socket
            from urllib.parse import urlparse
            
            parsed_url = urlparse(self.base_url)
            hostname = parsed_url.hostname
            port = parsed_url.port or 443
            
            context = ssl.create_default_context()
            with socket.create_connection((hostname, port), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    expiry = datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                    days_until_expiry = (expiry - datetime.now()).days
                    
                    return {
                        'valid': True,
                        'days_until_expiry': days_until_expiry,
                        'expires': expiry.isoformat()
                    }
        except:
            return {'valid': False, 'days_until_expiry': 0}
    
    def check_disk_usage(self):
        """Check disk usage for face database"""
        try:
            db_path = '/root/.openclaw/workspace/faceswap-tools/face_database/bulk'
            result = subprocess.run(['du', '-sh', db_path], capture_output=True, text=True)
            if result.returncode == 0:
                size_str = result.stdout.split()[0]
                return size_str
            return 'Unknown'
        except:
            return 'Unknown'
    
    def check_memory_usage(self):
        """Check memory usage of face-tools service"""
        try:
            result = subprocess.run(['ps', '-o', 'pid,rss,command', '-C', 'python3'], 
                                  capture_output=True, text=True)
            
            for line in result.stdout.split('\n'):
                if 'web_interface.py' in line or 'web_app.py' in line:
                    parts = line.split()
                    if len(parts) >= 2:
                        memory_kb = int(parts[1])
                        memory_mb = round(memory_kb / 1024, 1)
                        return memory_mb
            return 0
        except:
            return 0
    
    def run_health_check(self):
        """Run complete health check and return status"""
        print("🔍 Running comprehensive health check...")
        
        start_time = time.time()
        
        # Service checks
        face_tools_active = self.check_service_health()
        nginx_active = self.check_nginx_health()
        
        # API checks
        db_stats = self.check_database_stats()
        api_response_time = self.check_api_response_time()
        
        # Infrastructure checks
        ssl_status = self.check_ssl_certificate()
        disk_usage = self.check_disk_usage()
        memory_usage = self.check_memory_usage()
        
        # Calculate overall health
        checks_passed = sum([
            face_tools_active,
            nginx_active,
            db_stats is not None,
            api_response_time is not None,
            ssl_status['valid'] if ssl_status else False
        ])
        
        total_checks = 5
        health_percentage = (checks_passed / total_checks) * 100
        
        # Determine status
        if health_percentage >= 90:
            overall_status = 'OPERATIONAL'
            status_color = 'green'
        elif health_percentage >= 70:
            overall_status = 'DEGRADED'
            status_color = 'yellow'
        else:
            overall_status = 'OUTAGE'
            status_color = 'red'
        
        check_duration = round((time.time() - start_time) * 1000, 1)
        
        status_data = {
            'timestamp': datetime.now().isoformat(),
            'overall_status': overall_status,
            'status_color': status_color,
            'health_percentage': health_percentage,
            'check_duration_ms': check_duration,
            'services': {
                'face_tools': face_tools_active,
                'nginx': nginx_active
            },
            'api': {
                'accessible': db_stats is not None,
                'response_time_ms': api_response_time,
                'stats': db_stats
            },
            'infrastructure': {
                'ssl_valid': ssl_status['valid'] if ssl_status else False,
                'ssl_days_until_expiry': ssl_status.get('days_until_expiry', 0),
                'disk_usage': disk_usage,
                'memory_usage_mb': memory_usage
            }
        }
        
        return status_data
    
    def generate_status_page(self, status_data):
        """Generate HTML status page"""
        
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Face Tools - System Status</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f1419;
            color: #e6e6e6;
            line-height: 1.6;
        }}
        
        .container {{ max-width: 1200px; margin: 0 auto; padding: 2rem; }}
        
        header {{
            text-align: center;
            margin-bottom: 3rem;
        }}
        
        .logo {{
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
        }}
        
        .subtitle {{ color: #888; }}
        
        .status-banner {{
            background: {'#0d7377' if status_data['status_color'] == 'green' else '#d97706' if status_data['status_color'] == 'yellow' else '#dc2626'};
            padding: 1.5rem;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 2rem;
        }}
        
        .status-banner h2 {{
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }}
        
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }}
        
        .card {{
            background: #1a1f2e;
            border: 1px solid #2d3748;
            border-radius: 12px;
            padding: 1.5rem;
        }}
        
        .card h3 {{
            font-size: 1.2rem;
            margin-bottom: 1rem;
            color: #fff;
        }}
        
        .metric {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #2d3748;
        }}
        
        .metric:last-child {{ border-bottom: none; }}
        
        .metric-label {{ color: #a0a0a0; }}
        .metric-value {{ font-weight: 600; }}
        
        .status-indicator {{
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 0.5rem;
        }}
        
        .status-operational {{ background: #10b981; }}
        .status-degraded {{ background: #f59e0b; }}
        .status-outage {{ background: #ef4444; }}
        
        .last-updated {{
            text-align: center;
            color: #888;
            margin-top: 2rem;
            font-size: 0.9rem;
        }}
        
        .refresh-btn {{
            background: #0ea5e9;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-top: 1rem;
        }}
        
        .refresh-btn:hover {{ background: #0284c7; }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">🎭 Face Tools System Status</div>
            <div class="subtitle">Real-time monitoring dashboard</div>
        </header>
        
        <div class="status-banner">
            <h2>
                <span class="status-indicator status-{'operational' if status_data['status_color'] == 'green' else 'degraded' if status_data['status_color'] == 'yellow' else 'outage'}"></span>
                {status_data['overall_status']}
            </h2>
            <p>System Health: {status_data['health_percentage']:.1f}%</p>
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>🛠️ Services</h3>
                <div class="metric">
                    <span class="metric-label">Face Tools Service</span>
                    <span class="metric-value">
                        <span class="status-indicator status-{'operational' if status_data['services']['face_tools'] else 'outage'}"></span>
                        {'Running' if status_data['services']['face_tools'] else 'Down'}
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Nginx Web Server</span>
                    <span class="metric-value">
                        <span class="status-indicator status-{'operational' if status_data['services']['nginx'] else 'outage'}"></span>
                        {'Running' if status_data['services']['nginx'] else 'Down'}
                    </span>
                </div>
            </div>
            
            <div class="card">
                <h3>🌐 API Performance</h3>
                <div class="metric">
                    <span class="metric-label">API Accessibility</span>
                    <span class="metric-value">
                        <span class="status-indicator status-{'operational' if status_data['api']['accessible'] else 'outage'}"></span>
                        {'Accessible' if status_data['api']['accessible'] else 'Down'}
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Response Time</span>
                    <span class="metric-value">{status_data['api']['response_time_ms']:.1f}ms</span>
                </div>
            </div>
            
            <div class="card">
                <h3>💾 Database Stats</h3>
                <div class="metric">
                    <span class="metric-label">Total Faces</span>
                    <span class="metric-value">{status_data['api']['stats']['bulk_faces'] if status_data['api']['stats'] else 'N/A'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Database Size</span>
                    <span class="metric-value">{status_data['api']['stats']['total_size_mb'] if status_data['api']['stats'] else 'N/A'} MB</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Progress</span>
                    <span class="metric-value">{status_data['api']['stats']['progress'] if status_data['api']['stats'] else 'N/A'}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Disk Usage</span>
                    <span class="metric-value">{status_data['infrastructure']['disk_usage']}</span>
                </div>
            </div>
            
            <div class="card">
                <h3>🔒 Security & Infrastructure</h3>
                <div class="metric">
                    <span class="metric-label">SSL Certificate</span>
                    <span class="metric-value">
                        <span class="status-indicator status-{'operational' if status_data['infrastructure']['ssl_valid'] else 'outage'}"></span>
                        {'Valid' if status_data['infrastructure']['ssl_valid'] else 'Invalid'}
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Certificate Expiry</span>
                    <span class="metric-value">{status_data['infrastructure']['ssl_days_until_expiry']} days</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Memory Usage</span>
                    <span class="metric-value">{status_data['infrastructure']['memory_usage_mb']} MB</span>
                </div>
            </div>
        </div>
        
        <div class="last-updated">
            Last updated: {datetime.fromisoformat(status_data['timestamp']).strftime('%Y-%m-%d %H:%M:%S UTC')}<br>
            Check duration: {status_data['check_duration_ms']}ms
            <br>
            <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Status</button>
        </div>
    </div>
</body>
</html>
"""
        
        return html_content
    
    def save_status(self, status_data):
        """Save status data to JSON file"""
        with open(self.status_file, 'w') as f:
            json.dump(status_data, f, indent=2)
    
    def save_status_page(self, html_content):
        """Save HTML status page"""
        status_page_file = Path('/root/.openclaw/workspace/ai-made-simple/status.html')
        with open(status_page_file, 'w') as f:
            f.write(html_content)

def main():
    monitor = FaceToolsStatusMonitor()
    
    # Run health check
    status_data = monitor.run_health_check()
    
    # Generate status page
    html_content = monitor.generate_status_page(status_data)
    
    # Save results
    monitor.save_status(status_data)
    monitor.save_status_page(html_content)
    
    # Print summary
    print(f"✅ Status check complete!")
    print(f"Overall Status: {status_data['overall_status']}")
    print(f"Health: {status_data['health_percentage']:.1f}%")
    print(f"API Response Time: {status_data['api']['response_time_ms']:.1f}ms")
    print(f"Status page saved to: /root/.openclaw/workspace/ai-made-simple/status.html")

if __name__ == '__main__':
    main()