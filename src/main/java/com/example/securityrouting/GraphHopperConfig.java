package com.example.securityrouting;

import com.graphhopper.GraphHopper;
import com.graphhopper.config.Profile;
import com.graphhopper.util.CustomModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.File;
import java.util.Collections;

@Configuration
public class GraphHopperConfig {

    @Bean
    public GraphHopper graphHopper() {
        GraphHopper hopper = new GraphHopper();
        hopper.setOSMFile("map-data.osm");
        hopper.setGraphHopperLocation("graph-cache");

        // Custom Model setup
        CustomModel customModel = new CustomModel();

        // Base speed from car_average_speed
        customModel.addToSpeed(com.graphhopper.json.Statement.If("true", com.graphhopper.json.Statement.Op.LIMIT, "car_average_speed"));

        // Priority adjustment for choke points
        customModel.addToPriority(com.graphhopper.json.Statement.If("road_class == TRUNK", com.graphhopper.json.Statement.Op.MULTIPLY, "0.8"));

        // Max lanes penalty
        customModel.addToPriority(com.graphhopper.json.Statement.If("lanes == 1", com.graphhopper.json.Statement.Op.MULTIPLY, "0.7"));

        // Define profiles
        Profile profile = new Profile("security_car");
        profile.setCustomModel(customModel);
        profile.setWeighting("custom");

        hopper.setProfiles(Collections.singletonList(profile));

        // Store
        hopper.getCHPreparationHandler().setCHProfiles(new com.graphhopper.config.CHProfile("security_car"));
        hopper.getLMPreparationHandler().setLMProfiles(new com.graphhopper.config.LMProfile("security_car"));

        // Encoded values required for CustomModel
        hopper.setEncodedValuesString("car_access, car_average_speed, road_class, lanes");

        // Initialize
        hopper.importOrLoad();

        return hopper;
    }
}
