package com.staticgrind.api.error;

/** The handful of failures this API reports with a specific status. */
public final class ApiExceptions {

    private ApiExceptions() {}

    /** 404. Also used when a resource exists but belongs to another user. */
    public static class NotFound extends RuntimeException {
        public NotFound(String message) { super(message); }
    }

    /** 409. A name the user already has. */
    public static class Conflict extends RuntimeException {
        public Conflict(String message) { super(message); }
    }

    /** 422. A request that is well-formed but cannot be satisfied. */
    public static class Unprocessable extends RuntimeException {
        public Unprocessable(String message) { super(message); }
    }
}
