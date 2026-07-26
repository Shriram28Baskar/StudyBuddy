# Release Notes

## [v1.0.1] - Stable Release Candidate
**Date:** July 2026

StudyBuddy officially transitions from a hackathon prototype into a production-ready, flagship portfolio project.

### 🏗️ Architectural Refactoring
- **Separation of Concerns:** Deeply refactored the backend. The core analytical intelligence (AI plan generation, performance evaluation, and prompt generation) was extracted from the HTTP routers into isolated `services/` modules (`study_plan_engine.py` and `prompts/study_plan_prompts.py`).
- **Dependency Modernization:** Replaced the deprecated `PyPDF2` library with `pypdf` globally across the backend to remove deprecation warnings and improve parsing speed.
- **Test Suite Normalization:** Renamed `tests_routes.py` to `test_routes.py` to conform to standard Pytest auto-discovery rules, enabling 0-config test execution.

### 🛡️ Security Hardening
- **Client-Side Secrets Eliminated:** Purged all instances of `VITE_GROQ_API_KEY` from the React frontend. All LLM requests are now strictly proxied through the authenticated FastAPI backend.
- **API Lockdown:** Enforced `verify_firebase_token` dependency on all critical backend routes to prevent unauthenticated access to the LLM engines.

### 🚀 Production Engineering (Phase 2)
- **CI/CD Automation:** Introduced `.github/workflows/ci.yml` to automatically run `python -m pytest` and `npm run build` on every push to the main branch.
- **Docker Compose:** Implemented a multi-stage `Dockerfile` architecture. 
  - The frontend is now compiled statically and served via a lightning-fast Nginx reverse proxy.
  - The backend uses a lean `python:3.11-slim` container, explicitly omitting heavy OS video dependencies to prioritize the core RAG/LLM application speed.
- **Frontend Testing:** Integrated `Vitest` and React Testing Library. Established the first automated test suite verifying the `Zustand` global state management behavior.

### 🧹 Code Quality
- **Dead Code Eradication:** Performed a repository-wide purge of orphaned components, unused state variables, unused imports, and deprecated UI mockups.
- **Consolidation:** Unified 4 separate Study Plan interfaces into a single, cohesive modular experience.
- **Zero TODOs:** Addressed and resolved all technical debt placeholders and `FIXME` comments.

---

## [v0.1.0] - Initial Prototype
**Date:** Early 2026

- Initial hackathon build.
- Demonstrated core proof-of-concept features: Document Upload, RAG, Quiz Battle, and Adaptive Study Plans.
- Heavily tightly-coupled architecture prioritizing speed of delivery over maintainability.
