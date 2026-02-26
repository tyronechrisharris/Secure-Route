package com.example.securityrouting;

import lombok.Data;

@Data
public class RouteRequest {
    private double startLat;
    private double startLon;
    private double endLat;
    private double endLon;
    private String threatLevel; // LOW, MEDIUM, HIGH
    private String vehicleProfile;
}
