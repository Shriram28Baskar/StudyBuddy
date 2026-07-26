# Contributing to StudyBuddy

First off, thank you for taking the time to contribute! 🎉

StudyBuddy is a flagship portfolio project built to demonstrate high-quality, production-ready software engineering. To maintain this standard, all contributions must adhere to the guidelines below.

## 🛠️ How to Contribute

### 1. Branching Strategy
We use a standard feature-branch workflow.
- **`main`**: The stable, production-ready branch. Do not commit directly to `main`.
- **Feature Branches**: Branch off `main` using descriptive names:
  - `feat/add-quiz-battle`
  - `fix/firebase-auth-bug`
  - `docs/update-readme`

### 2. Making Changes
- Ensure your code follows the established architectural boundaries. (e.g., Do not place business logic inside FastAPI route definitions; put it in `services/`).
- Do not introduce new heavy system dependencies unless absolutely necessary.
- Ensure no API keys or secrets are committed.

### 3. Testing Your Code
All new code must pass the automated testing pipelines before being merged.
- **Frontend changes**: Run `npm run test` in the `/frontend` directory to ensure Vitest passes.
- **Backend changes**: Run `python -m pytest` in the `/backend` directory.

### 4. Opening a Pull Request
- Push your branch to GitHub.
- Open a PR against the `main` branch.
- In the PR description, summarize the changes, why they are necessary, and confirm that tests have passed.
- The GitHub Actions CI pipeline will automatically run against your PR. If it fails, please fix the issues before requesting a review.

## 🐛 Reporting Bugs
If you find a bug, please open an Issue on GitHub with:
1. A clear description of the problem.
2. Steps to reproduce the issue.
3. Your operating system, Node version, and Python version.

## 💡 Feature Requests
Feature requests are welcome! Please open an Issue and outline the problem your feature solves and how it aligns with the core vision of StudyBuddy as an AI-powered Personal Learning Brain.
