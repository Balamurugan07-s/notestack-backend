package com.notestack.payload.request;

import jakarta.validation.constraints.NotBlank;

public class LoginRequest {
    @NotBlank public String usernameOrEmail;
    @NotBlank public String password;
}
