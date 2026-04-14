package com.notestack.payload.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class SignupRequest {
    @NotBlank @Size(min = 3, max = 50) public String username;
    @NotBlank @jakarta.validation.constraints.Email public String email;
    @NotBlank @Size(min = 6) public String password;
}
