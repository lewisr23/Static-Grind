package com.staticgrind.api.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(e ->
                fields.putIfAbsent(e.getField(), e.getDefaultMessage()));
        return ResponseEntity.badRequest()
                .body(new ApiError("That request could not be accepted.", fields));
    }

    /**
     * A body Jackson could not turn into the target type — a malformed JSON
     * document, or a value an enum's @JsonCreator rejected (colorGrade:
     * "sepia"). Without this it escapes as Spring's default error shape, and
     * the frontend ends up parsing two different error formats.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> onUnreadable(HttpMessageNotReadableException ex) {
        Throwable cause = ex.getMostSpecificCause();
        String detail = cause instanceof IllegalArgumentException
                ? cause.getMessage()
                : "The request body could not be read.";
        return ResponseEntity.badRequest().body(ApiError.of(detail));
    }

    @ExceptionHandler(ApiExceptions.NotFound.class)
    public ResponseEntity<ApiError> onNotFound(ApiExceptions.NotFound ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError.of(ex.getMessage()));
    }

    @ExceptionHandler(ApiExceptions.Conflict.class)
    public ResponseEntity<ApiError> onConflict(ApiExceptions.Conflict ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(ex.getMessage()));
    }

    @ExceptionHandler(ApiExceptions.Unprocessable.class)
    public ResponseEntity<ApiError> onUnprocessable(ApiExceptions.Unprocessable ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(ApiError.of(ex.getMessage()));
    }

    // Both arms of a failed login answer identically. Distinguishing "no such
    // account" from "wrong password" would let anyone check whether an address
    // is registered here.
    @ExceptionHandler({BadCredentialsException.class, UsernameNotFoundException.class})
    public ResponseEntity<ApiError> onBadCredentials() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiError.of("That email and password do not match."));
    }
}
