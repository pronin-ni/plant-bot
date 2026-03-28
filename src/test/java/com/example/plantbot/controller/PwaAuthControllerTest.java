package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.pwa.PwaAuthResponse;
import com.example.plantbot.controller.dto.pwa.PwaUserResponse;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.service.auth.PwaAuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PwaAuthControllerTest {

  @Mock
  private PwaAuthService pwaAuthService;
  @Mock
  private UserRepository userRepository;
  @Mock
  private HttpServletRequest request;

  @Test
  void devLocalLoginAllowsLoopbackAddress() {
    when(request.getRemoteAddr()).thenReturn("0:0:0:0:0:0:0:1%lo0");
    when(pwaAuthService.loginWithLocalDevUser()).thenReturn(
        new PwaAuthResponse("token", 3600, new PwaUserResponse(1L, 1L, "dev", "Dev", null, Set.of("ROLE_USER")))
    );

    PwaAuthController controller = new PwaAuthController(pwaAuthService, userRepository);
    PwaAuthResponse response = controller.localDevLogin(request);

    assertEquals("token", response.accessToken());
  }

  @Test
  void devLocalLoginRejectsNonLoopbackAddress() {
    when(request.getRemoteAddr()).thenReturn("192.168.1.15");

    PwaAuthController controller = new PwaAuthController(pwaAuthService, userRepository);

    ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.localDevLogin(request));
    assertEquals(404, ex.getStatusCode().value());
  }
}
