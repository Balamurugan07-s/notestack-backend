package com.notestack.controller;

import com.notestack.model.User;
import com.notestack.payload.request.LoginRequest;
import com.notestack.payload.request.SignupRequest;
import com.notestack.payload.response.JwtResponse;
import com.notestack.payload.response.MessageResponse;
import com.notestack.repository.UserRepository;
import com.notestack.security.JwtUtils;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired private AuthenticationManager authenticationManager;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtUtils jwtUtils;

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody SignupRequest request) {
        if (userRepository.existsByUsername(request.username)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Username already taken"));
        }
        if (userRepository.existsByEmail(request.email)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Email already in use"));
        }
        User user = new User(request.username, request.email, passwordEncoder.encode(request.password));
        userRepository.save(user);
        return ResponseEntity.ok(new MessageResponse("User registered successfully"));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        Authentication auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.usernameOrEmail, request.password));
        String token = jwtUtils.generateToken(auth.getName());
        return ResponseEntity.ok(new JwtResponse(token, auth.getName()));
    }
}
