package com.staticgrind.api.error;

import java.util.Map;

/**
 * One error shape for the whole API, so the frontend has a single thing to
 * parse. fields is populated only for validation failures.
 */
public record ApiError(String message, Map<String, String> fields) {

    public static ApiError of(String message) {
        return new ApiError(message, Map.of());
    }
}
