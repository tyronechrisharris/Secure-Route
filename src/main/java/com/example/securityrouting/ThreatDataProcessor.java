package com.example.securityrouting;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class ThreatDataProcessor {

    private final List<Geometry> threatPolygons = new ArrayList<>();
    private final List<Map<String, Object>> threatFeatures = new ArrayList<>();
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ThreatDataProcessor() {
        // Load on startup
        loadThreats("threats.geojson");
    }

    public synchronized void saveThreats(String geoJsonPayload) {
        try {
            File file = new File("threats.geojson");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, objectMapper.readTree(geoJsonPayload));
            loadThreats("threats.geojson");
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to save threats", e);
        }
    }

    private synchronized void loadThreats(String filepath) {
        try {
            File file = new File(filepath);
            if (!file.exists()) return;

            threatPolygons.clear();
            threatFeatures.clear();

            JsonNode root = objectMapper.readTree(file);
            JsonNode features = root.get("features");
            if (features != null && features.isArray()) {
                for (JsonNode feature : features) {
                    Map<String, Object> featureMap = objectMapper.convertValue(feature, Map.class);
                    threatFeatures.add(featureMap);

                    JsonNode geometry = feature.get("geometry");
                    if (geometry != null) {
                        String type = geometry.get("type").asText();
                        if ("Polygon".equals(type)) {
                            JsonNode coordinates = geometry.get("coordinates");
                            if (coordinates.isArray() && coordinates.size() > 0) {
                                JsonNode exteriorRing = coordinates.get(0);
                                Coordinate[] coords = new Coordinate[exteriorRing.size()];
                                for (int i = 0; i < exteriorRing.size(); i++) {
                                    JsonNode point = exteriorRing.get(i);
                                    coords[i] = new Coordinate(point.get(0).asDouble(), point.get(1).asDouble());
                                }
                                Polygon polygon = geometryFactory.createPolygon(coords);
                                threatPolygons.add(polygon);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public boolean isPointInThreat(double lat, double lon) {
        Geometry point = geometryFactory.createPoint(new Coordinate(lon, lat));
        for (Geometry polygon : threatPolygons) {
            if (polygon.contains(point)) {
                return true;
            }
        }
        return false;
    }

    public List<Map<String, Object>> getThreatFeatures() {
        return threatFeatures;
    }

    public List<Geometry> getThreatPolygons() {
        return threatPolygons;
    }
}
