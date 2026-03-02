package com.example.securityrouting;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

@RestController
@RequestMapping("/api")
public class MapController {

    private final GraphHopperManager graphHopperManager;

    @Autowired
    public MapController(GraphHopperManager graphHopperManager) {
        this.graphHopperManager = graphHopperManager;
    }

    @PostMapping("/upload-map")
    public ResponseEntity<String> uploadMap(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return new ResponseEntity<>("Please select a file to upload.", HttpStatus.BAD_REQUEST);
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) {
            return new ResponseEntity<>("Invalid file name.", HttpStatus.BAD_REQUEST);
        }

        boolean isBz2 = originalFilename.endsWith(".osm.bz2");
        boolean isOsm = originalFilename.endsWith(".osm");

        if (!isBz2 && !isOsm) {
            return new ResponseEntity<>("Only .osm and .osm.bz2 files are supported.", HttpStatus.BAD_REQUEST);
        }

        try {
            // Delete existing map files to ensure we use the new one
            File bz2File = new File("map-data.osm.bz2");
            File osmFile = new File("map-data.osm");

            if (bz2File.exists()) bz2File.delete();
            if (osmFile.exists()) osmFile.delete();

            // Save new file
            String targetFileName = isBz2 ? "map-data.osm.bz2" : "map-data.osm";
            File targetFile = new File(targetFileName);

            try (InputStream is = file.getInputStream();
                 OutputStream os = new FileOutputStream(targetFile)) {

                byte[] buffer = new byte[1024];
                int bytesRead;
                while ((bytesRead = is.read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
            }

            System.out.println("Map uploaded successfully: " + targetFileName);

            // Reload GraphHopper with the new map data
            graphHopperManager.reloadGraphHopper();

            return new ResponseEntity<>("Successfully uploaded and applied " + originalFilename, HttpStatus.OK);

        } catch (IOException e) {
            e.printStackTrace();
            return new ResponseEntity<>("Failed to process uploaded file: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
