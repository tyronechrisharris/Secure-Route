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
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.springframework.web.HttpRequestMethodNotSupportedException;

@RestController
@RequestMapping("/api/data-mgmt")
@CrossOrigin(origins = "*")
public class MapController {

    private final GraphHopperManager graphHopperManager;

    @Autowired
    public MapController(GraphHopperManager graphHopperManager) {
        this.graphHopperManager = graphHopperManager;
    }

    @GetMapping("/list")
    public ResponseEntity<List<String>> listMaps() {
        System.out.println("[Java Mgmt] GET /api/data-mgmt/list");
        File mapsDir = new File("maps");
        if (!mapsDir.exists()) return ResponseEntity.ok(Collections.emptyList());
        String[] files = mapsDir.list((dir, name) -> name.endsWith(".osm") || name.endsWith(".pbf") || name.endsWith(".bz2"));
        return ResponseEntity.ok(files != null ? Arrays.asList(files) : Collections.emptyList());
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> uploadMap(@RequestParam("file") MultipartFile file) {
        System.out.println("[Java Mgmt] POST /api/data-mgmt/upload - " + file.getOriginalFilename());
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Please select a file to upload."));
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Invalid file name."));
        }

        if (!originalFilename.endsWith(".osm") && !originalFilename.endsWith(".pbf") && !originalFilename.endsWith(".bz2")) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Only .osm, .bz2, and .pbf files are supported."));
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

            return ResponseEntity.ok(Collections.singletonMap("message", "Successfully uploaded " + originalFilename + " to cache."));

        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", "Failed to upload file: " + e.getMessage()));
        }
    }

    @GetMapping(value = "/transform", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public StreamingResponseBody transformMap(@RequestParam("file") String file) {
        System.out.println("[Java Mgmt] GET /api/data-mgmt/transform - " + file);
        return outputStream -> {
            try {
                HttpClient client = HttpClient.newHttpClient();
                String encodedFile = URLEncoder.encode(file, StandardCharsets.UTF_8);
                // Using port 10099 for sidecar
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:10099/api/sidecar/transform?file=" + encodedFile))
                        .build();

                HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
                try (InputStream is = response.body()) {
                    is.transferTo(outputStream);
                }
            } catch (Exception e) {
                String errorMsg = "data: {\"status\":\"error\",\"message\":\"" + e.getMessage().replace("\"", "\\\"") + "\"}\n\n";
                outputStream.write(errorMsg.getBytes(StandardCharsets.UTF_8));
            }
        };
    }

    @PostMapping(value = "/apply", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> applyMap(@RequestBody Map<String, String> body) {
        String fileName = body.get("file");
        System.out.println("[Java Mgmt] POST /api/data-mgmt/apply - " + fileName);
        try {
            if (fileName != null && !fileName.equals("map-data.osm.pbf")) {
                File source = new File("maps", fileName);
                if (source.exists()) {
                    Files.copy(source.toPath(), new File("map-data.osm.pbf").toPath(), StandardCopyOption.REPLACE_EXISTING);
                } else {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Collections.singletonMap("error", "Source file not found: " + fileName));
                }
            }

            graphHopperManager.reloadGraphHopper();
            return ResponseEntity.ok(Collections.singletonMap("message", "Successfully applied and reloaded map data"));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", "Failed to apply map data: " + e.getMessage()));
        }
    }

    @PostMapping(value = "/reload-map-data", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> reloadMap() {
        System.out.println("[Java Mgmt] POST /api/data-mgmt/reload");
        try {
            graphHopperManager.reloadGraphHopper();
            return ResponseEntity.ok(Collections.singletonMap("message", "Successfully reloaded map data"));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", "Failed to reload map data: " + e.getMessage()));
        }
    }

    @GetMapping(value = "/bounds", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getMapBounds() {
        System.out.println("[Java Mgmt] GET /api/data-mgmt/bounds");
        com.graphhopper.util.shapes.BBox bounds = graphHopperManager.getMapBounds();
        if (bounds != null) {
            java.util.Map<String, Double> boundsMap = new java.util.HashMap<>();
            boundsMap.put("minLat", bounds.minLat);
            boundsMap.put("minLon", bounds.minLon);
            boundsMap.put("maxLat", bounds.maxLat);
            boundsMap.put("maxLon", bounds.maxLon);
            return ResponseEntity.ok(boundsMap);
        }
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Collections.singletonMap("error", "Bounds not available"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handle405(HttpRequestMethodNotSupportedException e) {
        System.err.println("[Java Mgmt] 405 Method Not Allowed: " + e.getMessage());
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(Collections.singletonMap("error", "JAVA_MGMT_405: " + e.getMessage()));
    }
}
