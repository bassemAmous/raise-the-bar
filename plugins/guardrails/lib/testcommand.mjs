// Which command runs a project's tests: the one in the config, or a guess from the files present.
import fs from "node:fs";
import path from "node:path";

export function detectTestCommand(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  const windows = process.platform === "win32";
  if (has("package.json")) {
    try {
      const script = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts?.test;
      if (script && !/no test specified/.test(script)) {
        if (has("pnpm-lock.yaml")) return "pnpm test";
        if (has("yarn.lock")) return "yarn test";
        if (has("bun.lockb") || has("bun.lock")) return "bun test";
        return "npm test";
      }
    } catch {
      // An unreadable package.json is not a reason to guess a command.
    }
  }
  if (has("Makefile") && /^test:/m.test(fs.readFileSync(path.join(root, "Makefile"), "utf8"))) return "make test";
  if (has("go.mod")) return "go test ./...";
  if (has("Cargo.toml")) return "cargo test";
  if (has("pytest.ini") || has("tox.ini") || (has("pyproject.toml") && has("tests")))
    return windows ? "python -m pytest" : "python3 -m pytest";
  if (has("gradlew")) return windows ? "gradlew.bat test" : "./gradlew test";
  if (has("pom.xml")) return "mvn -q test";
  return null;
}

export function testCommandFor(config, root) {
  return config.tests.command ?? detectTestCommand(root);
}
