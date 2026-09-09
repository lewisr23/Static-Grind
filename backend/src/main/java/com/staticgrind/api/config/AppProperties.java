package com.staticgrind.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "staticgrind")
public record AppProperties(List<String> corsOrigins, int maxPresetsPerUser) {}
