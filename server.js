const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const mapsDir = path.join(__dirname, 'maps');

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

// POST /api/map/upload: Handle large file uploads
app.post('/api/map/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ message: 'File uploaded successfully', filename: req.file.filename });
});

// GET /api/map/transform: Run Osmium transformation and stream logs
app.get('/api/map/transform', (req, res) => {
    const fileName = req.query.file;
    if (!fileName) {
        return res.status(400).json({ error: 'No file specified' });
    }

    const inputPath = path.join(mapsDir, path.basename(fileName));
    const outputPath = path.join(__dirname, 'map-data.osm.pbf');

    if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ error: 'Input file not found' });
    }

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

// POST /api/map/apply: Copy file to root and trigger Java reload
app.post('/api/map/apply', async (req, res) => {
    const fileName = req.body.file || 'map-data.osm.pbf';
    const sourcePath = fileName === 'map-data.osm.pbf'
        ? path.join(__dirname, 'map-data.osm.pbf')
        : path.join(mapsDir, path.basename(fileName));

    const targetPath = path.join(__dirname, 'map-data.osm.pbf');

    if (!fs.existsSync(sourcePath)) {
        return res.status(404).json({ error: 'Source file not found' });
    }

    try {
        if (sourcePath !== targetPath) {
            fs.copyFileSync(sourcePath, targetPath);
        }

        const response = await fetch('http://localhost:8080/api/reload-map', {
            method: 'POST'
        });

        if (response.ok) {
            res.json({ message: 'Map applied and reloaded successfully' });
        } else {
            const errorText = await response.text();
            res.status(500).json({ error: `Failed to reload Java backend: ${errorText}` });
        }
    } catch (err) {
        res.status(500).json({ error: `Error applying map: ${err.message}` });
    }
});

// GET /api/maps: List all .osm, .pbf, and .bz2 files in the maps/ directory
app.get('/api/maps', (req, res) => {
    fs.readdir(mapsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read maps directory' });
        }
        const mapFiles = files.filter(file =>
            file.endsWith('.osm') || file.endsWith('.pbf') || file.endsWith('.bz2')
        );
        res.json(mapFiles);
    });
});

app.listen(port, () => {
    console.log(`Node.js server listening at http://localhost:${port}`);
});
