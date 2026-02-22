package com.example.plantbot.util;

public record AIWateringProfile(double intervalFactor,
                                double waterFactor,
                                String source) {
}
