package com.example.securityrouting;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

@Service
public class LiveTrafficUpdater {

    private final List<Map<String, Object>> trafficIncidents = new ArrayList<>();
    private final Random random = new Random();

    @Scheduled(fixedRate = 10000)
    public void updateTraffic() {
        // Simulate fetching live traffic
        int numIncidents = random.nextInt(5);
        trafficIncidents.clear();
        for (int i = 0; i < numIncidents; i++) {
            Map<String, Object> incident = new HashMap<>();
            incident.put("type", "Feature");
            incident.put("properties", new HashMap<String, Object>() {{
                put("severity", "high");
                put("type", "accident");
            }});

            // Random point near London
            double lat = 51.5 + (random.nextDouble() - 0.5) * 0.1;
            double lon = -0.1 + (random.nextDouble() - 0.5) * 0.1;

            // Create a small polygon (box) around the point to serve as an area
            double delta = 0.001;
            Map<String, Object> geom = new HashMap<>();
            geom.put("type", "Polygon");
            geom.put("coordinates", new double[][][]{{
                {lon - delta, lat - delta},
                {lon + delta, lat - delta},
                {lon + delta, lat + delta},
                {lon - delta, lat + delta},
                {lon - delta, lat - delta}
            }});
            incident.put("geometry", geom);

            trafficIncidents.add(incident);
        }
        System.out.println("Updated live traffic: " + numIncidents + " incidents.");
    }

    public List<Map<String, Object>> getTrafficIncidents() {
        return trafficIncidents;
    }
}
