const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const port = 10099;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/sidecar/health', (req, res) => {
    res.json({ status: 'ok', engine: 'Osmium sidecar' });
});

const mapsDir = path.join(__dirname, 'maps');
if (!fs.existsSync(mapsDir)) {
    fs.mkdirSync(mapsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mapsDir);
    },
    filename: (req, file, cb) => {
        const sanitizedFilename = path.basename(file.originalname);
        cb(null, sanitizedFilename);
    }
});

const upload = multer({ storage: storage });

// POST /api/sidecar/upload: Alternative direct upload
app.post('/api/sidecar/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ message: 'File uploaded successfully', filename: req.file.filename });
});

// GET /api/sidecar/transform: Run Osmium transformation and stream logs
app.get('/api/sidecar/transform', (req, res) => {
    const fileName = req.query.file;
    if (!fileName) {
        return res.status(400).json({ error: 'No file specified' });
    }

    const inputPath = path.join(mapsDir, path.basename(fileName));
    const outputPath = path.join(__dirname, 'map-data.osm.pbf');

    if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ error: 'Input file not found' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendLog = (data) => {
        res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
    };

    const osmiumArgs = [
        'tags-filter', inputPath,
        'nwr/amenity=police,hospital,shelter,fire_station',
        'nwr/emergency=ambulance_station,assembly_point',
        'nwr/landuse=military', 'nwr/highway', 'nwr/railway',
        'nwr/maxspeed', 'nwr/maxheight', 'nwr/maxwidth', 'nwr/oneway',
        '-o', outputPath, '--overwrite'
    ];

    sendLog(`Running: osmium ${osmiumArgs.join(' ')}`);

    const osmium = spawn('osmium', osmiumArgs);

    osmium.stdout.on('data', (data) => sendLog(data));
    osmium.stderr.on('data', (data) => sendLog(data));

    osmium.on('close', (code) => {
        if (code === 0) {
            res.write(`data: ${JSON.stringify({ status: 'success', message: 'Transformation complete' })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ status: 'error', message: `Osmium exited with code ${code}` })}\n\n`);
        }
        res.end();
    });

    osmium.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ status: 'error', message: `Failed to start Osmium: ${err.message}` })}\n\n`);
        res.end();
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Node.js sidecar server listening at http://0.0.0.0:${port}`);
});
