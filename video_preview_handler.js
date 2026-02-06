/**
 * Video Preview Handler for AI Made Simple v2.1
 * Adds video file support with frame extraction for previews
 */

class VideoPreviewHandler {
    constructor() {
        this.supportedFormats = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
        this.maxVideoSize = 100 * 1024 * 1024; // 100MB limit
        this.previewDuration = 5; // Seconds to analyze
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Check if file is a supported video format
     */
    isVideoFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        return this.supportedFormats.includes(extension) || 
               file.type.startsWith('video/');
    }

    /**
     * Validate video file before processing
     */
    validateVideo(file) {
        if (!this.isVideoFile(file)) {
            return {
                valid: false,
                error: "Unsupported video format. Please use MP4, MOV, AVI, WebM, or MKV files.",
                suggestions: [
                    "Convert your video to MP4 format for best compatibility",
                    "Ensure the video contains clear faces for detection"
                ]
            };
        }

        if (file.size > this.maxVideoSize) {
            return {
                valid: false,
                error: "Video file too large. Please use videos smaller than 100MB.",
                suggestions: [
                    "Compress your video or trim to a shorter duration",
                    "For best results, use videos under 30 seconds"
                ]
            };
        }

        return {
            valid: true,
            message: "Video file accepted. Processing will extract frames for face detection."
        };
    }

    /**
     * Extract preview frame from video
     */
    async extractPreviewFrame(file, timeOffset = 1.0) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => {
                // Set time to extract frame from
                const extractTime = Math.min(timeOffset, video.duration / 2);
                video.currentTime = extractTime;
            };

            video.onseeked = () => {
                try {
                    // Draw video frame to canvas
                    this.canvas.width = video.videoWidth;
                    this.canvas.height = video.videoHeight;
                    
                    this.ctx.drawImage(video, 0, 0);
                    
                    // Convert to image data
                    const frameData = this.canvas.toDataURL('image/jpeg', 0.8);
                    
                    // Clean up
                    URL.revokeObjectURL(video.src);
                    
                    resolve({
                        success: true,
                        frameData: frameData,
                        dimensions: {
                            width: video.videoWidth,
                            height: video.videoHeight
                        },
                        duration: video.duration,
                        extractedAt: extractTime
                    });
                    
                } catch (error) {
                    reject({
                        success: false,
                        error: "Failed to extract video frame: " + error.message,
                        suggestions: [
                            "Try a different video format",
                            "Ensure the video isn't corrupted"
                        ]
                    });
                }
            };

            video.onerror = () => {
                reject({
                    success: false,
                    error: "Could not load video file",
                    suggestions: [
                        "Check if the video file is corrupted",
                        "Try converting to MP4 format",
                        "Ensure the video codec is supported"
                    ]
                });
            };

