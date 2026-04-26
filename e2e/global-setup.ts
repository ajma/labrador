import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { MockDockerService } from "./mocks/docker.mock.js";
import { MockCloudflareApiService } from "./mocks/cloudflare-api.mock.js";
import { MockCaddyProvider } from "./mocks/caddy.mock.js";
import { MockCloudflareProvider } from "./mocks/cloudflare-provider.mock.js";
import { seedDatabase } from "./helpers/seed.js";
import { setServer } from "./server-singleton.js";

export default async function globalSetup() {
  const dbFilePath = join(tmpdir(), `labrador-test-${randomUUID()}.db`);
  const composeDirPath = join(
    tmpdir(),
    `labrador-test-compose-${randomUUID()}`,
  );

  // Set PROJECTS_DIR before dynamically importing server modules so that the
  // module-level constant in project.service.ts and deploy.service.ts picks
  // up the temp directory instead of the production default (/data/projects).
  process.env.PROJECTS_DIR = composeDirPath;

  const { createTestServer } = await import("../src/server/test-server.js");

  const mocks = {
    dockerService: new MockDockerService(),
    cloudflareApiService: new MockCloudflareApiService(),
    caddyProvider: new MockCaddyProvider(),
    cloudflareProvider: new MockCloudflareProvider(),
  };

  const { app, db } = await createTestServer({
    port: 3001,
    dbUrl: `file:${dbFilePath}`,
    mocks,
  });
  await seedDatabase(db);
  setServer(app, dbFilePath, composeDirPath);
}
