package com.example.securityrouting;

public class RouteRequest {
    private double startLat;
    private double startLon;
    private double endLat;
    private double endLon;
    private String threatLevel; // LOW, MEDIUM, HIGH
    private String vehicleProfile;

    public double getStartLat() { return startLat; }
    public void setStartLat(double startLat) { this.startLat = startLat; }
    public double getStartLon() { return startLon; }
    public void setStartLon(double startLon) { this.startLon = startLon; }
    public double getEndLat() { return endLat; }
    public void setEndLat(double endLat) { this.endLat = endLat; }
    public double getEndLon() { return endLon; }
    public void setEndLon(double endLon) { this.endLon = endLon; }
    public String getThreatLevel() { return threatLevel; }
    public void setThreatLevel(String threatLevel) { this.threatLevel = threatLevel; }
    public String getVehicleProfile() { return vehicleProfile; }
    public void setVehicleProfile(String vehicleProfile) { this.vehicleProfile = vehicleProfile; }
}
