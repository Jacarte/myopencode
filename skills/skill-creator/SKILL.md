---
name: skill-creator
description: Guide for creating effective OpenCode skills. Use when users want to create a new skill (or update an existing skill) that extends OpenCode's capabilities with specialized knowledge, workflows, or tool integrations.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: skill-development
---

# Skill Creator

This skill provides guidance for creating effective OpenCode skills.

## About Skills

Skills are modular, self-contained packages that extend OpenCode's capabilities by providing specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific domains or tasks—they transform OpenCode from a general-purpose agent into a specialized agent equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Skill File Locations

OpenCode searches for skills in these locations:
- Global config: `~/.config/opencode/skills/<name>/SKILL.md`
- Project config: `.opencode/skills/<name>/SKILL.md`
- Claude-compatible: `~/.claude/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`
- Agent-compatible: `~/.agents/skills/<name>/SKILL.md` or `.agents/skills/<name>/SKILL.md`

## Core Principles

### Concise is Key

The context window is a public good. Skills share it with system prompt, conversation history, other Skills' metadata, and the user request.

**Default assumption: OpenCode is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Does OpenCode really need this explanation?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match specificity to the task's fragility and variability:

- **High freedom (text-based instructions)**: Multiple approaches are valid, decisions depend on context, or heuristics guide the approach.
- **Medium freedom (pseudocode or scripts with parameters)**: A preferred pattern exists, some variation is acceptable, or configuration affects behavior.
- **Low freedom (specific scripts, few parameters)**: Operations are fragile/error-prone, consistency is critical, or a specific sequence must be followed.

Think of OpenCode as exploring a path: a narrow bridge with cliffs needs specific guardrails (low freedom), while an open field allows many routes (high freedom).

## Anatomy of a Skill

### SKILL.md (required)

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   ├── description: (required)
│   │   └── license/compatibility/metadata: (optional)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded into context as needed
    └── assets/           - Files used in output (templates, icons, etc.)
```

- **Frontmatter** (YAML): `name` and `description` are required. Only these two fields determine when the skill triggers — be clear and comprehensive about what the skill does and when it should be used.
- **Body** (Markdown): Instructions and guidance. Only loaded AFTER the skill triggers.

### Bundled Resources (optional)

#### Scripts (`scripts/`)

Executable code for tasks requiring deterministic reliability or repeatedly rewritten logic.

- **When to include**: Same code rewritten repeatedly, or deterministic reliability needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks
- **Benefits**: Token efficient, deterministic, may execute without loading into context

#### References (`references/`)

Documentation intended to be loaded as needed into context.

- **When to include**: Documentation OpenCode should reference while working
- **Examples**: `references/schema.md` for DB schemas, `references/api_docs.md` for API specs
- **Best practice**: If files are large (>10k words), include grep search patterns in SKILL.md
- **Avoid duplication**: Information lives in EITHER SKILL.md OR references, not both. Keep only essential procedural instructions in SKILL.md; move detailed reference material to references files.

#### Assets (`assets/`)

Files not loaded into context but used in output.

- **When to include**: Files used in the final output (templates, images, boilerplate)
- **Examples**: `assets/logo.png`, `assets/frontend-template/`, `assets/slides.pptx`
- **Benefits**: Separates output resources from documentation

### What NOT to Include

Do NOT create extraneous files:
- README.md, INSTALLATION_GUIDE.md, QUICK_REFERENCE.md, CHANGELOG.md, etc.

A skill should only contain information needed for an AI agent to do the job. No auxiliary context about creation process, setup/testing procedures, or user-facing documentation.

## Progressive Disclosure

Skills use a three-level loading system to manage context efficiently:

1. **Metadata (name + description)** — Always in context (~100 words)
2. **SKILL.md body** — When skill triggers (<5k words)
3. **Bundled resources** — As needed (unlimited; scripts can execute without reading into context)

Keep SKILL.md body under 500 lines. Split content into separate files when approaching this limit. When splitting, reference files from SKILL.md and describe clearly when to read them.

**Key principle:** When a skill supports multiple variations, frameworks, or options, keep only the core workflow and selection guidance in SKILL.md. Move variant-specific details into separate reference files.

### Pattern 1: High-level guide with references

```markdown
# PDF Processing

