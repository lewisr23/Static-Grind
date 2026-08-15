package com.glitchlab.backend.service;

import com.glitchlab.backend.model.GlitchJob;
import com.glitchlab.backend.repository.GlitchJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class GlitchJobService {

    private final GlitchJobRepository jobRepository;
    private final OllamaService ollamaService;

    /**
     * Interprets the prompt via Ollama, saves effect params, returns the job.
     * Synchronous — Ollama is local and fast enough to not need async.
     */
    public GlitchJob createJob(String prompt) {
        GlitchJob job = new GlitchJob();
        job.setPrompt(prompt);
        job.setStatus(GlitchJob.JobStatus.PENDING);
        jobRepository.save(job);

        try {
            String effectParams = ollamaService.interpretPrompt(prompt);
            job.setEffectParams(effectParams);
            job.setStatus(GlitchJob.JobStatus.COMPLETED);
        } catch (Exception e) {
            log.error("Ollama interpretation failed for jobId={}", job.getId(), e);
            job.setStatus(GlitchJob.JobStatus.FAILED);
            job.setErrorMessage(e.getMessage());
        }

        return jobRepository.save(job);
    }

    public Optional<GlitchJob> findById(String id) {
        return jobRepository.findById(id);
    }
}
