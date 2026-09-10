package com.staticgrind.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "staticgrind")
public record AppProperties(
        List<String> corsOrigins,
        int maxPresetsPerUser,

        /*
         * Domain for the CSRF cookie, or blank to leave it host-only.
         *
         * The token has to be readable by the frontend's JavaScript, and a
         * host-only cookie set by api.staticgrind.com is invisible to script
         * running on staticgrind.com. Locally this never shows up: both sides
         * are "localhost" and cookies ignore the port, so document.cookie
         * finds it and everything works right up until deploy. In production
         * this is set to .staticgrind.com so both hosts can read it.
         */
        String cookieDomain
) {}
