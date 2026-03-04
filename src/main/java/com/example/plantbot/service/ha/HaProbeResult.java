package com.example.plantbot.service.ha;

import java.util.List;

public record HaProbeResult(boolean connected,
                            String instanceName,
                            String message,
                            List<HaRoom> rooms,
                            List<HaSensorReading> sensors) {
}
