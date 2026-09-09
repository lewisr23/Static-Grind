package com.staticgrind.api.auth;

import com.staticgrind.api.auth.dto.LoginRequest;
import com.staticgrind.api.auth.dto.RegisterRequest;
import com.staticgrind.api.auth.dto.UserResponse;
import com.staticgrind.api.error.ApiExceptions;
import com.staticgrind.api.user.AppUser;
import com.staticgrind.api.user.User;
import com.staticgrind.api.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(UserRepository users,
                          PasswordEncoder passwordEncoder,
                          AuthenticationManager authenticationManager,
                          SecurityContextRepository securityContextRepository) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/register")
    @Transactional
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest request,
                                                 HttpServletRequest httpRequest,
                                                 HttpServletResponse httpResponse) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new ApiExceptions.Conflict("That email is already registered.");
        }

        User user = new User(
                request.email().trim(),
                passwordEncoder.encode(request.password()),
                request.displayName().trim());
        users.save(user);

        // Registering signs you in. Anything else means asking for the password
        // twice in a row for no reason.
        AppUser principal = AppUser.from(user);
        establishSession(
                UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()),
                httpRequest, httpResponse);

        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(principal));
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest request,
                              HttpServletRequest httpRequest,
                              HttpServletResponse httpResponse) {
        // Throws BadCredentialsException on failure, which the exception
        // handler turns into an identical 401 for both wrong-password and
        // no-such-account.
        Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(request.email(), request.password()));

        establishSession(authentication, httpRequest, httpResponse);
        return UserResponse.from((AppUser) authentication.getPrincipal());
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AppUser user) {
        return UserResponse.from(user);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    /**
     * Puts the authenticated context into a session cookie.
     *
     * The old session is dropped first. Without that, a session id an attacker
     * planted in the browser before login would still be valid afterwards, now
     * carrying the victim's identity — session fixation. Authenticating on a
     * fresh id is what closes it.
     */
    private void establishSession(Authentication authentication,
                                  HttpServletRequest request,
                                  HttpServletResponse response) {
        HttpSession existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }
}
