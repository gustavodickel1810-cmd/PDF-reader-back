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
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'] 
}));

require('./keepAlive');

// Parse JSON request bodies.
app.use(express.json());

// Define a rate limiter to protect the API.
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
        formData.append('lang', voiceName); // Use voiceName directly - it matches TTSMP3 API
        formData.append('source', 'ttsmp3');

        console.log(`Generating TTS for voice: ${voiceName}, text length: ${text.length}`);

        // Make the request to the TTSMP3 API.
        const response = await fetch('https://ttsmp3.com/makemp3.php', {
            method: 'POST',
            body: formData,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`TTSMP3 API responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('TTSMP3 API Response:', data);

        if (data.Error === 0 && data.URL) {
            // Forward the URL of the generated audio file back to the client.
            res.json({ 
                audioUrl: data.URL,
                speaker: data.Speaker || voiceName,
                cached: data.Cached || 0
            });
        } else {
            console.error('TTSMP3 API Error:', data);
            throw new Error(`TTSMP3 API failed to generate audio. Error: ${data.Error || 'Unknown error'}`);
        }

    } catch (error) {
        console.error('TTS proxy error:', error);
        res.status(500).json({ 
            error: 'Failed to generate audio via proxy.', 
            details: error.message,
            voiceName: voiceName
        });
    }
});

// Audio download proxy endpoint - downloads audio files to bypass CORS
app.post('/api/download-audio', apiLimiter, async (req, res) => {
    const { audioUrl } = req.body;

    if (!audioUrl) {
        return res.status(400).json({ error: 'audioUrl is required.' });
    }

    try {
        console.log(`Downloading audio from: ${audioUrl}`);
        
        // Fetch the audio file
        const response = await fetch(audioUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
        }

        // Get headers from the source response
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        const contentLength = response.headers.get('content-length');
        const contentDisposition = response.headers.get('content-disposition') || `inline; filename="audio.mp3"`;

        // Set appropriate headers for streaming
        res.set({
            'Content-Type': contentType,
            ...(contentLength && {'Content-Length': contentLength}),
            'Content-Disposition': contentDisposition,
            'Cache-Control': 'public, max-age=3600', 
        });

        // Pipe the source response stream directly to the client response stream
        response.body.pipe(res);

        // Handle streaming errors
        response.body.on('error', (err) => {
            console.error('TTSMP3 stream error:', err);
            res.end(); 
        });

    } catch (error) {
        console.error('Audio download proxy error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to download audio via proxy.', 
                details: error.message,
                url: audioUrl
            });
        }
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
        ],
        supportedVoices: {
            english: ['Joanna', 'Matthew', 'Amy', 'Brian', 'Nicole', 'Russell'],
            portuguese: ['Ricardo', 'Camila', 'Vitoria', 'Cristiano', 'Ines']
        }
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
    console.log(`🔍 Test the API at http://localhost:${port}/api/health`);
    console.log(`🎵 TTS endpoint: POST http://localhost:${port}/api/tts`);
    console.log(`⬇️ Audio download proxy: POST http://localhost:${port}/api/download-audio`);
});