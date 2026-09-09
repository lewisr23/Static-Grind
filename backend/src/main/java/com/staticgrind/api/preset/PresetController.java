package com.staticgrind.api.preset;

import com.staticgrind.api.preset.dto.PresetRequest;
import com.staticgrind.api.preset.dto.PresetResponse;
import com.staticgrind.api.user.AppUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/presets")
public class PresetController {

    private final PresetService service;

    public PresetController(PresetService service) {
        this.service = service;
    }

    @GetMapping
    public List<PresetResponse> list(@AuthenticationPrincipal AppUser user) {
        return service.list(user.getId());
    }

    @PostMapping
    public ResponseEntity<PresetResponse> create(@AuthenticationPrincipal AppUser user,
                                                 @Valid @RequestBody PresetRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(user.getId(), request));
    }

    @PutMapping("/{id}")
    public PresetResponse update(@AuthenticationPrincipal AppUser user,
                                 @PathVariable UUID id,
                                 @Valid @RequestBody PresetRequest request) {
        return service.update(user.getId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AppUser user, @PathVariable UUID id) {
        service.delete(user.getId(), id);
    }
}
