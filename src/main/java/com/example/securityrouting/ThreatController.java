package com.example.securityrouting;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ThreatController {

    @Autowired
    private ThreatDataProcessor threatProcessor;

    @GetMapping("/threats")
    public ResponseEntity<String> getThreats() {
        try {
            String content = new String(Files.readAllBytes(Paths.get("threats.geojson")));
            return ResponseEntity.ok(content);
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("{\"error\": \"Failed to read threats.geojson\"}");
        }
    }

    @PostMapping("/threats")
    public ResponseEntity<String> saveThreats(@RequestBody String payload) {
        try {
            threatProcessor.saveThreats(payload);
            return ResponseEntity.ok("{\"status\": \"success\"}");
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("{\"error\": \"Failed to save threats\"}");
        }
    }
}
