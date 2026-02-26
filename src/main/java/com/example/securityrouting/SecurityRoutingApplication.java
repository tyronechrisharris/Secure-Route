package com.example.securityrouting;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SecurityRoutingApplication {

    public static void main(String[] args) {
        SpringApplication.run(SecurityRoutingApplication.class, args);
    }

}
