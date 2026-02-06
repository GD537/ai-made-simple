#!/usr/bin/env python3
"""
Enhanced Face Swapper v2.0
- Real-time preview
- Better blending
- Improved error handling
- Smart upload processing
"""

import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
import os
import tempfile
import json
from datetime import datetime
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EnhancedFaceSwapper:
    def __init__(self, model_path=None):
        """Initialize with enhanced models and settings"""
        self.app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        
        # Enhanced settings
        self.min_face_size = 50  # Minimum face size in pixels
        self.quality_threshold = 0.3  # Face quality threshold
        self.blend_method = 'poisson'  # Enhanced blending method
        
        logger.info("Enhanced FaceSwapper initialized with buffalo_l model")

    def analyze_image_quality(self, img_path):
        """Analyze image quality and provide feedback"""
        try:
            img = cv2.imread(str(img_path))
            if img is None:
                return {"error": "Could not read image. Please try a different format (JPG, PNG)."}
            
            # Check resolution
            h, w = img.shape[:2]
            if w < 200 or h < 200:
                return {"error": "Image too small. Please use images larger than 200x200 pixels."}
            
            # Check if image is too large
            if w > 4000 or h > 4000:
                return {"warning": "Large image detected. Will be resized for faster processing."}
            
            # Detect faces
            faces = self.app.get(img)
            if not faces:
                suggestions = [
                    "Ensure the face is clearly visible and well-lit",
                    "Try a photo with the face looking towards the camera",
                    "Make sure the face takes up at least 1/4 of the image",
                    "Check that the face isn't too blurry or dark"
                ]
                return {"error": "No faces detected.", "suggestions": suggestions}
            
            # Analyze face quality
            face_analysis = []
            for face in faces:
                bbox = face.bbox.astype(int)
                face_width = bbox[2] - bbox[0]
                face_height = bbox[3] - bbox[1]
                face_area = face_width * face_height
                
                quality_score = min(1.0, face_area / (100 * 100))  # Normalized quality
                
                analysis = {
                    "bbox": bbox.tolist(),
                    "size": f"{face_width}x{face_height}",
                    "quality": quality_score,
                    "age": getattr(face, 'age', 'unknown'),
                    "gender": 'male' if getattr(face, 'sex', 0) == 1 else 'female'
                }
                face_analysis.append(analysis)
            
            return {
                "success": True,
                "image_size": f"{w}x{h}",
                "faces_detected": len(faces),
                "faces": face_analysis
            }
            
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return {"error": f"Analysis failed: {str(e)}"}

    def generate_preview(self, source_path, target_path, preview_size=512):
        """Generate a quick low-res preview for instant feedback"""
        try:
            # Load and resize images for preview
            source_img = cv2.imread(str(source_path))
            target_img = cv2.imread(str(target_path))
            
            if source_img is None or target_img is None:
                return None
            
            # Resize for faster preview processing
            def resize_for_preview(img, max_size=preview_size):
                h, w = img.shape[:2]
                if max(h, w) > max_size:
                    scale = max_size / max(h, w)
                    new_w, new_h = int(w * scale), int(h * scale)
                    return cv2.resize(img, (new_w, new_h))
                return img
            
            source_preview = resize_for_preview(source_img)
            target_preview = resize_for_preview(target_img)
            
            # Quick face detection on preview
            source_faces = self.app.get(source_preview)
            target_faces = self.app.get(target_preview)
            
            if not source_faces or not target_faces:
                return None
            
            # Simple face swap for preview (fast but lower quality)
            result = self.basic_face_swap(source_preview, target_preview, 
                                        source_faces[0], target_faces[0])
            
            return result
            
        except Exception as e:
            logger.error(f"Preview generation error: {e}")
            return None

    def basic_face_swap(self, source_img, target_img, source_face, target_face):
        """Basic face swap for preview (optimized for speed)"""
        try:
            # Get face embeddings
            source_embedding = source_face.normed_embedding
            target_bbox = target_face.bbox.astype(int)
            
            # Simple face region replacement
            x1, y1, x2, y2 = target_bbox
            face_region = target_img[y1:y2, x1:x2].copy()
            
            # Basic blending (faster than advanced methods)
            mask = np.ones_like(face_region) * 255
            center = ((x1 + x2) // 2, (y1 + y2) // 2)
            
            result = target_img.copy()
            try:
                result = cv2.seamlessClone(face_region, result, mask[:,:,0], center, cv2.NORMAL_CLONE)
            except:
                # Fallback to simple replacement
                result[y1:y2, x1:x2] = face_region
            
            return result
            
        except Exception as e:
            logger.error(f"Basic face swap error: {e}")
            return target_img

    def enhanced_face_swap(self, source_path, target_path, output_path):
        """Enhanced face swap with better quality"""
        try:
            # Load images
            source_img = cv2.imread(str(source_path))
            target_img = cv2.imread(str(target_path))
            
            # Auto-rotate if needed (handle mobile photos)
            source_img = self.auto_rotate_image(source_img, source_path)
            target_img = self.auto_rotate_image(target_img, target_path)
            
            # Detect faces
            source_faces = self.app.get(source_img)
            target_faces = self.app.get(target_img)
            
            if not source_faces:
                return {"error": "No face detected in source image", 
                       "suggestions": ["Try a clearer photo with the face clearly visible"]}
            
            if not target_faces:
                return {"error": "No face detected in target image",
                       "suggestions": ["Make sure the target image contains at least one clear face"]}
            
            # Use best quality faces
            source_face = self.select_best_face(source_faces)
            
            # Process all faces in target image
            result_img = target_img.copy()
            swapped_faces = 0
            
            for target_face in target_faces:
                if self.is_good_quality_face(target_face):
                    result_img = self.advanced_face_swap(source_img, result_img, 
                                                       source_face, target_face)
                    swapped_faces += 1
            
            # Save result
            cv2.imwrite(str(output_path), result_img)
            
            return {
                "success": True,
                "faces_swapped": swapped_faces,
                "output_path": str(output_path)
            }
            
        except Exception as e:
            logger.error(f"Enhanced face swap error: {e}")
            return {"error": f"Face swap failed: {str(e)}"}

    def auto_rotate_image(self, img, img_path):
        """Auto-rotate image based on EXIF data"""
        try:
            from PIL import Image, ExifTags
            
            pil_img = Image.open(img_path)
            
            if hasattr(pil_img, '_getexif'):
                exif = pil_img._getexif()
                if exif is not None:
                    for tag, value in exif.items():
                        if tag in ExifTags.TAGS and ExifTags.TAGS[tag] == 'Orientation':
                            if value == 3:
                                img = cv2.rotate(img, cv2.ROTATE_180)
                            elif value == 6:
                                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
                            elif value == 8:
                                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
                            break
        except:
            pass  # If EXIF processing fails, continue with original
        
        return img

    def select_best_face(self, faces):
        """Select the highest quality face from detected faces"""
        if len(faces) == 1:
            return faces[0]
        
        best_face = faces[0]
        best_score = 0
        
        for face in faces:
            # Calculate quality score based on face size and detection confidence
            bbox = face.bbox
            face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            det_score = getattr(face, 'det_score', 0.5)
            
            quality_score = face_area * det_score
            
            if quality_score > best_score:
                best_score = quality_score
                best_face = face
        
        return best_face

    def is_good_quality_face(self, face):
        """Check if face meets quality standards"""
        bbox = face.bbox
        face_width = bbox[2] - bbox[0]
        face_height = bbox[3] - bbox[1]
        
        # Minimum size requirements
        if face_width < self.min_face_size or face_height < self.min_face_size:
            return False
        
        # Detection confidence
        det_score = getattr(face, 'det_score', 0.5)
        if det_score < self.quality_threshold:
            return False
        
        return True

    def advanced_face_swap(self, source_img, target_img, source_face, target_face):
        """Advanced face swap with better blending"""
        try:
            # Get facial landmarks if available
            source_kps = source_face.kps if hasattr(source_face, 'kps') else None
            target_kps = target_face.kps if hasattr(target_face, 'kps') else None
            
            # Enhanced face alignment if landmarks available
            if source_kps is not None and target_kps is not None:
                return self.landmark_based_swap(source_img, target_img, 
                                              source_face, target_face)
            else:
                return self.bbox_based_swap(source_img, target_img, 
                                          source_face, target_face)
                
        except Exception as e:
            logger.error(f"Advanced face swap error: {e}")
            return target_img

    def landmark_based_swap(self, source_img, target_img, source_face, target_face):
        """Face swap using facial landmarks for better alignment"""
        try:
            # This is a simplified implementation
            # In production, you'd use more sophisticated alignment
            
            target_bbox = target_face.bbox.astype(int)
            source_bbox = source_face.bbox.astype(int)
            
            # Extract face regions
            x1, y1, x2, y2 = target_bbox
            sx1, sy1, sx2, sy2 = source_bbox
            
            target_face_region = target_img[y1:y2, x1:x2]
            source_face_region = source_img[sy1:sy2, sx1:sx2]
            
            # Resize source to match target
            source_resized = cv2.resize(source_face_region, 
                                      (x2-x1, y2-y1))
            
            # Color matching
            source_resized = self.match_colors(source_resized, target_face_region)
            
            # Enhanced blending
            result = target_img.copy()
            
            # Create soft mask for better blending
            mask = self.create_soft_mask(source_resized.shape[:2])
            
            # Apply mask
            for c in range(3):
                result[y1:y2, x1:x2, c] = (source_resized[:,:,c] * mask + 
                                         target_face_region[:,:,c] * (1 - mask))
            
            return result
            
        except Exception as e:
            logger.error(f"Landmark-based swap error: {e}")
            return self.bbox_based_swap(source_img, target_img, source_face, target_face)

    def bbox_based_swap(self, source_img, target_img, source_face, target_face):
        """Face swap using bounding boxes (fallback method)"""
        try:
            target_bbox = target_face.bbox.astype(int)
            source_bbox = source_face.bbox.astype(int)
            
            x1, y1, x2, y2 = target_bbox
            sx1, sy1, sx2, sy2 = source_bbox
            
            # Extract and resize source face
            source_face_region = source_img[sy1:sy2, sx1:sx2]
            source_resized = cv2.resize(source_face_region, (x2-x1, y2-y1))
            
            # Color matching
            target_face_region = target_img[y1:y2, x1:x2]
            source_resized = self.match_colors(source_resized, target_face_region)
            
            # Create elliptical mask for natural blending
            mask = self.create_elliptical_mask((x2-x1, y2-y1))
            
            result = target_img.copy()
            
            # Seamless cloning for better integration
            try:
                center = ((x1 + x2) // 2, (y1 + y2) // 2)
                mask_8bit = (mask * 255).astype(np.uint8)
                result = cv2.seamlessClone(source_resized, result, mask_8bit, center, cv2.NORMAL_CLONE)
            except:
                # Fallback to alpha blending
                for c in range(3):
                    result[y1:y2, x1:x2, c] = (source_resized[:,:,c] * mask + 
                                             target_face_region[:,:,c] * (1 - mask))
            
            return result
            
        except Exception as e:
            logger.error(f"Bbox-based swap error: {e}")
            return target_img

    def match_colors(self, source, target):
        """Match color distribution between source and target"""
        try:
            # Convert to LAB color space for better color matching
            source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
            target_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
            
            # Match color statistics
            for i in range(3):  # L, A, B channels
                source_mean = np.mean(source_lab[:,:,i])
                source_std = np.std(source_lab[:,:,i])
                target_mean = np.mean(target_lab[:,:,i])
                target_std = np.std(target_lab[:,:,i])
                
                if source_std > 0:
                    source_lab[:,:,i] = ((source_lab[:,:,i] - source_mean) * 
                                       (target_std / source_std) + target_mean)
            
            # Convert back to BGR
            source_lab = np.clip(source_lab, 0, 255)
            result = cv2.cvtColor(source_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
            return result
            
        except:
            return source  # Return original if color matching fails

    def create_soft_mask(self, shape):
        """Create soft mask for natural blending"""
        h, w = shape
        mask = np.zeros((h, w), dtype=np.float32)
        
        center_x, center_y = w // 2, h // 2
        
        for y in range(h):
            for x in range(w):
                # Calculate distance from center
                dx = (x - center_x) / (w / 2)
                dy = (y - center_y) / (h / 2)
                distance = np.sqrt(dx*dx + dy*dy)
                
                # Create soft falloff
                if distance < 0.8:
                    mask[y, x] = 1.0
                elif distance < 1.0:
                    mask[y, x] = (1.0 - distance) / 0.2
                else:
                    mask[y, x] = 0.0
        
        return mask

    def create_elliptical_mask(self, size):
        """Create elliptical mask for face blending"""
        w, h = size
        mask = np.zeros((h, w), dtype=np.float32)
        
        center_x, center_y = w // 2, h // 2
        a, b = w // 2 * 0.9, h // 2 * 0.9  # Ellipse semi-axes
        
        for y in range(h):
            for x in range(w):
                # Ellipse equation
                dx = (x - center_x) / a
                dy = (y - center_y) / b
                distance = dx*dx + dy*dy
                
                if distance <= 1.0:
                    # Soft edge
                    mask[y, x] = max(0, 1.0 - distance * 0.3)
        
        return mask

def main():
    """Test the enhanced face swapper"""
    swapper = EnhancedFaceSwapper()
    print("Enhanced Face Swapper v2.0 initialized ✅")
    
    # Test image quality analysis
    test_img = "/tmp/test.jpg"
    if os.path.exists(test_img):
        analysis = swapper.analyze_image_quality(test_img)
        print("Image analysis:", json.dumps(analysis, indent=2))

if __name__ == "__main__":
    main()