## Quick start
Extract text with pdfplumber: [code example]

## Advanced features
- **Form filling**: See [FORMS.md](FORMS.md) for complete guide
- **API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
```

OpenCode loads FORMS.md or REFERENCE.md only when needed.

### Pattern 2: Domain-specific organization

For skills with multiple domains, organize by domain:

```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── references/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    └── product.md (API usage, features)
```

Similarly, for skills supporting multiple frameworks:

```
cloud-deploy/
├── SKILL.md (workflow + provider selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

### Pattern 3: Conditional details

```markdown
# DOCX Processing

## Creating documents
Use docx-js for new documents. See [DOCX-JS.md](DOCX-JS.md).

## Editing documents
For simple edits, modify the XML directly.
**For tracked changes**: See [REDLINING.md](REDLINING.md)
```

**Guidelines:**
- **Avoid deeply nested references** — Keep references one level deep from SKILL.md
- **Structure longer reference files** — For files >100 lines, include a table of contents at the top

## Skill Creation Process

### Step 1: Understand the Skill with Concrete Examples

Skip only when usage patterns are already clearly understood.

Ask questions like:
- "What functionality should the skill support?"
- "Can you give examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

Avoid overwhelming users with too many questions at once. Start with the most important and follow up as needed.

### Step 2: Plan the Reusable Skill Contents

Analyze each example by:
1. Considering how to execute from scratch
2. Identifying what scripts, references, and assets would help when executing repeatedly

**Examples:**
- PDF rotation → `scripts/rotate_pdf.py` (same code rewritten each time)
- Frontend webapp builder → `assets/hello-world/` template (same boilerplate each time)
- BigQuery skill → `references/schema.md` (same schemas rediscovered each time)

### Step 3: Create the Skill Directory

```bash
mkdir -p ~/.config/opencode/skills/<skill-name>
```

Create subdirectories as needed:

```bash
mkdir -p ~/.config/opencode/skills/<skill-name>/{scripts,references,assets}
```

Remove any subdirectories not needed for the skill.

### Step 4: Write SKILL.md

#### Frontmatter

- `name`: Skill name (format: `^[a-z0-9]+(-[a-z0-9]+)*$`)
- `description`: Primary triggering mechanism. Include BOTH what the skill does AND specific triggers/contexts for when to use it. All "when to use" information goes here — not in the body (which loads only after triggering).
  - Example: `"Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. Use when working with .docx files for: (1) Creating new documents, (2) Modifying content, (3) Working with tracked changes, or any other document tasks"`
- `license`: Optional
- `compatibility`: Optional (e.g., `opencode`)
- `metadata`: Optional string-to-string map

#### Body

Write instructions using imperative/infinitive form. Include:
- How to use the skill and its bundled resources
- When to read specific reference files
- Any decision trees or workflows

### Step 5: Validate and Test

Ensure:
- SKILL.md is spelled in all caps
- Frontmatter includes `name` and `description`
- Skill names follow format: `^[a-z0-9]+(-[a-z0-9]+)*$`
- Description is 1-1024 characters
- Body is under 500 lines
- No extraneous files (README.md, CHANGELOG.md, etc.)

Test by using the skill on real tasks. For scripts, run them to verify correctness.

### Step 6: Iterate

After testing on real tasks:
1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Identify how SKILL.md or bundled resources should be updated
4. Implement changes and test again

## Permissions

Control skill access in `opencode.json`:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

- `allow`: Loads immediately
- `deny`: Hidden from agent
- `ask`: User prompted for approval
