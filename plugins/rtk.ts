export const RtkOpenCodePlugin = async ({ $ }) => {
  let rtkState: "unknown" | "available" | "missing" = "unknown"
  let warnedMissing = false

  return {
    "tool.execute.before": async (input, output) => {
      if (rtkState === "missing") return

      const tool = String(input?.tool ?? "").toLowerCase()
      if (tool !== "bash" && tool !== "shell") return

      const args = output?.args
      if (!args || typeof args !== "object") return

      const command = (args as Record<string, unknown>).command
      if (typeof command !== "string" || !command) return

      try {
        const result = await $`rtk rewrite ${command}`.quiet().nothrow()
        if (result.exitCode !== 0) {
          if (result.exitCode === 127 || result.stderr.includes("not found")) {
            rtkState = "missing"
            if (!warnedMissing) {
              console.warn("[rtk] rtk binary not found in PATH — plugin disabled")
              warnedMissing = true
            }
          }
          return
        }

        rtkState = "available"
        const rewritten = String(result.stdout).trim()
        if (rewritten && rewritten !== command) {
          ;(args as Record<string, unknown>).command = rewritten
        }
      } catch {
        return
      }
    },
  }
}
