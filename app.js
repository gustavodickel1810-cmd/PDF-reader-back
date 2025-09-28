
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const port = process.env.PORT || 3000;

// Apply CORS middleware to allow requests from any origin.
app.use(cors({
    origin: ['http://localhost:3000', 'https://pdf-reader-front.onrender.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Added PUT/DELETE for robustness
    allowedHeaders: ['Content-Type', 'Authorization'],
    // NEW: Expose headers that the client needs to read from the response,
    // especially Content-Disposition for file downloads.
    exposedHeaders: ['Content-Disposition'] 
}));

require('./keepAlive');

// Parse JSON request bodies.
app.use(express.json());

// Define a rate limiter to protect the API.
// This limits each IP address to 200 requests per 15 minutes (increased for preloading).
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // max 200 requests per IP (increased for audio preloading)
    message: "Too many requests from this IP, please try again after 15 minutes."
});

// A simple API endpoint to demonstrate functionality.
app.get('/api/data', apiLimiter, (req, res) => {
    res.json({
        message: "Enhanced API with audio download proxy is running!",
        timestamp: new Date().toISOString()
    });
});

// TTS API endpoint - generates audio URLs
app.post('/api/tts', apiLimiter, async (req, res) => {
    const { text, voiceName } = req.body;

    if (!text || !voiceName) {
        return res.status(400).json({ error: 'Text and voiceName are required.' });
    }

    try {
        const formData = new FormData();
        formData.append('msg', text);
        formData.append('lang', voiceName);
        formData.append('source', 'ttsmp3');

        // Make the request to the TTSMP3 API.
        const response = await fetch('https://ttsmp3.com/makemp3.php', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`TTSMP3 API responded with status: ${response.status}`);
        }

        const data = await response.json();

        if (data.Error === 0 && data.URL) {
            // Forward the URL of the generated audio file back to the client.
            res.json({ audioUrl: data.URL });
        } else {
            throw new Error('TTSMP3 API failed to generate audio.');
        }

    } catch (error) {
        console.error('TTS proxy error:', error);
        res.status(500).json({ error: 'Failed to generate audio via proxy.', details: error.message });
    }
});

// NEW: Audio download proxy endpoint - downloads audio files to bypass CORS
app.post('/api/download-audio', apiLimiter, async (req, res) => {
    const { audioUrl } = req.body;

    if (!audioUrl) {
        return res.status(400).json({ error: 'audioUrl is required.' });
    }

    try {
        console.log(`Downloading audio from: ${audioUrl}`);
        
        // Download the audio file
        const response = await fetch(audioUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        const audioBuffer = await response.buffer();

        // Set appropriate headers for audio response
        res.set({
            'Content-Type': contentType,
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });

        // Send the audio buffer as response
        res.send(audioBuffer);

    } catch (error) {
        console.error('Audio download proxy error:', error);
        res.status(500).json({ 
            error: 'Failed to download audio via proxy.', 
            details: error.message,
            url: audioUrl
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /api/data - Test endpoint',
            'POST /api/tts - Generate TTS audio URL',
            'POST /api/download-audio - Download audio file (CORS proxy)',
            'GET /api/health - Health check'
        ]
    });
});

// A basic root route that is not rate-limited.
app.get('/', (req, res) => {
    res.send(`
        <h1>Enhanced PDF Reader Backend</h1>
        <p>Server is running successfully!</p>
        <h2>Available Endpoints:</h2>
        <ul>
            <li><strong>POST /api/tts</strong> - Generate TTS audio URLs</li>
            <li><strong>POST /api/download-audio</strong> - Download audio files (CORS proxy)</li>
            <li><strong>GET /api/health</strong> - Health check</li>
        </ul>
        <p><a href="/api/health">Check API Health</a></p>
    `);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// Start the server.
app.listen(port, () => {
    console.log(`🚀 Enhanced PDF Reader Backend is running on http://localhost:${port}`);
    console.log(`📝 Test the API at http://localhost:${port}/api/health`);
    console.log(`🎵 TTS endpoint: POST http://localhost:${port}/api/tts`);
    console.log(`⬇️  Audio download proxy: POST http://localhost:${port}/api/download-audio`);
});