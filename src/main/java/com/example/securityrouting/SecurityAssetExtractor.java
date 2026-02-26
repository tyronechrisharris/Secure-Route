package com.example.securityrouting;

import org.springframework.stereotype.Service;
import java.util.ArrayList;
import java.util.List;

@Service
public class SecurityAssetExtractor {

    private final List<SecurityAsset> assets = new ArrayList<>();

    public SecurityAssetExtractor() {
        // Dummy data for testing - in production this would parse OSM or GeoJSON
        assets.add(new SecurityAsset("Police Station Central", 51.5074, -0.1278, "POLICE"));
        assets.add(new SecurityAsset("EMS City Hospital", 51.5080, -0.1285, "EMS"));
        assets.add(new SecurityAsset("Safe Haven 1", 51.5090, -0.1260, "SAFE_HAVEN"));
        assets.add(new SecurityAsset("Military Base Alpha", 51.5100, -0.1250, "MILITARY"));
    }

    public List<SecurityAsset> getAssets() {
        return assets;
    }
}
