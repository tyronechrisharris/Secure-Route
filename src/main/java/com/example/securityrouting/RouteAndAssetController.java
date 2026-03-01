package com.example.securityrouting;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.graphhopper.GHRequest;
import com.graphhopper.GHResponse;
import com.graphhopper.GraphHopper;
import com.graphhopper.ResponsePath;
import com.graphhopper.json.Statement;
import com.graphhopper.util.CustomModel;
import com.graphhopper.util.JsonFeature;
import com.graphhopper.util.JsonFeatureCollection;
import com.graphhopper.util.shapes.GHPoint;
import com.graphhopper.util.shapes.GHPoint3D;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.n52.jackson.datatype.jts.JtsModule;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class RouteAndAssetController {

    @Autowired
    private GraphHopper graphHopper;

    @Autowired
    private SecurityAssetExtractor assetExtractor;

    @Autowired
    private ThreatDataProcessor threatProcessor;

    @Autowired
    private LiveTrafficUpdater trafficUpdater;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public RouteAndAssetController() {
        objectMapper.registerModule(new JtsModule());
    }

    @GetMapping("/security-assets")
    public List<SecurityAsset> getAssets() {
        return assetExtractor.getAssets();
    }

    @PostMapping("/secure-route")
    public ResponseEntity<RouteResponse> calculateRoute(@RequestBody RouteRequest request) {
        GHRequest ghRequest = new GHRequest(
                new GHPoint(request.getStartLat(), request.getStartLon()),
                new GHPoint(request.getEndLat(), request.getEndLon())
        );

        ghRequest.setProfile("security_car");
        // Disable CH to allow dynamic CustomModel
        ghRequest.getHints().putObject(com.graphhopper.util.Parameters.CH.DISABLE, true);

        CustomModel customModel = new CustomModel();

        // Add base speed (CRITICAL: must match what works for the profile)
        customModel.addToSpeed(Statement.If("true", Statement.Op.LIMIT, "car_average_speed"));

        // Areas
        Map<String, JsonFeature> areasMap = new HashMap<>();

        // Threats
        List<Map<String, Object>> threats = threatProcessor.getThreatFeatures();
        for (int i = 0; i < threats.size(); i++) {
            Map<String, Object> featureMap = threats.get(i);
            String id = "threat_" + i;
            featureMap.put("id", id);
            try {
                String json = objectMapper.writeValueAsString(featureMap);
                JsonFeature feature = objectMapper.readValue(json, JsonFeature.class);
                feature.setId(id);
                areasMap.put(id, feature);

                double penalty = 0.5;
                if ("HIGH".equals(request.getThreatLevel())) penalty = 0.1;
                else if ("MEDIUM".equals(request.getThreatLevel())) penalty = 0.3;

                customModel.addToPriority(Statement.If("in_" + id, Statement.Op.MULTIPLY, String.valueOf(penalty)));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        // Traffic
        List<Map<String, Object>> traffic = trafficUpdater.getTrafficIncidents();
        for (int i = 0; i < traffic.size(); i++) {
            Map<String, Object> featureMap = traffic.get(i);
            String id = (String) featureMap.get("id");
            if (id == null) id = "traffic_" + i;
            featureMap.put("id", id);
            try {
                String json = objectMapper.writeValueAsString(featureMap);
                JsonFeature feature = objectMapper.readValue(json, JsonFeature.class);
                feature.setId(id); // Explicitly set ID
                areasMap.put(id, feature);

                customModel.addToPriority(Statement.If("in_" + id, Statement.Op.MULTIPLY, "0.1"));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        JsonFeatureCollection collection = new JsonFeatureCollection();
        collection.getFeatures().addAll(areasMap.values());
        customModel.setAreas(collection);

        ghRequest.setCustomModel(customModel);

        GHResponse response = graphHopper.route(ghRequest);

        if (response.hasErrors()) {
            throw new RuntimeException("Routing failed: " + response.getErrors());
        }

        ResponsePath path = response.getBest();

        // Proximity Calculation
        SecurityAsset nearestSafeHaven = null;
        double minDistance = Double.MAX_VALUE;
        List<SecurityAsset> allAssets = assetExtractor.getAssets();
        List<SecurityAsset> safeHavens = new ArrayList<>();
        for (SecurityAsset asset : allAssets) {
            if ("SAFE_HAVEN".equals(asset.getType())) {
                safeHavens.add(asset);
            }
        }

        if (!safeHavens.isEmpty()) {
            double[] lats = {request.getStartLat(), request.getEndLat()};
            double[] lons = {request.getStartLon(), request.getEndLon()};
            for (int i=0; i<lats.length; i++) {
                for (SecurityAsset haven : safeHavens) {
                    double dist = dist(lats[i], lons[i], haven.getLat(), haven.getLon());
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestSafeHaven = haven;
                    }
                }
            }
        }

        String etaSafeHaven = (nearestSafeHaven != null) ? String.format("%.1f km", minDistance / 1000.0) : "N/A";

        // Construct GeoJSON manually and JTS LineString for intersection
        Map<String, Object> geometry = new HashMap<>();
        geometry.put("type", "LineString");
        List<List<Double>> coords = new ArrayList<>();
        Coordinate[] jtsCoords = new Coordinate[path.getPoints().size()];
        int idx = 0;
        for (GHPoint3D p : path.getPoints()) {
            coords.add(Arrays.asList(p.lon, p.lat));
            jtsCoords[idx++] = new Coordinate(p.lon, p.lat);
        }
        geometry.put("coordinates", coords);

        GeometryFactory geometryFactory = new GeometryFactory();
        LineString routeLineString = jtsCoords.length > 1 ? geometryFactory.createLineString(jtsCoords) : null;

        List<String> intersectedThreats = new ArrayList<>();
        if (routeLineString != null) {
            List<Geometry> threatPolygons = threatProcessor.getThreatPolygons();
            List<Map<String, Object>> threatFeatures = threatProcessor.getThreatFeatures();

            for (int i = 0; i < threatPolygons.size(); i++) {
                Geometry polygon = threatPolygons.get(i);
                if (routeLineString.intersects(polygon)) {
                    Map<String, Object> feature = threatFeatures.get(i);
                    Object propertiesObj = feature.get("properties");
                    String threatName = "Unnamed Threat";
                    if (propertiesObj instanceof Map) {
                        Map<String, Object> properties = (Map<String, Object>) propertiesObj;
                        if (properties.containsKey("name")) {
                            threatName = String.valueOf(properties.get("name"));
                        }
                    }
                    intersectedThreats.add(threatName);
                }
            }
        }

        RouteResponse routeResponse = RouteResponse.builder()
                .geometry(geometry)
                .distance(path.getDistance())
                .time(path.getTime())
                .chokePointsAvoided(0)
                .proximityScore(minDistance)
                .etaToNearestSafeHaven(etaSafeHaven)
                .intersectedThreats(intersectedThreats)
                .build();

        return ResponseEntity.ok(routeResponse);
    }

    private double dist(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371e3;
        double phi1 = lat1 * Math.PI/180;
        double phi2 = lat2 * Math.PI/180;
        double dphi = (lat2-lat1) * Math.PI/180;
        double dlam = (lon2-lon1) * Math.PI/180;
        double a = Math.sin(dphi/2) * Math.sin(dphi/2) +
                   Math.cos(phi1) * Math.cos(phi2) *
                   Math.sin(dlam/2) * Math.sin(dlam/2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
}
