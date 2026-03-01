package com.example.securityrouting;

import lombok.Builder;
import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class RouteResponse {
    private Map<String, Object> geometry;
    private double distance; // meters
    private long time; // ms
    private int chokePointsAvoided;
    private double proximityScore;
    private String etaToNearestSafeHaven;
    private List<String> intersectedThreats;
}
