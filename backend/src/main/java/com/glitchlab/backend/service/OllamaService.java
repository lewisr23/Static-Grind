package com.glitchlab.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Calls the local Ollama API to interpret a glitch art prompt
 * and return structured effect parameters as JSON.
 */
@Service
@Slf4j
public class OllamaService {

    private static final String OLLAMA_URL = "http://localhost:11434/api/generate";

    private static final String SYSTEM_PROMPT = """
            You are a glitch art effect interpreter. Given a creative prompt describing a visual aesthetic,
            return ONLY a valid JSON object with these exact fields (no explanation, no markdown, just JSON):
            {
              "chromaShift": <float 0.0-1.0, how much RGB channel separation>,
              "scanlines": <boolean, whether to add horizontal scanlines>,
              "scanlineIntensity": <float 0.0-1.0, how strong the scanlines are>,
              "pixelSort": <float 0.0-1.0, how much pixel sorting/streaking>,
              "noise": <float 0.0-1.0, how much grain/noise>,
              "colorGrade": <string: "vhs", "neon", "infrared", "grayscale", "none">,
              "blockGlitch": <float 0.0-1.0, how much rectangular block corruption>,
              "hueShift": <float 0.0-360.0, degrees to rotate hue>
            }
            """;

    private final RestClient restClient = RestClient.create();

    public String interpretPrompt(String prompt) {
        log.info("Sending prompt to Ollama: {}", prompt);

        Map<String, Object> requestBody = Map.of(
                "model", "llama3.2",
                "prompt", "Prompt: " + prompt,
                "system", SYSTEM_PROMPT,
                "stream", false
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> response = restClient.post()
                .uri(OLLAMA_URL)
                .header("Content-Type", "application/json")
                .body(requestBody)
                .retrieve()
                .body(Map.class);

        String rawResponse = (String) response.get("response");
        log.debug("Ollama raw response: {}", rawResponse);

        // Extract just the JSON object from the response
        return extractJson(rawResponse);
    }

    private String extractJson(String text) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start == -1 || end == -1) {
            log.warn("Could not extract JSON from Ollama response, using defaults");
            return defaultParams();
        }
        return text.substring(start, end + 1);
    }

    private String defaultParams() {
        return """
                {
                  "chromaShift": 0.5,
                  "scanlines": true,
                  "scanlineIntensity": 0.5,
                  "pixelSort": 0.3,
                  "noise": 0.2,
                  "colorGrade": "vhs",
                  "blockGlitch": 0.2,
                  "hueShift": 0
                }
                """;
    }
}
