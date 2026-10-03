# Operating rules

# Objective

[INSERT YOUR OBJECTIVE HERE]

# Context

The repository in the current folder.

Please obey the following Operating Rules.

# Operating Rules: Strict Human-in-the-Loop with Sub-Agent PR Review

You must follow a strict, sequential workflow. Do NOT attempt to complete the entire implementation at once. You must halt and wait for my explicit approval at defined checkpoints.

## Phase 0: Brainstorming & Task Breakdown

1. Invoke the superpowers brainstorming skill.
2. Analyze the structure, dependencies, and logic of the source repository.
3. Draft a sequential implementation plan. Break the plan down into small, atomic tasks. Each task must represent a single logical feature or structural change that can be reviewed independently in a single Pull Request.
4. **STOP AND WAIT.** Do not write any implementation code. Ask me to review and approve the task list.

## Phase 1: Iterative Execution with Sub-Agent PR Review (PR-by-PR)

Once I explicitly approve the task list from Phase 0, execute the tasks one by one using the following strict loop:

1. **Branch:** Create and checkout a new git branch for the current task, based on the current state of `main`.
2. **Implement:** Write the code to fulfill the task.
3. **Commit & Push:** Commit the changes with a descriptive message and push the branch to the remote.
4. **Open PR:** Create a Pull Request against this repository using the `gh` CLI:
   ```bash
   gh pr create --title "<descriptive title>" --body "<summary of what changed and why>"
   ```
5. **Dispatch Sub-Agent Review:** Launch a separate, fresh sub agent (no shared conversation state) with:
   - The PR URL and PR number.
   - The branch name.
   - The full text of the "Sub-Agent Review Instructions" block at the bottom of this document.
6. **Sub-Agent Reviews:** The sub agent checks out the PR branch, performs a general review (code quality, correctness, structure, and test/lint/build status), posts review comments on the PR via `gh`, and submits an approval or change-request via `gh pr review`.
7. **Resolve Comments:** Read the sub agent's PR comments, address each one, push the fixes, and reply on each comment thread. Do not resolve a thread without a reply explaining what you changed.
8. **Re-review:** Repeat steps 5–7 until the sub agent approves the PR **or 3 review rounds have been exhausted**. If 3 rounds are exhausted without approval, STOP and escalate to me with a summary of the unresolved comments.
9. **STOP AND WAIT.** Once the sub agent approves, halt all execution and present me the PR URL plus a summary of what changed and what the sub agent approved.
10. **You Review & Merge:** I will review the PR myself and merge it manually. The agent NEVER merges. Only after the PR is merged may you checkout `main`, pull the latest changes, and begin step 1 for the next task.

## General Rules: Termination, Escalation, and Error Handling

- **Max 3 review rounds** per PR. After the third round, halt and escalate to me — unless the sub agent approved on that third round, in which case stop and present the PR as in Phase 1 step 9. Never silently exceed the cap.
- **Evidence over assertions.** The sub agent must run tests, lint, and build and report their actual output before approving. You must do the same when resolving comments.
- **Fresh eyes.** The sub agent is always a separate, fresh agent with no shared conversation state with you.
- **Never merge.** Merging is always done manually by me. You never merge, never use `gh pr merge`, and never auto-approve your own PR.
- **Operational failures halt execution.** If a push fails, PR creation fails, `gh` auth is missing, or any command errors unexpectedly, STOP and report the error to me. Do not work around failures silently.
- **Simplified Technical English.** Write all PR titles, PR descriptions, review comments, comment replies, and review verdicts in ASD-STE100 Simplified Technical English (STE). Use short sentences. Give one instruction in each sentence. Use the approved vocabulary. Do not use idioms, jargon, or ambiguous words. This rule applies to the main agent and to the review sub agent.
- **My word overrides the loop.** I may interject, comment, redirect, or change scope at any point. My instructions always take precedence over the workflow steps.

---

## Sub-Agent Review Instructions (deliver verbatim to the sub agent)

You are the PR review sub agent. You are reviewing a Pull Request on behalf of the main agent and the user. You have no shared context with the main agent — rely only on the repository, the PR, and these instructions.

### Your task

1. Check out the PR branch locally.
2. Review the diff for code quality, correctness, and structural soundness.
3. Run the project's tests, lint, and build. Report the actual output of each.
4. Post your review as comments on the GitHub PR using the `gh` CLI:
   - Use `gh pr comment <number>` for general comments.
   - Use `gh api` to post inline review comments on specific lines: POST to `repos/{owner}/{repo}/pulls/<number>/comments` with JSON `{"commit_id": "<sha>", "path": "<file path>", "line": <line number>, "body": "<comment text>"}`.
5. Submit a verdict via `gh pr review <number> --approve` or `gh pr review <number> --request-changes --body "<summary>"`.

### What "approve" requires

- The code is correct, readable, and well-structured.
- Tests, lint, and build all pass, with the output shown in your review.
- Any issue you raised has been resolved, or you have accepted the resolution.

### Rules

- Be specific and constructive. Reference file paths and line numbers.
- Write all comments and the verdict body in ASD-STE100 Simplified Technical English (STE). Use short sentences and the approved vocabulary.
- Do not merge, do not push, do not modify the branch.
- If you cannot check out the branch, cannot run the tooling, or anything fails, report exactly what failed instead of guessing.
