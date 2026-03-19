export interface TaskTemplate {
  name: string;
  prompt: string;
  icon: string;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    icon: "📦",
    name: "Update Dependencies",
    prompt: "Run `npm outdated` to see which packages are outdated. Update all dependencies to their latest compatible versions in package.json. Run `npm install`. If a test script exists, run `npm test` and fix any failures caused by the updates.",
  },
  {
    icon: "📝",
    name: "Generate Changelog",
    prompt: "Read the git log since the last tag using `git log $(git describe --tags --abbrev=0)..HEAD --oneline`. Write a CHANGELOG.md entry (or update the existing one) summarizing all commits grouped by type: Features (feat:), Bug Fixes (fix:), and Other. Use today's date as the version header.",
  },
  {
    icon: "🔧",
    name: "Fix Lint Errors",
    prompt: "Run the linter with `npm run lint` (or `npx eslint .` if no script exists). Read each file with reported errors and fix them. Do not change any logic — only fix lint/formatting issues. Run the linter again to confirm all issues are resolved.",
  },
  {
    icon: "🧪",
    name: "Write Missing Tests",
    prompt: "Identify functions or modules in the codebase that have no test coverage. Prioritize core business logic. Write unit tests using the existing test framework (check package.json for jest, vitest, etc.). Cover the happy path and at least one error/edge case per function. Run the tests and fix any failures.",
  },
  {
    icon: "🔒",
    name: "Security Audit",
    prompt: "Run `npm audit` and review the output. For any high or critical vulnerabilities, attempt to fix them with `npm audit fix`. Read the affected files and check for common security issues: hardcoded secrets, SQL injection, unvalidated inputs, exposed API keys. Report findings and fix what you can safely auto-fix.",
  },
  {
    icon: "📚",
    name: "Add JSDoc Comments",
    prompt: "Read through the source files and identify exported functions, classes, and interfaces that are missing JSDoc comments. Add concise JSDoc comments describing what each does, its parameters, and return value. Do not change any logic.",
  },
  {
    icon: "🌿",
    name: "Clean Up Dead Code",
    prompt: "Search the codebase for unused variables, imports, functions, and files. Use `npx ts-prune` or similar if available, otherwise grep for exports that have no imports. Remove dead code that is clearly unused. Do not remove anything that might be needed externally (check if it's exported from an index file).",
  },
  {
    icon: "⚡",
    name: "Performance Check",
    prompt: "Review the codebase for obvious performance issues: N+1 queries, missing async/await, synchronous file I/O in hot paths, large bundle imports, missing memoization in React components. Report findings and fix the most impactful issues.",
  },
];
