# AI Made Simple - API Reference

## 🔗 Base URL
```
https://207-148-69-104.nip.io/faces
```

## 🔐 Authentication
All API endpoints require HTTP Basic Authentication:
- **Username**: `happy`
- **Password**: `gNm#0pjZptH$@!Y@KjD`

### Example
```bash
curl -u 'happy:gNm#0pjZptH$@!Y@KjD' https://207-148-69-104.nip.io/faces/api/stats
```

## 📊 API Endpoints

### GET /api/stats
Get database statistics and status information.

**Response:**
```json
{
  "bulk_faces": 1524,
  "named_faces": 3,
  "total_size_mb": 818.5,
  "target": 1590,
  "progress": 95.8
}
```

**Fields:**
- `bulk_faces`: Number of AI-generated faces in database
- `named_faces`: Number of named/categorized faces  
- `total_size_mb`: Database size in megabytes
- `target`: Current target count for face collection
- `progress`: Percentage progress to target

### GET /api/faces
List faces with pagination support.

**Parameters:**
- `page` (optional): Page number (default: 1)
- `per_page` (optional): Items per page (default: 50, max: 100)

**Response:**
```json
{
  "faces": [
    {
      "name": "face_3d68a00824a8.jpg",
      "path": "/api/face/face_3d68a00824a8.jpg",
      "size": 524288
    }
  ],
  "total": 1524,
  "page": 1,
  "per_page": 50,
  "pages": 31
}
```

### GET /api/face/{filename}
Retrieve a specific face image.

**Parameters:**
- `filename`: Face image filename (e.g., "face_abc123.jpg")

**Response:** Binary image data (JPEG format)

**Example:**
```bash
curl -u 'happy:pass' https://207-148-69-104.nip.io/faces/api/face/face_3d68a00824a8.jpg -o downloaded_face.jpg
```

### POST /api/analyze
Analyze a face image for age, gender, and quality metrics.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Body**: `file` parameter with image data

**Response (Success):**
```json
{
  "age": 47,
  "gender": "Female",
  "detection_score": 0.858,
  "bbox": [123.5, 45.2, 389.1, 456.7],
  "faces_found": 1
}
```

**Response (Error):**
```json
{
  "error": "No face detected"
}
```

**Fields:**
- `age`: Estimated age (18-80 range)
- `gender`: "Male" or "Female"
- `detection_score`: Face quality score (0-1, higher = better)
- `bbox`: Bounding box coordinates [x1, y1, x2, y2]
- `faces_found`: Number of faces detected in image

**Example:**
```bash
curl -u 'happy:pass' https://207-148-69-104.nip.io/faces/api/analyze \
  -F 'file=@/path/to/image.jpg'
```

### POST /api/match
Compare two faces for similarity and determine if same person.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Body**: 
  - `face1`: First face image
  - `face2`: Second face image

**Response:**
```json
{
  "similarity": 0.126,
  "verdict": "DIFFERENT PEOPLE",
  "face1": {"age": 47, "gender": "F"},
  "face2": {"age": 46, "gender": "M"}
}
```

**Verdict Types:**
- `LIKELY SAME PERSON` (similarity > 0.6)
- `POSSIBLY SAME PERSON` (similarity 0.4-0.6)
- `DIFFERENT PEOPLE` (similarity < 0.4)

**Example:**
```bash
curl -u 'happy:pass' https://207-148-69-104.nip.io/faces/api/match \
  -F 'face1=@/path/to/image1.jpg' \
  -F 'face2=@/path/to/image2.jpg'
```

### POST /api/search
Search database for faces similar to uploaded query image.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Body**: 
  - `file`: Query face image
  - `threshold` (optional): Similarity threshold (default: 0.4)
  - `limit` (optional): Maximum results (default: 10, max: 50)

**Response:**
```json
{
  "query_info": {
    "age": 25,
    "gender": "M"
  },
  "matches": [
    {
      "name": "face_xyz789.jpg",
      "path": "/api/face/face_xyz789.jpg", 
      "similarity": 0.892
    }
  ],
  "total_matches": 15
}
```

**Example:**
```bash
curl -u 'happy:pass' https://207-148-69-104.nip.io/faces/api/search \
  -F 'file=@/path/to/query.jpg' \
  -F 'threshold=0.3' \
  -F 'limit=5'
```

### POST /api/add
Add a new face to the database.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Body**: `file` parameter with face image

**Response (Success):**
```json
{
  "success": true,
  "filename": "face_abc123def456.jpg",
  "path": "/api/face/face_abc123def456.jpg"
}
```

**Response (Duplicate):**
```json
{
  "error": "Face already exists",
  "filename": "face_abc123def456.jpg"
}
```

