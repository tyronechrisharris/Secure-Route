package com.example.securityrouting;

import java.util.List;
import java.util.Map;

public class RouteResponse {
    private Map<String, Object> geometry;
    private double distance; // meters
    private long time; // ms
    private int chokePointsAvoided;
    private double proximityScore;
    private String etaToNearestSafeHaven;
    private List<String> intersectedThreats;

    public Map<String, Object> getGeometry() { return geometry; }
    public void setGeometry(Map<String, Object> geometry) { this.geometry = geometry; }
    public double getDistance() { return distance; }
    public void setDistance(double distance) { this.distance = distance; }
    public long getTime() { return time; }
    public void setTime(long time) { this.time = time; }
    public int getChokePointsAvoided() { return chokePointsAvoided; }
    public void setChokePointsAvoided(int chokePointsAvoided) { this.chokePointsAvoided = chokePointsAvoided; }
    public double getProximityScore() { return proximityScore; }
    public void setProximityScore(double proximityScore) { this.proximityScore = proximityScore; }
    public String getEtaToNearestSafeHaven() { return etaToNearestSafeHaven; }
    public void setEtaToNearestSafeHaven(String etaToNearestSafeHaven) { this.etaToNearestSafeHaven = etaToNearestSafeHaven; }
    public List<String> getIntersectedThreats() { return intersectedThreats; }
    public void setIntersectedThreats(List<String> intersectedThreats) { this.intersectedThreats = intersectedThreats; }

    public static RouteResponseBuilder builder() {
        return new RouteResponseBuilder();
    }

    public static class RouteResponseBuilder {
        private Map<String, Object> geometry;
        private double distance;
        private long time;
        private int chokePointsAvoided;
        private double proximityScore;
        private String etaToNearestSafeHaven;
        private List<String> intersectedThreats;

        public RouteResponseBuilder geometry(Map<String, Object> geometry) {
            this.geometry = geometry;
            return this;
        }

        public RouteResponseBuilder distance(double distance) {
            this.distance = distance;
            return this;
        }

        public RouteResponseBuilder time(long time) {
            this.time = time;
            return this;
        }

        public RouteResponseBuilder chokePointsAvoided(int chokePointsAvoided) {
            this.chokePointsAvoided = chokePointsAvoided;
            return this;
        }

        public RouteResponseBuilder proximityScore(double proximityScore) {
            this.proximityScore = proximityScore;
            return this;
        }

        public RouteResponseBuilder etaToNearestSafeHaven(String etaToNearestSafeHaven) {
            this.etaToNearestSafeHaven = etaToNearestSafeHaven;
            return this;
        }

        public RouteResponseBuilder intersectedThreats(List<String> intersectedThreats) {
            this.intersectedThreats = intersectedThreats;
            return this;
        }

        public RouteResponse build() {
            RouteResponse response = new RouteResponse();
            response.setGeometry(this.geometry);
            response.setDistance(this.distance);
            response.setTime(this.time);
            response.setChokePointsAvoided(this.chokePointsAvoided);
            response.setProximityScore(this.proximityScore);
            response.setEtaToNearestSafeHaven(this.etaToNearestSafeHaven);
            response.setIntersectedThreats(this.intersectedThreats);
            return response;
        }
    }
}
