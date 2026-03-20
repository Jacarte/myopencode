import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function runCommand(file: string, args: string[]): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    execFile(file, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        rejectRun(new Error(stderr || error.message))
        return
      }
      resolveRun(stdout)
    })
  })
}

function localApiPlugin(): Plugin {
  const configPath = resolve(process.cwd(), '../../oh-my-opencode.json')
  const benchmarkPath = resolve(process.cwd(), './data/benchmark-snapshot.json')

  return {
    name: 'openagents-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }

        res.setHeader('Content-Type', 'application/json')

        try {
          if (req.url === '/api/models') {
            const output = await runCommand('opencode', ['models', '--refresh'])
            const models = output
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.includes('/') && !line.startsWith('\u001b['))
            res.end(JSON.stringify({ models }))
            return
          }

          if (req.url === '/api/config') {
            const raw = await readFile(configPath, 'utf8')
            const config = JSON.parse(raw)
            res.end(JSON.stringify({ config }))
            return
          }

          if (req.url === '/api/benchmarks') {
            const raw = await readFile(benchmarkPath, 'utf8')
            const snapshot = JSON.parse(raw)
            res.end(JSON.stringify({ snapshot }))
            return
          }

          if (req.url === '/api/benchmarks/refresh') {
            await runCommand('npm', ['run', 'benchmarks:update'])
            const raw = await readFile(benchmarkPath, 'utf8')
            const snapshot = JSON.parse(raw)
            res.end(JSON.stringify({ snapshot }))
            return
          }

          res.statusCode = 404
          res.end(JSON.stringify({ error: `Unknown endpoint: ${req.url}` }))
        } catch (error) {
          res.statusCode = 500
          const message = error instanceof Error ? error.message : 'Unknown API error.'
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
})
