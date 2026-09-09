package com.staticgrind.api.auth.dto;

import com.staticgrind.api.user.AppUser;

import java.util.UUID;

/** Never includes the password hash. */
public record UserResponse(UUID id, String email, String displayName) {

    public static UserResponse from(AppUser user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName());
    }
}
