package com.staticgrind.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final AppProperties props;

    public SecurityConfig(AppProperties props) {
        this.props = props;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Strength 12 rather than the default 10. Login is a rare operation
        // here, so the extra ~100ms costs the user nothing and costs an
        // offline attacker four times as much per guess.
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        // Spring Security 6 defers resolving the CSRF token, which a
        // JavaScript client cannot work with — it needs the value present as a
        // readable cookie on an ordinary GET. Setting the request attribute
        // name to null opts back out of that deferral.
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);

        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))

            // CSRF protection is required precisely because auth rides on a
            // cookie: the browser attaches it to cross-site form posts too.
            // The double-submit cookie is what distinguishes a request the
            // frontend actually made from one another site made on its behalf.
            .csrf(csrf -> csrf
                    .csrfTokenRepository(csrfTokenRepository())
                    .csrfTokenRequestHandler(csrfHandler))

            .authorizeHttpRequests(auth -> auth
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                    .requestMatchers("/api/health").permitAll()
                    .anyRequest().authenticated())

            // A browser API answers 401. The default would redirect to a login
            // page that does not exist here, and fetch() would follow it and
            // report a confusing 200.
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint((request, response, authException) ->
                            writeError(response, HttpStatus.UNAUTHORIZED, "Not signed in."))
                    // Reached when a signed-in caller sends no CSRF token, or a
                    // stale one. Without an explicit handler this leaves as
                    // Spring's default error shape rather than ApiError.
                    .accessDeniedHandler((request, response, deniedException) ->
                            writeError(response, HttpStatus.FORBIDDEN,
                                    "Your session token is missing or stale. Reload and try again.")))

            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable())

            .addFilterAfter(new CsrfCookieFilter(), org.springframework.security.web.csrf.CsrfFilter.class);

        return http.build();
    }

    /**
     * Deliberately not HttpOnly: the frontend has to read this value back and
     * echo it in a header, which is the whole mechanism of a double-submit
     * token. It is not a secret in the way the session cookie is — knowing it
     * is useless without also being able to send the session.
     */
    private CookieCsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        String domain = props.cookieDomain();
        if (domain != null && !domain.isBlank()) {
            repository.setCookieCustomizer(cookie -> cookie.domain(domain));
        }
        return repository;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // Explicit origins, never "*": allowCredentials and a wildcard origin
        // are mutually exclusive, and a credentialed API must not be callable
        // from anywhere anyway.
        config.setAllowedOrigins(props.corsOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(HttpHeaders.CONTENT_TYPE, "X-XSRF-TOKEN"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    /** Every error this API emits has the same shape, including the ones
     *  raised inside the filter chain before any controller runs. */
    private static void writeError(HttpServletResponse response, HttpStatus status, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"message\":\"" + message + "\",\"fields\":{}}");
    }

    /**
     * Forces the CSRF token to be materialised so the XSRF-TOKEN cookie is set
     * on ordinary requests. Without it the frontend has no token to echo until
     * after its first state-changing call has already been rejected.
     */
    static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                        FilterChain filterChain) throws ServletException, IOException {
            CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
            if (token != null) {
                token.getToken();
            }
            filterChain.doFilter(request, response);
        }
    }
}
