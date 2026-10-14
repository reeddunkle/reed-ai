import type { Target } from "./domain.js";

const replacements = (target: Target) => {
  const agentName = target === "claude" ? "Claude" : "Codex";
  const projectSkillsDir = target === "claude" ? ".claude/skills" : ".codex/skills";
  const userSkillsDir = target === "claude" ? "~/.claude/skills" : "~/.codex/skills";

  return {
    "{{AGENT_NAME}}": agentName,
    "{{PROJECT_SKILLS_DIR}}": projectSkillsDir,
    "{{USER_SKILLS_DIR}}": userSkillsDir,
    ".claude/skills": projectSkillsDir,
    "~/.claude/skills": userSkillsDir,
  } as const;
};

export const renderForTarget = (contents: string, target: Target): string =>
  Object.entries(replacements(target)).reduce(
    (rendered, [token, value]) => rendered.replaceAll(token, value),
    contents,
  );
