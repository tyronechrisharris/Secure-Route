const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const port = 10080;

app.use(express.json());

const mapsDir = path.join(__dirname, 'maps');

// Internal transform endpoint
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

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

    sendLog(`[Sidecar] Running Osmium transformation on ${fileName}...`);

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

app.listen(port, '127.0.0.1', () => {
    console.log(`Node.js sidecar listening internally at http://127.0.0.1:${port}`);
});
