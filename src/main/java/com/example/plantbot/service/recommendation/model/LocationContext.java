package com.example.plantbot.service.recommendation.model;

public record LocationContext(
    LocationSource locationSource,
    String displayName,
    String canonicalQuery,
    String cityLabel,
    String regionLabel,
    Double lat,
    Double lon
) {
}
