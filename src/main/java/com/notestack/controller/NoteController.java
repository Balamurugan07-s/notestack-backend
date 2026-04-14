package com.notestack.controller;

import com.notestack.model.Note;
import com.notestack.model.User;
import com.notestack.repository.NoteRepository;
import com.notestack.repository.UserRepository;
import com.notestack.service.FileStorageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/notes")
public class NoteController {

    @Autowired private NoteRepository noteRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private FileStorageService fileStorageService;

    private User currentUser() {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByUsername(username).orElseThrow();
    }

    @GetMapping
    public List<Note> getAllNotes() {
        return noteRepository.findByUserId(currentUser().getId());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Note> getNoteById(@PathVariable Long id) {
        return noteRepository.findById(id)
                .filter(n -> n.getUser().getId().equals(currentUser().getId()))
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Note> createNote(
            @RequestParam("title") String title,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "file", required = false) MultipartFile file) throws IOException {

        Note note = new Note();
        note.setTitle(title);
        note.setDescription(description);
        note.setUser(currentUser());

        if (file != null && !file.isEmpty()) {
            note.setFilePath(fileStorageService.store(file));
        }

        return ResponseEntity.ok(noteRepository.save(note));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteNote(@PathVariable Long id) {
        return noteRepository.findById(id)
                .filter(n -> n.getUser().getId().equals(currentUser().getId()))
                .map(n -> { noteRepository.delete(n); return ResponseEntity.ok().build(); })
                .orElse(ResponseEntity.notFound().build());
    }
}
