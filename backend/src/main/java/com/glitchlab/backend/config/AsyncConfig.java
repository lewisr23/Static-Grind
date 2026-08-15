package com.glitchlab.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
public class AsyncConfig {

    /**
     * Thread pool for @Async Replicate API calls.
     * Each AI job blocks a thread for up to ~2 minutes while polling.
     * Tune pool size based on expected concurrent users.
     */
    @Bean(name = "glitchTaskExecutor")
    public Executor glitchTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("glitch-async-");
        executor.initialize();
        return executor;
    }
}