**Features:**
- Automatic MD5-based filename generation
- Duplicate detection and rejection
- Immediate availability after upload

**Example:**
```bash
curl -u 'happy:pass' https://207-148-69-104.nip.io/faces/api/add \
  -F 'file=@/path/to/newface.jpg'
```

## 🚨 Error Responses

All endpoints may return these error responses:

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 400 Bad Request
```json
{
  "error": "No file uploaded"
}
```

### 413 Request Entity Too Large
```json
{
  "error": "File too large (max 50MB)"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded"
}
```

### 500 Internal Server Error
```json
{
  "error": "Processing failed"
}
```

## 📝 Rate Limits

- **API Endpoints**: 10 requests per second
- **General Access**: 30 requests per second  
- **Connection Limit**: 20 concurrent connections
- **File Upload**: 50MB maximum size

## 🔧 Code Examples

### Python
```python
import requests
import json

# Configuration
BASE_URL = 'https://207-148-69-104.nip.io/faces'
AUTH = ('happy', 'gNm#0pjZptH$@!Y@KjD')

class FaceToolsAPI:
    def __init__(self):
        self.base_url = BASE_URL
        self.auth = AUTH
        
    def get_stats(self):
        """Get database statistics"""
        response = requests.get(f'{self.base_url}/api/stats', 
                              auth=self.auth, verify=False)
        return response.json()
        
    def analyze_face(self, image_path):
        """Analyze a face image"""
        with open(image_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(f'{self.base_url}/api/analyze',
                                   files=files, auth=self.auth, verify=False)
            return response.json()
            
    def match_faces(self, face1_path, face2_path):
        """Compare two faces"""
        with open(face1_path, 'rb') as f1, open(face2_path, 'rb') as f2:
            files = {'face1': f1, 'face2': f2}
            response = requests.post(f'{self.base_url}/api/match',
                                   files=files, auth=self.auth, verify=False)
            return response.json()
            
    def search_faces(self, query_path, threshold=0.4, limit=10):
        """Search for similar faces"""
        with open(query_path, 'rb') as f:
            files = {'file': f}
            data = {'threshold': threshold, 'limit': limit}
            response = requests.post(f'{self.base_url}/api/search',
                                   files=files, data=data, 
                                   auth=self.auth, verify=False)
            return response.json()

# Usage example
api = FaceToolsAPI()

# Get stats
stats = api.get_stats()
print(f"Database has {stats['bulk_faces']} faces")

# Analyze face
result = api.analyze_face('photo.jpg')
print(f"Age: {result['age']}, Gender: {result['gender']}")

# Compare faces
match = api.match_faces('face1.jpg', 'face2.jpg')
print(f"Similarity: {match['similarity']:.3f}")
```

### JavaScript
```javascript
class FaceToolsAPI {
    constructor() {
        this.baseUrl = 'https://207-148-69-104.nip.io/faces';
        this.auth = btoa('happy:gNm#0pjZptH$@!Y@KjD');
    }
    
    async getStats() {
        const response = await fetch(`${this.baseUrl}/api/stats`, {
            headers: {
                'Authorization': `Basic ${this.auth}`
            }
        });
        return response.json();
    }
    
    async analyzeFace(imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        
        const response = await fetch(`${this.baseUrl}/api/analyze`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${this.auth}`
            },
            body: formData
        });
        return response.json();
    }
    
    async searchFaces(imageFile, threshold = 0.4, limit = 10) {
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('threshold', threshold);
        formData.append('limit', limit);
        
        const response = await fetch(`${this.baseUrl}/api/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${this.auth}`
            },
            body: formData
        });
        return response.json();
    }
}

// Usage example
const api = new FaceToolsAPI();

// Get stats
api.getStats().then(stats => {
    console.log(`Database has ${stats.bulk_faces} faces`);
});

// Handle file upload
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const result = await api.analyzeFace(file);
        console.log(`Age: ${result.age}, Gender: ${result.gender}`);
    }
});
```

## 🔍 Response Formats

All successful responses return JSON with appropriate HTTP status codes:
- `200 OK`: Successful operation
- `201 Created`: Resource created (uploads)
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Authentication failed
- `413 Payload Too Large`: File too large
- `429 Too Many Requests`: Rate limited
- `500 Internal Server Error`: Processing error

Content-Type is always `application/json` for API responses and `image/jpeg` for image endpoints.

## 🔒 Security Notes

- All requests must use HTTPS
- Basic authentication is required for all endpoints
- Rate limiting is enforced per IP address
- File uploads are scanned and validated
- No external requests are made from uploaded content
- All processing is done server-side

---

**API Version**: 1.0  
**Last Updated**: February 6, 2026  
**Base URL**: https://207-148-69-104.nip.io/faces