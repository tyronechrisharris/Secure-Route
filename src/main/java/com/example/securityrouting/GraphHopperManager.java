package com.example.securityrouting;

import com.graphhopper.GraphHopper;
import com.graphhopper.config.CHProfile;
import com.graphhopper.config.LMProfile;
import com.graphhopper.config.Profile;
import com.graphhopper.util.CustomModel;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;

@Service
public class GraphHopperManager {

    private GraphHopper graphHopper;

    public GraphHopperManager() {
        initGraphHopper();
    }

    private void initGraphHopper() {
        graphHopper = new GraphHopper();
        graphHopper.setOSMFile("map-data.osm.bz2");
        if (!new File("map-data.osm.bz2").exists() && new File("map-data.osm").exists()) {
             graphHopper.setOSMFile("map-data.osm");
        }

        graphHopper.setGraphHopperLocation("graph-cache");

        CustomModel customModel = new CustomModel();
        customModel.addToSpeed(com.graphhopper.json.Statement.If("true", com.graphhopper.json.Statement.Op.LIMIT, "car_average_speed"));

        Profile profile = new Profile("security_car");
        profile.setCustomModel(customModel);
        profile.setWeighting("custom");

        graphHopper.setProfiles(java.util.Collections.singletonList(profile));

        graphHopper.getCHPreparationHandler().setCHProfiles(new CHProfile("security_car"));
        graphHopper.getLMPreparationHandler().setLMProfiles(new LMProfile("security_car"));

        // Encoded values required for CustomModel
        graphHopper.setEncodedValuesString("car_access, car_average_speed, road_class, lanes");

        try {
            graphHopper.importOrLoad();
        } catch (Exception e) {
            System.err.println("Warning: GraphHopper initialization failed, likely due to missing OSM data. Please upload a map file.");
            e.printStackTrace();
        }
    }

    public GraphHopper getGraphHopper() {
        return graphHopper;
    }

    public synchronized void reloadGraphHopper() throws IOException {
        System.out.println("Reloading GraphHopper map data...");
        if (graphHopper != null) {
            graphHopper.close();
        }

        File cacheDir = new File("graph-cache");
        if (cacheDir.exists()) {
            deleteDirectory(cacheDir);
        }

        initGraphHopper();
        System.out.println("GraphHopper reload complete.");
    }

    private void deleteDirectory(File dir) throws IOException {
        File[] files = dir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteDirectory(file);
                } else {
                    if (!file.delete()) {
                        throw new IOException("Failed to delete " + file.getAbsolutePath());
                    }
                }
            }
        }
        if (!dir.delete()) {
            throw new IOException("Failed to delete " + dir.getAbsolutePath());
        }
    }

    @PreDestroy
    public void cleanup() {
        if (graphHopper != null) {
            graphHopper.close();
        }
    }
}
