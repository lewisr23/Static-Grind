package com.glitchlab.backend.controller;

import com.glitchlab.backend.model.GlitchJob;
import com.glitchlab.backend.service.GlitchJobService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5173")
public class GlitchController {

    private final GlitchJobService glitchJobService;

    /**
     * POST /api/glitch
     * Accepts a prompt, calls Ollama to interpret it, returns effect params.
     * The frontend handles all image processing with canvas.
     */
    @PostMapping("/glitch")
    public ResponseEntity<GlitchJob> submitGlitchJob(@RequestParam("prompt") String prompt) {
        GlitchJob job = glitchJobService.createJob(prompt);
        return ResponseEntity.ok(job);
    }

    /**
     * GET /api/jobs/{id}
     * Returns a previously created job by ID.
     */
    @GetMapping("/jobs/{id}")
    public ResponseEntity<GlitchJob> getJob(@PathVariable String id) {
        return glitchJobService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
