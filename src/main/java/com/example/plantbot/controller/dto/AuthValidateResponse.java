package com.example.plantbot.controller.dto;

public record AuthValidateResponse(boolean ok,
                                   String userId,
                                   String username,
                                   String firstName,
                                   String city) {
}
