package com.staticgrind.api.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Email @Size(max = 254) String email,

        // BCrypt silently ignores anything past 72 bytes, so a 100-character
        // passphrase would not be fully checked. Reject rather than truncate.
        @NotBlank @Size(min = 10, max = 72,
                message = "Password must be between 10 and 72 characters.") String password,

        @NotBlank @Size(max = 40) String displayName
) {}
