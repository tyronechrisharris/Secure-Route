package com.example.securityrouting;

import com.graphhopper.reader.ReaderElement;
import com.graphhopper.reader.ReaderNode;
import com.graphhopper.reader.osm.OSMInput;
import com.graphhopper.reader.osm.OSMInputFile;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

@Service
public class SecurityAssetExtractor {

    private final List<SecurityAsset> assets = new ArrayList<>();

    public synchronized void extractAssetsFromOSM(File osmFile) {
        System.out.println("Extracting security assets from: " + osmFile.getAbsolutePath());
        assets.clear();

        if (!osmFile.exists()) {
            System.err.println("OSM file not found for asset extraction: " + osmFile.getAbsolutePath());
            return;
        }

        try (OSMInput in = new OSMInputFile(osmFile).setWorkerThreads(2).open()) {
            ReaderElement item;
            while ((item = in.getNext()) != null) {
                if (item instanceof ReaderNode) {
                    ReaderNode node = (ReaderNode) item;
                    String amenity = node.getTag("amenity");
                    String military = node.getTag("military");
                    String emergency = node.getTag("emergency");

                    if (amenity != null) {
                        if (amenity.equals("police")) {
                            addAsset(node, "Police Station", "POLICE");
                        } else if (amenity.equals("hospital") || amenity.equals("clinic")) {
                            addAsset(node, "Medical Facility", "EMS");
                        }
                    }

                    if (military != null && (military.equals("base") || military.equals("barracks") || military.equals("checkpoint"))) {
                        addAsset(node, "Military Installation", "MILITARY");
                    }

                    if (emergency != null && emergency.equals("ambulance_station")) {
                        addAsset(node, "EMS Station", "EMS");
                    }

                    // Custom tag for safe havens, or fallback to embassies etc
                    if (node.hasTag("security", "safe_haven") || node.hasTag("diplomatic", "embassy") || node.hasTag("amenity", "embassy")) {
                        addAsset(node, "Safe Haven", "SAFE_HAVEN");
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to extract assets from OSM: " + e.getMessage());
            e.printStackTrace();
        }

        System.out.println("Extracted " + assets.size() + " security assets.");
    }

    private void addAsset(ReaderNode node, String defaultName, String type) {
        String name = node.getTag("name");
        if (name == null || name.isEmpty()) {
            name = defaultName;
        }
        assets.add(new SecurityAsset(name, node.getLat(), node.getLon(), type));
    }

    public List<SecurityAsset> getAssets() {
        return assets;
    }
}