            // Load the video
            video.src = URL.createObjectURL(file);
        });
    }

    /**
     * Extract multiple frames for face detection analysis
     */
    async extractMultipleFrames(file, frameCount = 3) {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        
        return new Promise((resolve, reject) => {
            video.onloadedmetadata = async () => {
                try {
                    const duration = video.duration;
                    const frames = [];
                    
                    // Extract frames at different time points
                    for (let i = 0; i < frameCount; i++) {
                        const timeOffset = (duration * (i + 1)) / (frameCount + 1);
                        
                        video.currentTime = timeOffset;
                        await this.waitForSeeked(video);
                        
                        // Capture frame
                        this.canvas.width = video.videoWidth;
                        this.canvas.height = video.videoHeight;
                        this.ctx.drawImage(video, 0, 0);
                        
                        frames.push({
                            timeOffset: timeOffset,
                            frameData: this.canvas.toDataURL('image/jpeg', 0.8),
                            timestamp: `${Math.floor(timeOffset)}s`
                        });
                    }
                    
                    URL.revokeObjectURL(video.src);
                    
                    resolve({
                        success: true,
                        frames: frames,
                        videoInfo: {
                            duration: duration,
                            width: video.videoWidth,
                            height: video.videoHeight
                        }
                    });
                    
                } catch (error) {
                    reject({
                        success: false,
                        error: "Failed to extract video frames: " + error.message
                    });
                }
            };

            video.onerror = () => {
                reject({
                    success: false,
                    error: "Could not load video for frame extraction"
                });
            };

            video.src = URL.createObjectURL(file);
        });
    }

    /**
     * Wait for video seek to complete
     */
    waitForSeeked(video) {
        return new Promise((resolve) => {
            video.onseeked = () => resolve();
        });
    }

    /**
     * Create video preview interface
     */
    createVideoPreview(container, file, frameData, videoInfo) {
        const previewDiv = document.createElement('div');
        previewDiv.className = 'video-preview';
        previewDiv.innerHTML = `
            <div class="video-preview-header">
                <h4>🎬 Video Preview</h4>
                <div class="video-info">
                    <span>📏 ${videoInfo.dimensions.width}×${videoInfo.dimensions.height}</span>
                    <span>⏱️ ${this.formatDuration(videoInfo.duration)}</span>
                    <span>📄 ${(file.size / 1024 / 1024).toFixed(1)}MB</span>
                </div>
            </div>
            <div class="video-frame-preview">
                <img src="${frameData}" alt="Video Frame Preview" class="frame-preview-image">
                <div class="video-overlay">
                    <span>📽️ Frame at ${videoInfo.extractedAt.toFixed(1)}s</span>
                </div>
            </div>
            <div class="video-actions">
                <button class="btn-video-analyze">🔍 Analyze for Faces</button>
                <button class="btn-video-extract">📸 Extract More Frames</button>
            </div>
        `;

        // Add styles
        this.addVideoPreviewStyles();

        // Add event listeners
        const analyzeBtn = previewDiv.querySelector('.btn-video-analyze');
        const extractBtn = previewDiv.querySelector('.btn-video-extract');

        analyzeBtn.onclick = () => this.analyzeVideoFaces(file, frameData);
        extractBtn.onclick = () => this.showFrameSelector(file);

        container.appendChild(previewDiv);
        return previewDiv;
    }

    /**
     * Add CSS styles for video preview
     */
    addVideoPreviewStyles() {
        if (document.getElementById('video-preview-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'video-preview-styles';
        styles.textContent = `
            .video-preview {
                border: 1px solid rgba(124, 58, 237, 0.5);
                border-radius: 12px;
                padding: 1rem;
                margin: 1rem 0;
                background: rgba(124, 58, 237, 0.1);
            }

            .video-preview-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
            }

            .video-preview-header h4 {
                margin: 0;
                color: #a855f7;
            }

            .video-info {
                display: flex;
                gap: 1rem;
                font-size: 0.8rem;
                opacity: 0.8;
            }

            .video-frame-preview {
                position: relative;
                text-align: center;
                margin: 1rem 0;
            }

            .frame-preview-image {
                max-width: 100%;
                max-height: 200px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }

            .video-overlay {
                position: absolute;
                bottom: 8px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 0.25rem 0.75rem;
                border-radius: 12px;
                font-size: 0.8rem;
            }

            .video-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.5rem;
                margin-top: 1rem;
            }

            .btn-video-analyze, .btn-video-extract {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 8px;
                background: rgba(124, 58, 237, 0.3);
                color: #a855f7;
                border: 1px solid rgba(124, 58, 237, 0.5);
                cursor: pointer;
                font-size: 0.9rem;
                transition: all 0.3s ease;
            }

            .btn-video-analyze:hover, .btn-video-extract:hover {
                background: rgba(124, 58, 237, 0.5);
            }

            @media (max-width: 768px) {
                .video-info {
                    flex-direction: column;
                    gap: 0.25rem;
                }
                
                .video-actions {
                    grid-template-columns: 1fr;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Format video duration for display
     */
    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Analyze video frame for faces
     */
    async analyzeVideoFaces(file, frameData) {
        // Convert frameData to blob for analysis
        const response = await fetch(frameData);
        const blob = await response.blob();
        
        // Create a temporary file object for analysis
        const frameFile = new File([blob], 'video_frame.jpg', { type: 'image/jpeg' });
        
        // Use existing face analysis function
        if (window.faceSwapper && window.faceSwapper.analyze_image_quality) {
            const analysis = await window.faceSwapper.analyze_image_quality(frameFile);
            this.showVideoAnalysisResults(analysis);
        } else {
            alert('Face analysis not available. Please ensure the face swapping engine is loaded.');
        }
    }

    /**
     * Show frame selector for multiple frame extraction
     */
    async showFrameSelector(file) {
        try {
            const result = await this.extractMultipleFrames(file, 5);
            
            if (result.success) {
                this.showFrameSelectorModal(result.frames, file);
            } else {
                alert('Failed to extract frames: ' + result.error);
            }
            
        } catch (error) {
            alert('Frame extraction failed: ' + error.message);
        }
    }

    /**
     * Show modal with multiple frames to choose from
     */
    showFrameSelectorModal(frames, file) {
        const modal = document.createElement('div');
        modal.className = 'frame-selector-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🎬 Select Best Frame</h3>
                    <button class="modal-close">×</button>
                </div>
                <div class="frame-grid">
                    ${frames.map((frame, index) => `
                        <div class="frame-option" data-index="${index}">
                            <img src="${frame.frameData}" alt="Frame ${index + 1}">
                            <div class="frame-label">${frame.timestamp}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-footer">
                    <button class="btn-use-selected">Use Selected Frame</button>
                    <button class="btn-modal-cancel">Cancel</button>
                </div>
            </div>
        `;

        // Add modal styles
        this.addModalStyles();

        // Add event listeners
        modal.querySelector('.modal-close').onclick = () => modal.remove();
        modal.querySelector('.btn-modal-cancel').onclick = () => modal.remove();
        
        let selectedFrame = 0;
        modal.querySelectorAll('.frame-option').forEach((option, index) => {
            option.onclick = () => {
                modal.querySelectorAll('.frame-option').forEach(opt => 
                    opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedFrame = index;
            };
        });

        modal.querySelector('.btn-use-selected').onclick = () => {
            this.useSelectedFrame(frames[selectedFrame], file);
            modal.remove();
        };

        // Select first frame by default
        modal.querySelector('.frame-option').classList.add('selected');

        document.body.appendChild(modal);
    }

    /**
     * Add modal styles
     */
    addModalStyles() {
        if (document.getElementById('frame-selector-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'frame-selector-styles';
        styles.textContent = `
            .frame-selector-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            }

            .modal-content {
                background: linear-gradient(135deg, #1a1a2e, #16213e);
                border: 1px solid rgba(0, 212, 255, 0.3);
                border-radius: 16px;
                padding: 2rem;
                max-width: 80vw;
                max-height: 80vh;
                overflow: auto;
                color: #e4e4e7;
            }

            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1.5rem;
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: #e4e4e7;
                cursor: pointer;
            }

            .frame-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 1rem;
                margin-bottom: 1.5rem;
            }

            .frame-option {
                border: 2px solid transparent;
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
            }

            .frame-option:hover {
                border-color: rgba(0, 212, 255, 0.5);
            }

            .frame-option.selected {
                border-color: #00d4ff;
                box-shadow: 0 0 12px rgba(0, 212, 255, 0.5);
            }

            .frame-option img {
                width: 100%;
                height: auto;
                display: block;
            }

            .frame-label {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 0.25rem;
                text-align: center;
                font-size: 0.8rem;
            }

            .modal-footer {
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
            }

            .btn-use-selected, .btn-modal-cancel {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.3s ease;
            }

            .btn-use-selected {
                background: linear-gradient(135deg, #7c3aed, #a855f7);
                color: white;
            }

            .btn-modal-cancel {
                background: rgba(239, 68, 68, 0.3);
                color: #ef4444;
                border: 1px solid rgba(239, 68, 68, 0.5);
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Use selected frame for face swapping
     */
    useSelectedFrame(frame, originalFile) {
        // Convert frame data back to file
        fetch(frame.frameData)
            .then(response => response.blob())
            .then(blob => {
                const frameFile = new File([blob], `${originalFile.name}_frame_${frame.timestamp}.jpg`, {
                    type: 'image/jpeg'
                });

                // Trigger the upload process with the selected frame
                if (window.faceSwapper && window.faceSwapper.processFile) {
                    window.faceSwapper.processFile(frameFile, 'target');
                }
                
                // Show success message
                this.showFrameSelectedMessage(frame.timestamp);
            })
            .catch(error => {
                alert('Failed to process selected frame: ' + error.message);
            });
    }

    /**
     * Show frame selection confirmation
     */
    showFrameSelectedMessage(timestamp) {
        const message = document.createElement('div');
        message.className = 'frame-selected-message';
        message.innerHTML = `
            <div class="message-content">
                ✅ Frame at ${timestamp} selected for face swapping
            </div>
        `;

        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(34, 197, 94, 0.9);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            z-index: 10001;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(message);

        // Remove after 3 seconds
        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    /**
     * Show video analysis results
     */
    showVideoAnalysisResults(analysis) {
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'video-analysis-results';
        
        if (analysis.success) {
            resultsDiv.innerHTML = `
                <h4>🎬 Video Frame Analysis</h4>
                <div class="analysis-success">
                    ✅ ${analysis.faces_detected} face(s) detected<br>
                    📏 Frame size: ${analysis.image_size}<br>
                    💡 Ready for face swapping
                </div>
            `;
        } else {
            resultsDiv.innerHTML = `
                <h4>🎬 Video Frame Analysis</h4>
                <div class="analysis-error">
                    ❌ ${analysis.error}<br>
                    ${analysis.suggestions ? analysis.suggestions.map(s => `💡 ${s}`).join('<br>') : ''}
                </div>
            `;
        }

        // Show as temporary popup
        this.showTemporaryPopup(resultsDiv);
    }

    /**
     * Show temporary popup
     */
    showTemporaryPopup(content) {
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(26, 26, 46, 0.95);
            border: 1px solid rgba(0, 212, 255, 0.5);
            border-radius: 12px;
            padding: 1.5rem;
            color: white;
            z-index: 10001;
            max-width: 400px;
        `;

        popup.appendChild(content);

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 12px;
            background: none;
            border: none;
            color: white;
            font-size: 1.2rem;
            cursor: pointer;
        `;
        closeBtn.onclick = () => popup.remove();
        popup.appendChild(closeBtn);

        document.body.appendChild(popup);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (popup.parentNode) popup.remove();
        }, 5000);
    }
}

// Export for use in main application
window.VideoPreviewHandler = VideoPreviewHandler;

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.videoPreviewHandler = new VideoPreviewHandler();
    });
} else {
    window.videoPreviewHandler = new VideoPreviewHandler();
}