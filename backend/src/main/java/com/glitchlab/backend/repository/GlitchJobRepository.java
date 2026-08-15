package com.glitchlab.backend.repository;

import com.glitchlab.backend.model.GlitchJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GlitchJobRepository extends JpaRepository<GlitchJob, String> {
}
