package com.example.securityrouting;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SecurityAsset {
    private String name;
    private double lat;
    private double lon;
    private String type; // POLICE, EMS, MILITARY, SAFE_HAVEN
}
