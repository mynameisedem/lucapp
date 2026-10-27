import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4173' },
  webServer: { command: 'VITE_GOOGLE_CLIENT_ID=e2e-client npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
})
