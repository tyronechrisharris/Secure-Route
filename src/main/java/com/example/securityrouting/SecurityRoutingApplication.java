package com.example.securityrouting;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.BufferedReader;
import java.io.InputStreamReader;

@SpringBootApplication
@EnableScheduling
public class SecurityRoutingApplication implements CommandLineRunner {

    public static void main(String[] args) {
        SpringApplication.run(SecurityRoutingApplication.class, args);
    }

    @Override
    public void run(String... args) throws Exception {
        System.out.println("Starting Node.js sidecar server...");

        // Ensure we are in the right directory or provide full path if necessary
        ProcessBuilder builder = new ProcessBuilder("node", "server.js");
        builder.redirectErrorStream(true);
        Process process = builder.start();

        new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    System.out.println("[Node Sidecar] " + line);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("Shutting down Node.js sidecar...");
            process.destroy();
        }));
    }
}
