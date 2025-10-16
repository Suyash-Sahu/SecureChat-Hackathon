import { promises as fs } from 'fs';
import { extname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as Jimp from 'jimp';

const execPromise = promisify(exec);

let JimpInstance = Jimp;
if (!Jimp.read && (Jimp.Jimp || Jimp.default)) {
    JimpInstance = Jimp.Jimp || Jimp.default;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Convert binary string to ASCII message
function binaryToMessage(binaryData) {
    let message = '';
    for (let i = 0; i < binaryData.length; i += 8) {
        const byte = binaryData.slice(i, i + 8);
        if (byte.length < 8) break;
        
        const charCode = parseInt(byte, 2);
        // Only add printable characters or stop at null terminator
        if (charCode === 0) break;
        if (charCode >= 32 && charCode <= 126) {
            message += String.fromCharCode(charCode);
        } else {
            // If we encounter non-printable characters, it might be random data
            // But we'll continue to see if there's a pattern
            message += String.fromCharCode(charCode);
        }
        
        // Limit message length for performance
        if (message.length > 2048) break;
    }
    return message;
}

// ============================================
// AUDIO DETECTION FUNCTIONS
// ============================================

// Decode hidden message from audio using MSB steganography
async function decodeTextFromAudioMSB(filePath, numChars = 256) {
    try {
        const buffer = await fs.readFile(filePath);
        
        // Skip WAV header (typically 44 bytes)
        const headerSize = 44;
        if (buffer.length <= headerSize) {
            return '';
        }
        
        const audioData = buffer.slice(headerSize);
        let bits = "";
        
        // Extract the MSB from each byte
        for (let i = 0; i < Math.min(audioData.length, numChars * 8 * 8); i++) {
            const byte = audioData[i];
            bits += ((byte & 0b10000000) >> 7).toString(); // get MSB
        }

        // Convert bits to characters
        let decodedText = "";
        for (let i = 0; i < Math.min(bits.length, numChars * 8); i += 8) {
            const byteChunk = bits.slice(i, i + 8);
            if (byteChunk.length === 8) {
                decodedText += String.fromCharCode(parseInt(byteChunk, 2));
            }
        }
        
        return decodedText;
    } catch (error) {
        console.error('Error decoding audio MSB:', error);
        return '';
    }
}

// Decode hidden message from audio using LSB steganography
async function decodeTextFromAudioLSB(filePath, numChars = 256) {
    try {
        const buffer = await fs.readFile(filePath);
        
        // Skip WAV header (typically 44 bytes)
        const headerSize = 44;
        if (buffer.length <= headerSize) {
            return '';
        }
        
        const audioData = buffer.slice(headerSize);
        let bits = "";
        
        // Extract the LSB from each byte
        for (let i = 0; i < Math.min(audioData.length, numChars * 8 * 8); i++) {
            const byte = audioData[i];
            bits += (byte & 1).toString(); // get LSB
        }

        // Convert bits to characters
        let decodedText = "";
        for (let i = 0; i < Math.min(bits.length, numChars * 8); i += 8) {
            const byteChunk = bits.slice(i, i + 8);
            if (byteChunk.length === 8) {
                decodedText += String.fromCharCode(parseInt(byteChunk, 2));
            }
        }
        
        return decodedText;
    } catch (error) {
        console.error('Error decoding audio LSB:', error);
        return '';
    }
}

// Scan WAV audio file for steganography
async function scanWAVAudio(filePath) {
    try {
        // Check MSB first
        const msbMessage = await decodeTextFromAudioMSB(filePath);
        if (msbMessage.length > 5 && isSuspiciousMessage(msbMessage)) {
            console.log('Audio MSB detection: Suspicious message found:', msbMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'MSB steganography detected in audio file',
                code: 'AUDIO_MSB_BLOCKED'
            };
        }
        
        // Check LSB
        const lsbMessage = await decodeTextFromAudioLSB(filePath);
        if (lsbMessage.length > 5 && isSuspiciousMessage(lsbMessage)) {
            console.log('Audio LSB detection: Suspicious message found:', lsbMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'LSB steganography detected in audio file',
                code: 'AUDIO_LSB_BLOCKED'
            };
        }
        
        return { blocked: false };
    } catch (error) {
        console.error('Audio analysis error:', error);
        return { blocked: false }; // Allow file if analysis fails
    }
}

// ============================================
// VIDEO DETECTION FUNCTIONS
// ============================================

// Direct MP4 steganography detection without ffmpeg
async function scanMP4Video(filePath) {
    try {
        // Read the MP4 file
        const buffer = await fs.readFile(filePath);
        
        // Look for patterns in the raw MP4 data
        // This is a simplified approach that looks for hidden data directly in the MP4 file
        
        // Try to extract potential hidden data using MSB technique
        let msbBits = "";
        const sampleSize = Math.min(buffer.length, 50000); // Limit for performance
        
        for (let i = 0; i < sampleSize; i++) {
            const byte = buffer[i];
            msbBits += ((byte & 0b10000000) >> 7).toString(); // get MSB
        }
        
        // Convert MSB bits to characters
        let msbMessage = "";
        for (let i = 0; i < Math.min(msbBits.length, 2048); i += 8) {
            const byteChunk = msbBits.slice(i, i + 8);
            if (byteChunk.length === 8) {
                const charCode = parseInt(byteChunk, 2);
                if (charCode >= 32 && charCode <= 126) { // Only printable characters
                    msbMessage += String.fromCharCode(charCode);
                } else if (charCode === 0) { // Null terminator
                    break;
                } else {
                    msbMessage += String.fromCharCode(charCode); // Include non-printable for analysis
                }
            }
        }
        
        // Check if MSB message is suspicious
        if (msbMessage.length > 10 && isSuspiciousMessage(msbMessage)) {
            console.log('MP4 MSB detection: Suspicious message found:', msbMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'MSB steganography detected in MP4 file',
                code: 'MP4_MSB_BLOCKED'
            };
        }
        
        // Try to extract potential hidden data using LSB technique
        let lsbBits = "";
        for (let i = 0; i < sampleSize; i++) {
            const byte = buffer[i];
            lsbBits += (byte & 1).toString(); // get LSB
        }
        
        // Convert LSB bits to characters
        let lsbMessage = "";
        for (let i = 0; i < Math.min(lsbBits.length, 2048); i += 8) {
            const byteChunk = lsbBits.slice(i, i + 8);
            if (byteChunk.length === 8) {
                const charCode = parseInt(byteChunk, 2);
                if (charCode >= 32 && charCode <= 126) { // Only printable characters
                    lsbMessage += String.fromCharCode(charCode);
                } else if (charCode === 0) { // Null terminator
                    break;
                } else {
                    lsbMessage += String.fromCharCode(charCode); // Include non-printable for analysis
                }
            }
        }
        
        // Check if LSB message is suspicious
        if (lsbMessage.length > 10 && isSuspiciousMessage(lsbMessage)) {
            console.log('MP4 LSB detection: Suspicious message found:', lsbMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'LSB steganography detected in MP4 file',
                code: 'MP4_LSB_BLOCKED'
            };
        }
        
        return { blocked: false };
    } catch (error) {
        console.error('MP4 analysis error:', error);
        return { blocked: false }; // Allow file if analysis fails
    }
}

// ============================================
// IMAGE DETECTION FUNCTIONS
// ============================================

// Decode hidden message from image using LSB steganography
function decodeMessageFromImageLSB(imageData, maxBytes = 2048) {
    const bits = [];
    const limit = Math.min(imageData.length, maxBytes * 8 * 4); // Limit scanning
    
    for (let i = 0; i < limit; i += 4) {
        bits.push(imageData[i] & 1);     // R
        bits.push(imageData[i + 1] & 1); // G
        bits.push(imageData[i + 2] & 1); // B
    }

    const nBytes = Math.floor(bits.length / 8);
    let message = '';
    
    for (let b = 0; b < nBytes; b++) {
        let val = 0;
        for (let j = 0; j < 8; j++) {
            val |= (bits[b * 8 + j] & 1) << (7 - j);
        }
        
        // Accept all characters, not just printable ones, as hidden data might be binary
        if (val === 0) break; // Null terminator
        message += String.fromCharCode(val);
        if (message.length > 2048) break;
    }
    
    return message;
}

// Decode hidden message from image using MSB steganography
function decodeMessageFromImageMSB(imageData, width, height, maxPixels = 10000) {
    let binaryMessage = '';
    const pixelLimit = Math.min(width * height, maxPixels); // Limit for performance
    
    for (let i = 0; i < pixelLimit; i++) {
        const pixelIndex = i * 4; // RGBA format
        
        // Extract MSB from R, G, B channels
        for (let channel = 0; channel < 3; channel++) {
            const channelValue = imageData[pixelIndex + channel];
            binaryMessage += ((channelValue & 0x80) >> 7).toString();
            
            // Stop if we have enough data
            if (binaryMessage.length >= 2048 * 8) {
                return binaryToMessage(binaryMessage);
            }
        }
    }

    return binaryToMessage(binaryMessage);
}

// Improved detection logic
function isSuspiciousMessage(message) {
    if (!message || message.length === 0) return false;
    
    // Check for common patterns that indicate hidden data
    // 1. Long sequences of non-printable characters
    let nonPrintableCount = 0;
    for (let i = 0; i < Math.min(message.length, 100); i++) {
        const charCode = message.charCodeAt(i);
        if (charCode < 32 || charCode > 126) {
            nonPrintableCount++;
        }
    }
    
    // If more than 30% of characters are non-printable, it's suspicious
    if (message.length >= 10 && nonPrintableCount / Math.min(message.length, 100) > 0.3) {
        return true;
    }
    
    // 2. Repeated patterns that might indicate encoded data
    if (message.length > 20) {
        // Check for repeated byte patterns
        const substr = message.substring(0, 10);
        const occurrences = (message.match(new RegExp(substr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (occurrences > 3) {
            return true;
        }
    }
    
    // 3. High entropy (randomness) in short messages
    if (message.length > 5 && message.length < 50) {
        // Simple entropy check
        const charMap = {};
        for (let char of message) {
            charMap[char] = (charMap[char] || 0) + 1;
        }
        
        let entropy = 0;
        const len = message.length;
        for (let char in charMap) {
            const freq = charMap[char] / len;
            entropy -= freq * Math.log2(freq);
        }
        
        // High entropy suggests random/encoded data
        if (entropy > 4.0) {
            return true;
        }
    }
    
    return false;
}

// Scan PNG image for steganography
async function scanPNGImage(filePath) {
    try {
        const image = await JimpInstance.read(filePath);
        const data = image.bitmap.data;
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        
        // Quick size check - skip very small images
        if (width * height < 100) {
            return { blocked: false };
        }
        
        // Check LSB first (faster)
        const lsbMessage = decodeMessageFromImageLSB(data);
        if (lsbMessage.length > 5 && isSuspiciousMessage(lsbMessage)) { // Lower threshold for detection
            console.log('LSB detection: Suspicious message found:', lsbMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'LSB steganography detected',
                code: 'LSB_BLOCKED'
            };
        }
        
        // Check MSB (more expensive)
        const msbMessage = decodeMessageFromImageMSB(data, width, height);
        if (msbMessage.length > 5 && isSuspiciousMessage(msbMessage)) { // Lower threshold for detection
            console.log('MSB detection: Suspicious message found:', msbMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'MSB steganography detected',
                code: 'MSB_BLOCKED'
            };
        }
        
        return { blocked: false };
    } catch (error) {
        console.error('Image analysis error:', error);
        // If analysis fails, allow the file (don't block legitimate images)
        return { blocked: false };
    }
}

// ============================================
// PDF DETECTION FUNCTIONS
// ============================================

// Decode hidden message from PDF using delimiter method
function decodePDFDelimiterMessage(pdfBuffer) {
    // Try multiple possible delimiters
    const delimiters = [
        '\n%%HIDDEN_MESSAGE_START%%\n',
        '%%HIDDEN_MESSAGE_START%%',
        '/HiddenMessage',
        '<</HiddenMessage',
        '/Message',
        'HIDDEN_MESSAGE'
    ];
    
    for (const delim of delimiters) {
        const startDelim = Buffer.from(delim);
        const startIndex = pdfBuffer.indexOf(startDelim);
        
        if (startIndex !== -1) {
            // Try to find a reasonable end or extract a chunk
            const endIndex = pdfBuffer.indexOf(Buffer.from('%%EOF'), startIndex);
            const extractLength = endIndex !== -1 ? 
                Math.min(endIndex - startIndex, 1000) : 
                Math.min(1000, pdfBuffer.length - startIndex);
                
            if (extractLength > 10) {
                try {
                    const hiddenMessage = pdfBuffer.slice(startIndex, startIndex + extractLength);
                    return hiddenMessage.toString('utf-8');
                } catch (error) {
                    // Try with different encoding
                    try {
                        return pdfBuffer.slice(startIndex, startIndex + extractLength).toString('latin1');
                    } catch (e) {
                        continue;
                    }
                }
            }
        }
    }
    
    return null;
}

// Scan PDF for steganography
async function scanPDF(filePath) {
    try {
        const pdfBuffer = await fs.readFile(filePath);
        
        // Check for delimiter-based hidden messages
        const delimiterMessage = decodePDFDelimiterMessage(pdfBuffer);
        if (delimiterMessage && delimiterMessage.length > 10) {
            console.log('PDF detection: Suspicious content found:', delimiterMessage.substring(0, 50));
            return {
                blocked: true,
                reason: 'Hidden message found in PDF',
                code: 'PDF_BLOCKED'
            };
        }
        
        // Check for unusual patterns in PDF structure
        const pdfString = pdfBuffer.toString('latin1');
        
        // Look for suspiciously large streams or objects
        const streamRegex = /stream[\s\S]*?endstream/g;
        const streams = pdfString.match(streamRegex) || [];
        
        for (const stream of streams) {
            // If a stream is very large but has low entropy, it might contain hidden text
            if (stream.length > 1000) {
                // Simple entropy check
                const charMap = {};
                for (let char of stream) {
                    charMap[char] = (charMap[char] || 0) + 1;
                }
                
                let entropy = 0;
                const len = stream.length;
                for (let char in charMap) {
                    const freq = charMap[char] / len;
                    entropy -= freq * Math.log2(freq);
                }
                
                // Low entropy in large streams is suspicious
                if (entropy < 2.0) {
                    console.log('PDF detection: Low entropy stream found');
                    return {
                        blocked: true,
                        reason: 'Suspicious PDF stream detected',
                        code: 'PDF_STREAM_BLOCKED'
                    };
                }
            }
        }
        
        return { blocked: false };
    } catch (error) {
        console.error('PDF analysis error:', error);
        // If analysis fails, allow (assuming it's a valid PDF)
        return { blocked: false };
    }
}

// ============================================
// MAIN MIDDLEWARE
// ============================================

async function fileScanMiddleware(req, res, next) {
    try {
        // Step 1: Basic validation
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file uploaded', 
                details: 'The request did not contain a file' 
            });
        }

        const filePath = req.file.path;
        const fileExtension = extname(req.file.originalname || '').toLowerCase();
        const mimeType = req.file.mimetype;
        
        // Step 2: Quick file type check
        const isPNG = mimeType === 'image/png' || fileExtension === '.png';
        const isPDF = mimeType === 'application/pdf' || fileExtension === '.pdf';
        const isWAV = mimeType === 'audio/wav' || fileExtension === '.wav';
        const isMP4 = mimeType === 'video/mp4' || fileExtension === '.mp4';
        
        // If file is neither PNG, PDF, WAV, nor MP4, skip scanning
        if (!isPNG && !isPDF && !isWAV && !isMP4) {
            return next();
        }

        let scanResult;
        
        // Step 3: Route to appropriate scanner
        try {
            if (isPNG) {
                scanResult = await scanPNGImage(filePath);
            } else if (isPDF) {
                scanResult = await scanPDF(filePath);
            } else if (isWAV) {
                scanResult = await scanWAVAudio(filePath);
            } else if (isMP4) {
                scanResult = await scanMP4Video(filePath);
            }
            
            // Step 4: Handle scan results
            if (scanResult && scanResult.blocked) {
                // Delete the suspicious file
                try {
                    await fs.unlink(filePath);
                } catch (unlinkError) {
                    console.error('Failed to delete file:', unlinkError);
                }
                
                return res.status(400).json({
                    error: scanResult.reason || 'File blocked: suspected hidden data detected',
                    code: scanResult.code
                });
            }
            
            // File is clean, proceed
            return next();
            
        } catch (scanError) {
            console.error('File scanning error:', scanError);
            
            // Delete file on scan error for safety
            try {
                await fs.unlink(filePath);
            } catch (unlinkError) {
                console.error('Failed to delete file:', unlinkError);
            }
            
            return res.status(400).json({
                error: 'File could not be analyzed and was blocked for security',
                code: 'SCAN_FAILED'
            });
        }
        
    } catch (error) {
        console.error('Middleware error:', error);
        return next(error);
    }
}

export { fileScanMiddleware };