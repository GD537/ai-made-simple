# 🔧 Face Tools - Troubleshooting Guide

**Last Updated**: February 6, 2026  
**Version**: 1.0  
**Support Level**: Self-Service

## 🚨 **LOGIN ISSUES**

### ❌ "I can't login" / Authentication Failed

**SOLUTION:**
- **URL**: https://207-148-69-104.nip.io/faces/
- **Username**: `happy` (lowercase)
- **Password**: `gNm#0pjZptH$@!Y@KjD` (exact case)

**Steps to fix:**
1. Clear browser cache and cookies
2. Try incognito/private browsing mode
3. Ensure you're using HTTPS (not HTTP)
4. Double-check password (contains special characters)
5. Try different browser (Chrome, Safari, Firefox)

**Common mistakes:**
- ❌ Wrong URL (make sure it ends with `/faces/`)
- ❌ Using HTTP instead of HTTPS
- ❌ Typos in password (contains #, $, @, !)
- ❌ Browser auto-filling wrong credentials

### ❌ "401 Unauthorized" Error

This is normal behavior when:
- No credentials provided → Enter username/password
- Wrong credentials → Double-check spelling
- Expired session → Refresh page and login again

## 🎭 **FACE SWAP ISSUES**

### ❌ "No face detected in source/target"

**Solutions:**
1. **Use clear, well-lit photos**
   - Face should be clearly visible
   - Avoid heavy shadows or backlighting
   - Front-facing photos work best

2. **Check image quality**
   - Minimum 200x200 pixels
   - JPEG or PNG format preferred
   - Not heavily compressed or pixelated

3. **Face visibility**
   - Face not covered by hands, hair, glasses
   - Both eyes and mouth should be visible
   - Avoid extreme angles or tilted heads

### ❌ "Face swap failed" or Processing Error

**Solutions:**
1. **Reduce file size**
   - Maximum 50MB per image
   - Try resizing large images
   - Use JPEG instead of PNG for smaller files

2. **Try different images**
   - Use different source/target combination
   - Ensure both images have clear faces
   - Avoid cartoon/drawn faces (use real photos)

3. **Wait and retry**
   - Processing can take 10-30 seconds
   - Don't click multiple times
   - Refresh page if stuck loading

### ❌ Poor Quality Results

**Current implementation:**
- Basic face replacement (demonstration quality)
- Not photorealistic blending
- Works for creative/fun purposes

**Tips for better results:**
- Use similar face angles (both front-facing)
- Similar lighting conditions
- Close age ranges work better
- Similar face sizes in images

## 📱 **MOBILE/BROWSER ISSUES**

### ❌ Interface doesn't load properly

**Solutions:**
1. **Update your browser**
   - Chrome: Version 90+
   - Safari: Version 14+
   - Firefox: Version 88+

2. **Check internet connection**
   - Stable WiFi/cellular required
   - Upload requires good upload speed

3. **Clear browser data**
   - Clear cache and cookies
   - Disable browser extensions
   - Try incognito/private mode

### ❌ Upload not working on mobile

**Solutions:**
1. **Enable camera permissions**
   - Allow site to access camera/photos
   - Check browser permissions settings

2. **File size limits**
   - Photos from phone cameras can be large
   - Try reducing quality in camera app

3. **Use drag & drop**
   - Works on most modern mobile browsers
   - Alternative to file picker

## 🔐 **SECURITY & PRIVACY**

### ❓ "Is my data safe?"

**YES - Maximum privacy protection:**
- ✅ HTTPS encryption for all data
- ✅ No external tracking or analytics
- ✅ Temporary files auto-deleted
- ✅ No search engine indexing
- ✅ No permanent storage of uploads
- ✅ Processing done locally on server

### ❓ "Who can see my uploads?"

**Only you:**
- Authentication required for all access
- Files processed and immediately deleted
- No logs of uploaded content
- No backup or archival system

## ⚡ **PERFORMANCE ISSUES**

### ❌ Slow processing/timeouts

**Normal processing times:**
- Face detection: 2-5 seconds
- Face swapping: 5-15 seconds
- Large images: 15-30 seconds

**If extremely slow:**
1. **Reduce image size**
   - Resize to 1024x1024 or smaller
   - Use JPEG compression

2. **Check server load**
   - Multiple users may slow processing
   - Try during off-peak hours

3. **Single uploads**
   - Don't upload multiple files simultaneously
   - Wait for one to complete before next

### ❌ "Address already in use" or Service Errors

**These are server-side issues:**
- Service will auto-restart within 60 seconds
- Temporary disruption during maintenance
- Try again after a few minutes

## 🛠️ **BROWSER-SPECIFIC ISSUES**

### Chrome/Chromium
- **Works best** - Full feature support
- Enable JavaScript and cookies
- Disable aggressive ad blockers

### Safari (iOS/macOS)  
- **Full support** - Touch interface optimized
- May require manual file selection on older versions
- Camera integration works on iOS 14+

### Firefox
- **Supported** - All features available
- May need to allow mixed content if any warnings

### Edge
- **Supported** - Modern Edge (Chromium-based)
- Legacy Edge not supported

### Mobile Browsers
- **Android Chrome**: Full support
- **iOS Safari**: Full support with touch
- **Samsung Browser**: Supported
- **Other mobile browsers**: May have limited features

## 📊 **ERROR CODES & MESSAGES**

| Error | Meaning | Solution |
|-------|---------|----------|
| 401 Unauthorized | No/wrong login | Check credentials |
| 404 Not Found | Wrong URL | Use correct URL with /faces/ |
| 413 Payload Too Large | File too big | Reduce image size (<50MB) |
| 429 Too Many Requests | Rate limited | Wait 1 minute, try again |
| 500 Internal Error | Server issue | Try again in a few minutes |
| "No face detected" | Face not found | Use clear face photo |
| "Processing failed" | Unknown error | Try different images |

## 🆘 **Emergency Reset**

If everything seems broken:

1. **Clear everything:**
   - Close all browser tabs
   - Clear browser cache/cookies
   - Restart browser

2. **Fresh start:**
   - Open new incognito/private window
   - Go to: https://207-148-69-104.nip.io/faces/
   - Login with: happy / gNm#0pjZptH$@!Y@KjD

3. **Test basic functionality:**
   - Try face analysis first (simpler)
   - Then try face swapping
   - Use small, clear test images

## 📞 **Getting Help**

### Before asking for help:
1. ✅ Try the solutions in this guide
2. ✅ Test with different browser
3. ✅ Test with different images
4. ✅ Wait 5 minutes and try again

### When reporting issues:
- 🔹 What browser and version
- 🔹 What you were trying to do
- 🔹 Exact error message
- 🔹 What device (phone, computer)
- 🔹 Screenshot if possible

### Self-service resources:
- **Setup Guide**: Complete installation instructions
- **API Reference**: Technical documentation
- **Security Report**: Privacy and security details

---

**Remember**: The face swapping feature is designed for creative and fun purposes. Results are demonstration-quality, not professional-grade photorealistic output.

**Privacy First**: Your uploads are never stored permanently and are processed with maximum privacy protection.