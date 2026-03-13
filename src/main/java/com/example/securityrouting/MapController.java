package com.example.securityrouting;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class MapController {

    private final GraphHopperManager graphHopperManager;

    @Autowired
    public MapController(GraphHopperManager graphHopperManager) {
        this.graphHopperManager = graphHopperManager;
    }

    @GetMapping("/maps")
    public ResponseEntity<List<String>> listMaps() {
        File mapsDir = new File("maps");
        if (!mapsDir.exists()) mapsDir.mkdirs();
        String[] files = mapsDir.list((dir, name) -> name.endsWith(".osm") || name.endsWith(".pbf") || name.endsWith(".bz2"));
        return ResponseEntity.ok(files != null ? Arrays.asList(files) : Collections.emptyList());
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

        if (!originalFilename.endsWith(".osm") && !originalFilename.endsWith(".pbf") && !originalFilename.endsWith(".bz2")) {
            return new ResponseEntity<>("Only .osm, .bz2, and .pbf files are supported.", HttpStatus.BAD_REQUEST);
        }

        try {
            File mapsDir = new File("maps");
            if (!mapsDir.exists()) mapsDir.mkdirs();

            File targetFile = new File(mapsDir, originalFilename);
            try (InputStream is = file.getInputStream();
                 OutputStream os = new FileOutputStream(targetFile)) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = is.read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
            }

            return new ResponseEntity<>("Successfully uploaded " + originalFilename + " to server cache.", HttpStatus.OK);
        } catch (IOException e) {
            e.printStackTrace();
            return new ResponseEntity<>("Failed to upload file: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping(value = "/map/transform", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public StreamingResponseBody transformMap(@RequestParam("file") String file) {
        return outputStream -> {
            try {
                HttpClient client = HttpClient.newHttpClient();
                String encodedFile = URLEncoder.encode(file, StandardCharsets.UTF_8);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create("http://127.0.0.1:10080/api/sidecar/transform?file=" + encodedFile))
                        .build();

                HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
                try (InputStream is = response.body()) {
                    is.transferTo(outputStream);
                }
            } catch (Exception e) {
                outputStream.write(("data: " + "{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}\n\n").getBytes());
            }
        };
    }

    @PostMapping("/map/apply")
    public ResponseEntity<String> applyMap(@RequestBody Map<String, String> body) {
        String fileName = body.get("file");
        try {
            if (fileName != null && !fileName.isEmpty()) {
                File source = new File("maps", fileName);
                if (source.exists()) {
                    Files.copy(source.toPath(), new File("map-data.osm.pbf").toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
            }
            graphHopperManager.reloadGraphHopper();
            return ResponseEntity.ok("Successfully applied and reloaded map data");
        } catch (IOException e) {
            return new ResponseEntity<>("Failed to apply map: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PostMapping("/reload-map")
    public ResponseEntity<String> reloadMap() {
        try {
            graphHopperManager.reloadGraphHopper();
            return new ResponseEntity<>("Successfully reloaded map data", HttpStatus.OK);
        } catch (IOException e) {
            e.printStackTrace();
            return new ResponseEntity<>("Failed to reload map data: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping("/map-bounds")
    public ResponseEntity<?> getMapBounds() {
        com.graphhopper.util.shapes.BBox bounds = graphHopperManager.getMapBounds();
        if (bounds != null) {
            java.util.Map<String, Double> boundsMap = new java.util.HashMap<>();
            boundsMap.put("minLat", bounds.minLat);
            boundsMap.put("minLon", bounds.minLon);
            boundsMap.put("maxLat", bounds.maxLat);
            boundsMap.put("maxLon", bounds.maxLon);
            return new ResponseEntity<>(boundsMap, HttpStatus.OK);
        }
        return new ResponseEntity<>("Bounds not available", HttpStatus.NOT_FOUND);
    }
}
